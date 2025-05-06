require('dotenv').config();
const {jsonToXml} = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");

/**
 * @module ContactCDCHandler
 * @description Verwerkt Salesforce CDC-berichten voor Contact-objecten en publiceert ze naar RabbitMQ.
 * @param {Object} message - Het Salesforce CDC-bericht.
 * @param {Object} sfClient - De Salesforce-client voor interactie met Salesforce.
 * @param {Object} RMQChannel - Het RabbitMQ-kanaal voor het publiceren van berichten.
 * @returns {Promise<void>}
 */
module.exports = async function ContactCDCHandler(message, sfClient, RMQChannel) {
   const {ChangeEventHeader, ...cdcObjectData} = message.payload;

   if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") { // API call CDC event negeren
      console.log("🚫 Salesforce API call gedetecteerd, actie overgeslagen.");
      return;
   }

   const action = ChangeEventHeader.changeType;

   console.log('📥 Salesforce CDC Contact Event ontvangen:', action, cdcObjectData);

   // if (['UPDATE'].includes(action)) {
   //   console.log("chenged fields:", ChangeEventHeader.changedFields)
   // }
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
         UUIDTimeStamp = new Date().getTime();

         try {
            await sfClient.updateUser(recordId, {UUID__c: UUIDTimeStamp});
            console.log("✅ UUID succesvol bijgewerkt");
         } catch (err) {
            console.error("❌ Fout bij instellen UUID:", err.message);
            return;
         }

         JSONMsg = {
            "UserMessage": {
               "ActionType": action,
               "UUID": new Date(UUIDTimeStamp).toISOString(),
               "TimeOfAction": new Date().toISOString(),
               "EncryptedPassword": "", // verplicht veld volgens ons XSD stuctuur
               "FirstName": cdcObjectData.Name.FirstName || "",
               "LastName": cdcObjectData.Name.LastName || "",
               "PhoneNumber": cdcObjectData.Phone || "",
               "EmailAddress": cdcObjectData.Email || ""
            }
         };

         xmlMessage = jsonToXml(JSONMsg.UserMessage, {rootName: 'UserMessage'});
         xsdPath = './xsd/userXSD/UserCreate.xsd';

         if (!validator.validateXml(xmlMessage, xsdPath)) {
            console.error('❌ XML Create niet geldig tegen XSD');
            return;
         }
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
               "UUID": new Date(UUIDTimeStamp).toISOString(),
               "TimeOfAction": new Date().toISOString(),
               "EncryptedPassword": updatedRecord.Password__c || "",
               "FirstName": updatedRecord.FirstName || "",
               "LastName": updatedRecord.LastName || "",
               "PhoneNumber": updatedRecord.Phone || "",
               "EmailAddress": updatedRecord.Email || ""
            }
         };

         xmlMessage = jsonToXml(JSONMsg.UserMessage, {rootName: 'UserMessage'});
         xsdPath = './xsd/userXSD/UserUpdate.xsd';

         if (!validator.validateXml(xmlMessage, xsdPath)) {
            console.error('❌ XML Update niet geldig tegen XSD');
            return;
         }
         break;

      case 'DELETE':
         const query = sfClient.sObject('Contact')
            .select('UUID__c, Id')
            .where({Id: recordId, IsDeleted: true})
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
               "UUID": new Date(UUIDTimeStamp).toISOString(),
               "TimeOfAction": new Date().toISOString()
            }
         };

         xmlMessage = jsonToXml(JSONMsg.UserMessage, {rootName: 'UserMessage'});
         xsdPath = './xsd/userXSD/UserDelete.xsd';

         if (!validator.validateXml(xmlMessage, xsdPath)) {
            console.error('❌ XML Delete niet geldig tegen XSD');
            return;
         }
         break;

      default:
         console.warn("⚠️ Niet gehandelde actie:", action);
         return;
   }

   const actionLower = action.toLowerCase();

   // console.log('📤 Salesforce Converted Message:', JSON.stringify(JSONMsg, null, 2));

   const exchangeName = 'user';

   await RMQChannel.assertExchange(exchangeName, 'topic', {durable: true});

   const targetBindings = [
      `frontend.user.${actionLower}`,
      `facturatie.user.${actionLower}`,
      `kassa.user.${actionLower}`
   ];

   for (const routingKey of targetBindings) {
      RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
      console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
   }
}