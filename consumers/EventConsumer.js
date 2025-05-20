/**
 * @module EventConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van events in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");

/**
 * Start de EventConsumer om berichten van RabbitMQ-queues te verwerken.
 * @param {Object} channel - Het RabbitMQ-kanaal voor het consumeren van berichten.
 * @param {Object} salesforceClient - De Salesforce-client voor interactie met Salesforce.
 * @returns {Promise<void>} - Een belofte die wordt vervuld wanneer de consumer is gestart.
 */
module.exports = async function StartEventConsumer(channel, salesforceClient) {

   function capitalize(s) { // Capitalize the first letter of a string
      return String(s[0]).toUpperCase() + String(s).slice(1);
   }

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_event_${action}`, {durable: true});

      console.log("luisteren op queue:", `crm_event_${action}`);
      await channel.consume(`crm_event_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         console.log(`📥 [${action}EventConsumer] Ontvangen`);

         // convert XML to JSON
         let rabbitMQMsg;
         try {
            rabbitMQMsg = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            console.error('❌ Ongeldig XML formaat:', content);
            return;
         }

         let SalesforceObjId;

         console.log("bericht", rabbitMQMsg)
         rabbitMQMsg = rabbitMQMsg[`${capitalize(action)}Event`];

         if (!rabbitMQMsg) {
            channel.nack(msg, false, false);
            console.error("❌ Verkeerde root XSD:", rabbitMQMsg);
            return;
         }

         if (['update', 'delete'].includes(action)) {
            // retrieve Salesforce ID from UUID
            const query = salesforceClient.sObject("Event__c")
               .select("Id")
               .where({UUID__c: rabbitMQMsg.EventUUID})
               .limit(1);

            let result;
            try {
               result = await query.run();
            } catch (err) {
               channel.nack(msg, false, false);
               console.error("❌ Fout bij ophalen Salesforce Event ID:", err.message);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               console.error("❌ Geen Salesforce Event ID gevonden voor UUID:", rabbitMQMsg.UUID);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         let salesForceMsg;
         // <?xml version="1.0" encoding="UTF-8"?>
         // <CreateEvent>
         //     <EventUUID>2023-10-01T12:00:00Z</EventUUID>
         //     <EventName>Sample Event</EventName>
         //     <EventDescription>This is a sample event description.</EventDescription>
         //     <StartDateTime>2023-10-10T09:00:00Z</StartDateTime>
         //     <EndDateTime>2023-10-10T17:00:00Z</EndDateTime>
         //     <EventLocation>Sample Location</EventLocation>
         //     <Organisator>Sample Organizer</Organisator>
         //     <Capacity>100</Capacity>
         //     <EventType>Conference</EventType>
         //     <RegisteredUsers>
         //         <User>
         //             <UUID>user-12345</UUID>
         //         </User>
         //         <User>
         //             <UUID>user-67890</UUID>
         //         </User>
         //     </RegisteredUsers>
         // </CreateEvent>

         switch (action) {
            case "create":
               try {
                  salesForceMsg = {
                     "UUID__c": rabbitMQMsg.EventUUID,
                     "Name": rabbitMQMsg.EventName,
                     "Description__c": rabbitMQMsg.EventDescription || "",
                     "StartDateTime__c": rabbitMQMsg.StartDateTime || "",
                     "EndDateTime__c": rabbitMQMsg.EndDateTime || "",
                     "Location__c": rabbitMQMsg.EventLocation || "",
                     "Organiser__c": rabbitMQMsg.Organisator || "",
                     "EventType__c": rabbitMQMsg.EventType || "",
                  };

                  await salesforceClient.createEvent(salesForceMsg);
                  console.log("✅ Event aangemaakt in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij create:", err.message);
                  return;
               }
               break;

            case "update":
               try {
                  salesForceMsg = {
                     ...(rabbitMQMsg.Name && {"Name": rabbitMQMsg.Name}),
                     ...(rabbitMQMsg.Description && {"Description__c": rabbitMQMsg.Description}),
                     ...(rabbitMQMsg.StartDateTime && {"StartDateTime__c": rabbitMQMsg.StartDateTime}),
                     ...(rabbitMQMsg.EndDateTime && {"EndDateTime__c": rabbitMQMsg.EndDateTime}),
                     ...(rabbitMQMsg.Location && {"Location__c": rabbitMQMsg.Location}),
                     ...(rabbitMQMsg.Organiser && {"Organiser__c": rabbitMQMsg.Organiser}),
                     ...(rabbitMQMsg.EventType && {"EventType__c": rabbitMQMsg.EventType})
                  };

                  /* TODO step 2: Read registered users and update salesforce relations
                  * registered users links have to be created in salesforce

                 * */

                  await salesforceClient.updateEvent(SalesforceObjId, salesForceMsg);
                  console.log("✅ Event geüpdatet in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij update:", err.message);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.deleteEvent(SalesforceObjId);
                  console.log("✅ Event verwijderd uit Salesforce");
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

      console.log(`🔔 Listening for messages on queue "crm_event_${action}"…`);
   }
};
