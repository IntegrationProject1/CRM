require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const hrtimeBase = process.hrtime.bigint();

/**
 * Generates the current ISO 8601 timestamp with microsecond precision.
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
 */
module.exports = async function ContactCDCHandler(message, sfClient, RMQChannel) {
   const { ChangeEventHeader, ...cdcObjectData } = message.payload;

   // ✅ Alleen in productie negeren we events afkomstig van onze eigen API-calls
   const ignoreOrigin = process.env.IGNORE_CDC_API_ORIGIN === 'true';
   if (!ignoreOrigin && ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
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

   let UUID;
   let JSONMsg;
   let xmlMessage;
   let xsdPath;

   try {
      switch (action) {
         case 'CREATE':
            UUID = generateMicroDateTime();
            await sfClient.updateUser(recordId, { UUID__c: UUID });
            console.log("✅ UUID succesvol bijgewerkt:", UUID);

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
               throw new Error(`Geen UUID gevonden voor record: ${recordId}`);
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
               throw new Error(`Geen UUID gevonden voor verwijderd record: ${recordId}`);
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
            console.warn("⚠️ Niet gehandelde actie:", action);
            return;
      }

      xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
      if (!validator.validateXml(xmlMessage, xsdPath)) {
         throw new Error(`XML validatie gefaald voor actie: ${action}`);
      }

      const exchangeName = 'user';
      await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

      const routingKeys = [
         `frontend.user.${action.toLowerCase()}`,
         `facturatie.user.${action.toLowerCase()}`,
         `kassa.user.${action.toLowerCase()}`
      ];

      for (const routingKey of routingKeys) {
         RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
         console.log(`📤 Bericht verstuurd naar ${exchangeName} (${routingKey})`);
      }

   } catch (error) {
      console.error(`❌ Kritieke fout tijdens ${action} actie:`, error.message);
      if (error.response?.body) {
         console.error('Salesforce API fout details:', error.response.body);
      }
   }
};
