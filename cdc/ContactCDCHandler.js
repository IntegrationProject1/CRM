require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");

/**
 * Converteert een microsecond timestamp naar ISO string met 6 decimalen
 * @param {number} timestamp - Timestamp in microseconden (16 cijfers)
 * @returns {string} Geformatteerde ISO string
 */
function formatMicroTimestamp(timestamp) {
   const milliseconds = Math.floor(timestamp / 1000);
   const microseconds = timestamp % 1000;
   const iso = new Date(milliseconds).toISOString();
   return iso.replace(/\.\d{3}Z$/, `.${String(microseconds).padStart(3, '0')}000Z`);
}

/**
 * Genereert een huidige timestamp met microseconden precisie
 * @returns {number} Timestamp in microseconden (16 cijfers)
 */
function generateMicroTimestamp() {
   const now = Date.now();
   const randomMicro = Math.floor(Math.random() * 1000);
   return now * 1000 + randomMicro;
}

/**
 * @module ContactCDCHandler
 * @description Verwerkt Salesforce CDC-berichten voor Contact-objecten en publiceert ze naar RabbitMQ.
 * @param {Object} message - Het Salesforce CDC-bericht.
 * @param {Object} sfClient - De Salesforce-client voor interactie met Salesforce.
 * @param {Object} RMQChannel - Het RabbitMQ-kanaal voor het publiceren van berichten.
 * @returns {Promise<void>}
 */

module.exports = async function ContactCDCHandler(message, sfClient, RMQChannel) {
   const { ChangeEventHeader, ...cdcObjectData } = message.payload;

   if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
      console.log("🚫 Salesforce API call gedetecteerd, actie overgeslagen.");
      return;
   }

   const action = ChangeEventHeader.changeType;
   console.log('📥 Salesforce CDC Contact Event ontvangen:', action, cdcObjectData);

   let recordId;
   if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) return console.error('❌ Geen recordId gevonden.');
   }

   let UUIDTimeStamp;
   let JSONMsg;
   let xmlMessage;
   let xsdPath;

   switch (action) {
      case 'CREATE':
         UUIDTimeStamp = generateMicroTimestamp();

         try {
            await sfClient.updateUser(recordId, { UUID__c: UUIDTimeStamp });
            console.log("✅ UUID succesvol bijgewerkt");
         } catch (err) {
            console.error("❌ Fout bij instellen UUID:", err.message);
            return;
         }

         JSONMsg = {
            "UserMessage": {
               "ActionType": action,
               "UUID": formatMicroTimestamp(UUIDTimeStamp),
               "TimeOfAction": formatMicroTimestamp(generateMicroTimestamp()),
               "EncryptedPassword": "",
               "FirstName": cdcObjectData.Name.FirstName || "",
               "LastName": cdcObjectData.Name.LastName || "",
               "PhoneNumber": cdcObjectData.Phone || "",
               "EmailAddress": cdcObjectData.Email || ""
            }
         };

         xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
         xsdPath = './xsd/userXSD/UserCreate.xsd';
         break;

      case 'UPDATE':
         const updatedRecord = await sfClient.sObject('Contact').retrieve(recordId);
         if (!updatedRecord?.UUID__c) {
            console.error("❌ Geen UUID gevonden voor recordId:", recordId);
            return;
         }

         UUIDTimeStamp = updatedRecord.UUID__c;

         JSONMsg = {
            "UserMessage": {
               "ActionType": action,
               "UUID": formatMicroTimestamp(UUIDTimeStamp),
               "TimeOfAction": formatMicroTimestamp(generateMicroTimestamp()),
               "EncryptedPassword": updatedRecord.Password__c || "",
               "FirstName": updatedRecord.FirstName || "",
               "LastName": updatedRecord.LastName || "",
               "PhoneNumber": updatedRecord.Phone || "",
               "EmailAddress": updatedRecord.Email || ""
            }
         };

         xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
         xsdPath = './xsd/userXSD/UserUpdate.xsd';
         break;

      case 'DELETE':
         const query = sfClient.sObject('Contact')
             .select('UUID__c, Id')
             .where({ Id: recordId, IsDeleted: true })
             .limit(1)
             .scanAll(true);

         const resultDel = await query.run();
         UUIDTimeStamp = resultDel[0]?.UUID__c || null;

         if (!UUIDTimeStamp) {
            console.error("❌ Geen UUID gevonden voor verwijderde record:", recordId);
            return;
         }

         JSONMsg = {
            "UserMessage": {
               "ActionType": action,
               "UUID": formatMicroTimestamp(UUIDTimeStamp),
               "TimeOfAction": formatMicroTimestamp(generateMicroTimestamp())
            }
         };

         xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
         xsdPath = './xsd/userXSD/UserDelete.xsd';
         break;

      default:
         console.warn("⚠️ Niet gehandelde actie:", action);
         return;
   }

   // XML Validatie
   if (!validator.validateXml(xmlMessage, xsdPath)) {
      console.error(`❌ XML ${action} niet geldig tegen XSD`);
      return;
   }

   // RabbitMQ publishing
   const exchangeName = 'user';
   await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

   const targetBindings = [
      `frontend.user.${action.toLowerCase()}`,
      `facturatie.user.${action.toLowerCase()}`,
      `kassa.user.${action.toLowerCase()}`
   ];

   for (const routingKey of targetBindings) {
      RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
      console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
   }
};