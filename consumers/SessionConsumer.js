/**
 * @module SessionConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor sessies in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");

module.exports = async function StartSessionConsumer(channel, salesforceClient) {

   function capitalize(s) {
      return String(s[0]).toUpperCase() + String(s).slice(1);
   }

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_session_${action}`, { durable: true });

      console.log("Luisteren op queue:", `crm_session_${action}`);
      await channel.consume(`crm_session_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         console.log(`📥 [${action}SessionConsumer] Ontvangen`);

         // XML naar JSON conversie
         let rabbitMQMsg;
         try {
            rabbitMQMsg = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            console.error('❌ Ongeldig XML formaat:', content);
            return;
         }

         let SalesforceObjId;
         rabbitMQMsg = rabbitMQMsg[`${capitalize(action)}Session`];

         if (!rabbitMQMsg) {
            channel.nack(msg, false, false);
            console.error("❌ Verkeerde root XSD:", rabbitMQMsg);
            return;
         }

         if (['update', 'delete'].includes(action)) {
            // Zoek Salesforce ID via UUID
            const query = salesforceClient.sObject("Session__c")
                .select("Id")
                .where({ UUID__c: rabbitMQMsg.SessionUUID })
                .limit(1);

            let result;
            try {
               result = await query.run();
            } catch (err) {
               channel.nack(msg, false, false);
               console.error("❌ Fout bij ophalen Salesforce Sessie ID:", err.message);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               console.error("❌ Geen Salesforce Sessie gevonden voor UUID:", rabbitMQMsg.SessionUUID);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         let salesForceMsg;
         switch (action) {
            case "create":
               try {
                  // Relatie met Event
                  const eventQuery = await salesforceClient.sObject("Event__c")
                      .select("Id")
                      .where({ UUID__c: rabbitMQMsg.RelatedEventUUID })
                      .limit(1);
                  const eventResult = await eventQuery.run();

                  salesForceMsg = {
                     "UUID__c": rabbitMQMsg.SessionUUID,
                     "Name": rabbitMQMsg.SessionName,
                     "Description__c": rabbitMQMsg.Description || "",
                     "SessionStart__c": rabbitMQMsg.StartDateTime,
                     "SessionEnd__c": rabbitMQMsg.EndDateTime,
                     "Location__c": rabbitMQMsg.Location,
                     "Instructor__c": rabbitMQMsg.Instructor || "",
                     "Capacity__c": rabbitMQMsg.Capacity || 0,
                     "Status__c": rabbitMQMsg.Status || "Gepland",
                     "Event__c": eventResult[0]?.Id || ""

                  };

                  await salesforceClient.createSession(salesForceMsg);
                  console.log("✅ Sessie aangemaakt in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij aanmaken:", err.message);
                  return;
               }
               break;

            case "update":
               try {
                  salesForceMsg = {
                     ...(rabbitMQMsg.SessionName && { "Name": rabbitMQMsg.SessionName }),
                     ...(rabbitMQMsg.Description && { "Description__c": rabbitMQMsg.Description }),
                     ...(rabbitMQMsg.StartDateTime && { "SessionStart__c": rabbitMQMsg.StartDateTime }),
                     ...(rabbitMQMsg.EndDateTime && { "SessionEnd__c": rabbitMQMsg.EndDateTime }),
                     ...(rabbitMQMsg.Location && { "Location__c": rabbitMQMsg.Location }),
                     ...(rabbitMQMsg.Instructor && { "Instructor__c": rabbitMQMsg.Instructor }),
                     ...(rabbitMQMsg.Capacity && { "Capacity__c": rabbitMQMsg.Capacity }),
                     ...(rabbitMQMsg.Status && { "Status__c": rabbitMQMsg.Status })
                  };

                  await salesforceClient.updateSession(SalesforceObjId, salesForceMsg);
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

      console.log(`🔔 Luistert naar berichten op queue "crm_session_${action}"…`);
   }
};