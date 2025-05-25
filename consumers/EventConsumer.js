/**
 * @module EventConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van events in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");
const {event_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");

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

      event_logger.info("listening on queue:", `crm_event_${action}`);
      await sendMessage("crm_event", "200", `listening on queue: crm_event_${action}`);
      await channel.consume(`crm_event_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         event_logger.info(`[${action}EventConsumer] Received message:`, content);
         await sendMessage("crm_event", "200", `[${action}EventConsumer] Received message: ${content}`);

         // convert XML to JSON
         let rabbitMQMsg;
         try {
            rabbitMQMsg = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            event_logger.error("Invalid XML format:", content);
            await sendMessage("crm_event", "400", `Invalid XML format: ${content}`);
            return;
         }

         let SalesforceObjId;

         rabbitMQMsg = rabbitMQMsg[`${capitalize(action)}Event`];

         if (!rabbitMQMsg) {
            channel.nack(msg, false, false);
            event_logger.error("Invalid XML format:", rabbitMQMsg);
            await sendMessage("crm_event", "400", `Invalid root XML: ${rabbitMQMsg}`);
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
               event_logger.error("Invalid XML format:", rabbitMQMsg);
               await sendMessage("crm_event", "500", `Error retrieving Salesforce Event ID: ${err.message}`);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               console.error("❌ Geen Salesforce Event ID gevonden voor UUID:", rabbitMQMsg.UUID);
               event_logger.error("Geen Salesforce Event ID gevonden voor UUID:", rabbitMQMsg.EventUUID);
               await sendMessage("crm_event", "404", `No Salesforce Event ID found for UUID: ${rabbitMQMsg.EventUUID}`);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         let salesForceMsg;

         switch (action) {
            case "create":
               try {
                  salesForceMsg = {
                     "UUID__c": rabbitMQMsg.EventUUID,
                     "Name": rabbitMQMsg.EventName,
                     "Description__c": rabbitMQMsg.Description || "",
                     "StartDateTime__c": rabbitMQMsg.StartDateTime || "",
                     "EndDateTime__c": rabbitMQMsg.EndDateTime || "",
                     "Location__c": rabbitMQMsg.EventLocation || "",
                     "Organiser__c": rabbitMQMsg.Organisator || "",
                     "EventType__c": rabbitMQMsg.EventType || "",
                  };

                  await salesforceClient.createEvent(salesForceMsg);
                  console.log("✅ Event aangemaakt in Salesforce");
                  event_logger.info("Event is Created in Salesforce:", salesForceMsg);
                  await sendMessage("crm_event", "201", `Event created in Salesforce: ${salesForceMsg.UUID__c}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  console.error("❌ Fout bij create:", err.message);
                  return;
               }
               break;

            case "update":
               try {
                  salesForceMsg = {
                     ...(rabbitMQMsg.EventName && {"Name": rabbitMQMsg.EventName}),
                     ...(rabbitMQMsg.Description && {"Description__c": rabbitMQMsg.Description}),
                     ...(rabbitMQMsg.StartDateTime && {"StartDateTime__c": rabbitMQMsg.StartDateTime}),
                     ...(rabbitMQMsg.EndDateTime && {"EndDateTime__c": rabbitMQMsg.EndDateTime}),
                     ...(rabbitMQMsg.Location && {"Location__c": rabbitMQMsg.Location}),
                     ...(rabbitMQMsg.Organisator && {"Organiser__c": rabbitMQMsg.Organisator}),
                     ...(rabbitMQMsg.EventType && {"EventType__c": rabbitMQMsg.EventType})
                  };

                  /* TODO step 2: Read registered users and update salesforce relations
                  * registered users links have to be created in salesforce

                 * */

                  await salesforceClient.updateEvent(SalesforceObjId, salesForceMsg);
                  event_logger.info("Event is Updated in Salesforce:", salesForceMsg);
                  await sendMessage("crm_event", "200", `Event updated in Salesforce: ${SalesforceObjId}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  event_logger.error("Error updating event in Salesforce:", err.message);
                  await sendMessage("crm_event", "500", `Error updating event in Salesforce: ${err.message}`);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.deleteEvent(SalesforceObjId);
                  event_logger.info("Event is Deleted in Salesforce:", SalesforceObjId);
                  await sendMessage("crm_event", "200", `Event deleted in Salesforce: ${SalesforceObjId}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  event_logger.error("Error deleting event in Salesforce:", err.message);
                  await sendMessage("crm_event", "500", `Error deleting event in Salesforce: ${err.message}`);
                  return;
               }
               break;

            default:
               channel.nack(msg, false, false);
               event_logger.error(`invalid queue: crm_event_${action}`);
               await sendMessage("crm_event", "400", `Invalid queue: crm_event_${action}`);
               return;
         }

         await channel.ack(msg);
      });

      event_logger.info(`Listening for messages on queue "crm_event_${action}"…`);
      await sendMessage("crm_event", "200", `Listening for messages on queue: crm_event_${action}`);
   }
};
