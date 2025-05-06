/**
 * @module UserConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van gebruikers in Salesforce.
 */

const libxmljs = require('libxmljs2');
const xmlJsonTranslator = require("../utils/xmlJsonTranslator");

/**
 * Start de UserConsumer om berichten van RabbitMQ-queues te verwerken.
 * @param {Object} channel - Het RabbitMQ-kanaal voor het consumeren van berichten.
 * @param {Object} salesforceClient - De Salesforce-client voor interactie met Salesforce.
 * @returns {Promise<void>} - Een belofte die wordt vervuld wanneer de consumer is gestart.
 */
module.exports = async function StartUserConsumer(channel, salesforceClient) {

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_user_${action}`, {durable: true});

      await channel.consume(`crm_user_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         console.log(`📥 [${action}UserConsumer] Ontvangen`);

         // convert XML to JSON
         let jsonConv;
         try {
            jsonConv = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            console.error('❌ Ongeldig XML formaat:', content);
            return;
         }

         if (!jsonConv.UserMessage) {
            channel.nack(msg, false, false);
            console.error("❌ Ongeldig formaat:", jsonConv);
            return;
         }
         const objectData = jsonConv.UserMessage;

         // Convert UUID to timestamp (number) for Salesforce
         const UUIDTimeStamp = new Date(objectData.UUID).getTime();

         let SalesforceObjId;
         if (['update', 'delete'].includes(action)) {
            // retrieve Salesforce ID from UUID
            const results = await salesforceClient
            .sObject('Contact')
            .select('Id, UUID__c')
            .where({ UUID__c: UUIDTimeStamp })
            .execute();
          

            let result;
            try {
               result = await query.run();
            } catch (err) {
               channel.nack(msg, false, false);
               console.error("❌ Fout bij ophalen Salesforce ID:", err.message);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               console.error("❌ Geen Salesforce ID gevonden voor UUID:", objectData.UUID);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         if (!objectData.UUID) {
            channel.nack(msg, false, false);
            console.error("❌ UUID ontbreekt in het bericht");
            return;
         }

         let JSONMsg;

         switch (action) {
            case "create":
               try {
                  JSONMsg = {
                     "UUID__c": UUIDTimeStamp, // Convert to timestamp (number) for Salesforce
                     "TimeOfAction__c": objectData.TimeOfAction__c,
                     "Password__c": objectData.EncryptedPassword || "",
                     "FirstName": objectData.FirstName || "",
                     "LastName": objectData.LastName || "",
                     "Phone": objectData.Phone || "",
                     "Email": objectData.Email || "",
                     // "Business": { // Is nog niet in SalesForce  verwerkt
                     //    "BusinessName": objectData.BusinessName || "",
                     //    "BusinessEmail": objectData.BusinessEmail || "",
                     //    "RealAddress": objectData.RealAddress || "",
                     //    "BTWNumber": objectData.BTWNumber || "",
                     //    "FacturationAddress": objectData.FacturationAddress || ""
                     // }
                  };

                  await salesforceClient.createUser(JSONMsg);
                  console.log("✅ Gebruiker aangemaakt in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij create:", err.message);
                  return;
               }
               break;

            case "update":
               try {
                  JSONMsg = {
                     "TimeOfAction__c": objectData.TimeOfAction__c,
                     "Password__c": objectData.EncryptedPassword || "",
                     "FirstName": objectData.FirstName || "",
                     "LastName": objectData.LastName || "",
                     "Phone": objectData.Phone || "",
                     "Email": objectData.Email || "",
                  };

                  await salesforceClient.updateUser(SalesforceObjId, JSONMsg);
                  console.log("✅ Gebruiker geüpdatet in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij update:", err.message);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.deleteUser(SalesforceObjId);
                  console.log("✅ Gebruiker verwijderd uit Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij delete:", err.message);
                  return;
               }
               break;

            default:
               channel.nack(msg, false, false);
               console.error(`❌ Ongeldige queue: ${action}`);
               return;
         }

         await channel.ack(msg);
      });

      console.log(`🔔 Listening for messages on queue "crm_user_${action}"…`);
   }
};
