/**
 * @module SessionConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van sessies in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");

/**
 * Start de SessionConsumer om berichten van RabbitMQ-queues te verwerken.
 * @param {Object} channel - Het RabbitMQ-kanaal voor het consumeren van berichten.
 * @param {Object} salesforceClient - De Salesforce-client voor interactie met Salesforce.
 * @returns {Promise<void>} - Een belofte die wordt vervuld wanneer de consumer is gestart.
 */
module.exports = async function StartSessionConsumer(channel, salesforceClient) {

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_session_${action}`, { durable: true });

      await channel.consume(`crm_session_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         console.log(`\uD83D\uDCE5 [${action}SessionConsumer] Ontvangen`);

         // convert XML to JSON
         let jsonConv;
         try {
            jsonConv = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            console.error('❌ Ongeldig XML formaat:', content);
            return;
         }

         const objectData = jsonConv.CreateSession || jsonConv.UpdateSession || jsonConv.DeleteSession;
         if (!objectData) {
            channel.nack(msg, false, false);
            console.error("❌ Ongeldig formaat:", jsonConv);
            return;
         }

         if (!objectData.UUID) {
            channel.nack(msg, false, false);
            console.error("❌ UUID ontbreekt in het bericht");
            return;
         }

         let SalesforceObjId;
         if (["update", "delete"].includes(action)) {
            try {
               const query = salesforceClient.sObject("Session__c") // CMD: custom object aanpassen indien anders
                   .select("Id")
                   .where({ UUID__c: objectData.UUID })
                   .limit(1);

               const result = await query.run();

               if (!result || result.length === 0) {
                  channel.nack(msg, false, false);
                  console.error("❌ Geen Salesforce ID gevonden voor UUID:", objectData.UUID);
                  return;
               }
               SalesforceObjId = result[0].Id;
            } catch (err) {
               channel.nack(msg, false, false);
               console.error("❌ Fout bij ophalen Salesforce ID:", err.message);
               return;
            }
         }

         let JSONMsg;

         switch (action) {
            case "create":
               try {
                  JSONMsg = {
                     UUID__c: objectData.UUID,
                     EventName__c: objectData.EventName,
                     Name: objectData.SessionName,
                     Description__c: objectData.Description,
                     Capacity__c: objectData.Capacity,
                     StartDateTime__c: objectData.StartDateTime,
                     EndDateTime__c: objectData.EndDateTime,
                     Location__c: objectData.Location,
                     SessionType__c: objectData.SessionType
                     // CMD: Hier kun je logica toevoegen om GuestSpeakers of RegisteredUsers te koppelen als child object
                  };

                  await salesforceClient.createSession(JSONMsg); // CMD: Methode moet bestaan in je client
                  console.log("✅ Sessie aangemaakt in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij create:", err.message);
                  return;
               }
               break;

            case "update":
               try {
                  const updates = {};
                  const fields = objectData.FieldsToUpdate?.Field || [];
                  for (const field of fields) {
                     updates[`${field.Name}__c`] = field.NewValue; // CMD: veldnamen aanpassen indien nodig
                  }

                  await salesforceClient.updateSession(SalesforceObjId, updates);
                  console.log("✅ Sessie geüpdatet in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij update:", err.message);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.deleteSession(SalesforceObjId);
                  console.log("✅ Sessie verwijderd uit Salesforce");
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

      console.log(`🔔 Listening for messages on queue \"crm_session_${action}\"…`);
   }
};
