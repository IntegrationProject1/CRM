require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const hrtimeBase = process.hrtime.bigint();

/**
 * @fileoverview Functies voor het genereren en formatteren van microseconden-precieze timestamps
 * @module TimestampUtils
 */

/**
 * Genereert een hoog-precisie timestamp met microseconden resolutie
 * @returns {number} Microseconden timestamp (16 cijfers: millis + micros)
 * @example
 * const ts = generateMicroTimestamp(); // 1746638069480652
 * @description
 * Combineert Date.now() milliseconden met process.hrtime() nanoseconden
 * om een unieke 16-cijferige timestamp te maken:
 * - Eerste 13 cijfers: UNIX milliseconden
 * - Laatste 3 cijfers: microseconden (0-999)
 * @see {@link https://nodejs.org/api/process.html#processhrtimebigint process.hrtime() documentatie}
 */

function generateMicroTimestamp() {
   const now = Date.now();
   const diffNs = process.hrtime.bigint() - hrtimeBase;
   const micros = Number((diffNs / 1000n) % 1000000n);
   return now * 1000 + micros;
}

/**
 * Formatteert een microseconden-timestamp naar ISO 8601 met 6 decimalen
 * @param {number} timestamp - Microseconden timestamp (van generateMicroTimestamp)
 * @returns {string} ISO 8601 datumtijd string met microseconden
 * @example
 * formatMicroTimestamp(1746638069480652);
 * // "2025-05-07T17:14:29.480652Z"
 * @throws {TypeError} Als de input niet numeriek is
 * @description
 * Converteert de timestamp in twee stappen:
 * 1. Splitst in millis (eerste 13 cijfers) en micros (laatste 3 cijfers)
 * 2. Combineert met Date's ISO string voor correcte tijdzone afhandeling
 */
function formatMicroTimestamp(timestamp) {
   const millis = Math.floor(timestamp / 1000);
   const micros = timestamp % 1000;
   const date = new Date(millis);
   return date.toISOString()
       .replace(/\.\d{3}Z$/, `.${date.getUTCMilliseconds().toString().padStart(3, '0')}${micros.toString().padStart(3, '0')}Z`);
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
   console.log('📥 Salesforce CDC Contact Event ontvangen:', action);

   let recordId;
   if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) return console.error('❌ Geen recordId gevonden.');
   }

   let UUIDTimeStamp;
   let JSONMsg;
   let xmlMessage;
   let xsdPath;

   try {
      switch (action) {
         case 'CREATE':
            UUIDTimeStamp = generateMicroTimestamp();
            await sfClient.updateUser(recordId, { UUID__c: UUIDTimeStamp.toString() });
            console.log("✅ UUID succesvol bijgewerkt:", UUIDTimeStamp);

            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: formatMicroTimestamp(UUIDTimeStamp),
                  TimeOfAction: formatMicroTimestamp(generateMicroTimestamp()),
                  EncryptedPassword: "",
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
            UUIDTimeStamp = updatedRecord.UUID__c;

            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: formatMicroTimestamp(UUIDTimeStamp),
                  TimeOfAction: formatMicroTimestamp(generateMicroTimestamp()),
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
            UUIDTimeStamp = deletedRecord.UUID__c;

            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: formatMicroTimestamp(UUIDTimeStamp),
                  TimeOfAction: formatMicroTimestamp(generateMicroTimestamp())
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

