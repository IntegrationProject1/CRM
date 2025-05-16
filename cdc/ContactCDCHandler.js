require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const hrtimeBase = process.hrtime.bigint();
const {user_logger} = require("../utils/logger");

/**
 * Generates a microsecond timestamp in ISO 8601 format.
 * @returns {string}
 */
function generateMicroDateTime() {
   const diffNs = process.hrtime.bigint() - hrtimeBase;
   const micros = Number((diffNs / 1000n) % 1000000n);
   const timestamp = Date.now() * 1000 + micros;
   const millis = Math.floor(timestamp / 1000);
   const now = new Date(millis);
   const micros2 = timestamp % 1000;
   return now.toISOString().replace('Z', micros2.toString().padStart(3, '0') + 'Z');
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
      user_logger.info("Salesforce API call gedetecteerd, actie overgeslagen.");
      // console.log("🚫 Salesforce API call gedetecteerd, actie overgeslagen.");
      return;
   }

   const action = ChangeEventHeader.changeType;
   user_logger.info('Salesforce CDC Contact Event ontvangen:', action, cdcObjectData);
   // console.log('📥 Salesforce CDC Contact Event ontvangen:', action, cdcObjectData);

   let recordId;
   if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      // if (!recordId) return console.error('❌ Geen recordId gevonden.');
      if (!recordId) return user_logger.error('Geen recordId gevonden.');
   }

   let UUID;
   let JSONMsg;
   let xmlMessage;
   let xsdPath;

   try {
      switch (action) {
         case 'CREATE':
            UUID = generateMicroDateTime().toString();
            await sfClient.updateUser(recordId, { UUID__c: UUID });
            user_logger.info('UUID succesvol bijgewerkt:', UUID);
            // console.log("✅ UUID succesvol bijgewerkt:", UUID);

            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: UUID,
                  TimeOfAction: new Date().toISOString(),
                  EncryptedPassword: cdcObjectData.Password__c || "",
                  FirstName: cdcObjectData.Name?.FirstName || "",
                  LastName: cdcObjectData.Name?.LastName || "",
                  PhoneNumber: cdcObjectData.Phone || "",
                  EmailAddress: cdcObjectData.Email || ""
               }
            };
            xsdPath = './xsd/userXSD/UserCreate.xsd';
            break;

         case 'UPDATE':
            const updatedRecord = await sfClient.sObject('Contact').retrieve(recordId);
            if (!updatedRecord?.UUID__c) {
               // throw new Error(`Geen UUID gevonden voor record: ${recordId}`);
                user_logger.error(`Geen UUID gevonden voor record: ${recordId}`);
                return;
            }

            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: updatedRecord.UUID__c,
                  TimeOfAction: new Date().toISOString(),
                  EncryptedPassword: updatedRecord.Password__c || "",
                  FirstName: updatedRecord.FirstName || "",
                  LastName: updatedRecord.LastName || "",
                  PhoneNumber: updatedRecord.Phone || "",
                  EmailAddress: updatedRecord.Email || ""
               }
            };
            xsdPath = './xsd/userXSD/UserUpdate.xsd';
            break;

         case 'DELETE':
            const query = sfClient.sObject('Contact')
                .select('UUID__c')
                .where({ Id: recordId, IsDeleted: true })
                .limit(1)
                .scanAll(true);

            const resultDel = await query.run();
            const deletedRecord = resultDel[0];

            if (!deletedRecord?.UUID__c) {
               // throw new Error(`Geen UUID gevonden voor verwijderd record: ${recordId}`);
             user_logger.error(`Geen UUID gevonden voor verwijderd record: ${recordId}`);
             return;
            }

            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: deletedRecord.UUID__c,
                  TimeOfAction: new Date().toISOString(),
               }
            };
            xsdPath = './xsd/userXSD/UserDelete.xsd';
            break;

         default:
            user_logger.warning(" Niet gehandelde actie:", action);
            // console.warn("⚠️ Niet gehandelde actie:", action);
            return;
      }

      xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
      if (!validator.validateXml(xmlMessage, xsdPath)) {
         // throw new Error(`XML validatie gefaald voor actie: ${action}`);
         user_logger.error('XML validatie gefaald voor actie:', action);
         return;
      }

      const exchangeName = 'user';
      await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

      const routingKeys = [
         `frontend.user.${action.toLowerCase()}`,
         `facturatie.user.${action.toLowerCase()}`,
         `kassa.user.${action.toLowerCase()}`
      ];

      for (const routingKey of routingKeys) {
         user_logger.debug('Debugging exchangeName and routingKey:', exchangeName, routingKey);
         RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
         user_logger.info('Bericht verstuurd naar:', exchangeName, routingKey);
         // console.log(`📤 Bericht verstuurd naar ${exchangeName} (${routingKey})`);
      }

   } catch (error) {
      user_logger.error(`❌ Kritieke fout tijdens ${action} actie:`, error.message);
      // console.error(`❌ Kritieke fout tijdens ${action} actie:`, error.message);
      if (error.response?.body) {
         // console.error('Salesforce API fout details:', error.response.body);
         user_logger.error('Salesforce API fout details:', error.response.body);
      }
   }
};
