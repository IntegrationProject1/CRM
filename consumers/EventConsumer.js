/**
 * @module EventConsumer
 * @file consumers/EventConsumer.js
 * @description Manages the processing of messages from RabbitMQ queues for creating, updating, and deleting events in Salesforce.
 * @requires xmlJsonTranslator - A module for converting XML to JSON.
 * @requires event_logger - A logger for logging events in the EventConsumer.
 * @requires sendMessage - A function to send messages to the RabbitMQ queue.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");
const {event_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");

/**
 * Start the EventConsumer to process messages from RabbitMQ queues.
 * @param {Object} channel - The RabbitMQ channel for consuming messages.
 * @param {Object} salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} - A promise that resolves when the consumer has started.
 * @example
 * StartEventConsumer(channel, salesforceClient)
 *  .then(() => console.log("EventConsumer started"))
 *  .catch(err => console.error("Error starting EventConsumer:", err));
 */
module.exports = async function StartEventConsumer(channel, salesforceClient) {
   /**
    * capitalize - Capitalize the first letter of a string.
    * @param s - The string to capitalize.
    * @returns {string} - The string with the first letter capitalized.
    * @example
    * capitalize("hello") // returns "Hello"
    */
   function capitalize(s) { // Capitalize the first letter of a string
      return String(s[0]).toUpperCase() + String(s).slice(1);
   }

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`info_${action}`, {durable: true});

      event_logger.info("listening on queue:", `info_${action}`);
      await sendMessage("INFO", "200", `listening on queue: info_${action}`);
      await channel.consume(`info_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         event_logger.info(`[${action}EventConsumer] Received message:`, content);
         await sendMessage("INFO", "200", `[${action}EventConsumer] Received message: ${content}`);

         // convert XML to JSON
         let rabbitMQMsg;
         try {
            rabbitMQMsg = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            event_logger.error("Invalid XML format:", content);
            await sendMessage("ERROR", "400", `Invalid XML format: ${content}`);
            return;
         }

         let SalesforceObjId;

         rabbitMQMsg = rabbitMQMsg[`${capitalize(action)}Event`];

         if (!rabbitMQMsg) {
            channel.nack(msg, false, false);
            event_logger.error("Invalid XML format:", rabbitMQMsg);
            await sendMessage("ERROR", "400", `Invalid root XML: ${rabbitMQMsg}`);
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
               await sendMessage("ERROR", "500", `Error retrieving Salesforce Event ID: ${err.message}`);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               console.error("❌ Geen Salesforce Event ID gevonden voor UUID:", rabbitMQMsg.UUID);
               event_logger.error("Geen Salesforce Event ID gevonden voor UUID:", rabbitMQMsg.EventUUID);
               await sendMessage("ERROR", "404", `No Salesforce Event ID found for UUID: ${rabbitMQMsg.EventUUID}`);
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
                  await sendMessage("INFO", "201", `Event created in Salesforce: ${salesForceMsg.UUID__c}`);
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
                  await sendMessage("INFO", "200", `Event updated in Salesforce: ${SalesforceObjId}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  event_logger.error("Error updating event in Salesforce:", err.message);
                  await sendMessage("ERROR", "500", `Error updating event in Salesforce: ${err.message}`);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.deleteEvent(SalesforceObjId);
                  event_logger.info("Event is Deleted in Salesforce:", SalesforceObjId);
                  await sendMessage("INFO", "200", `Event deleted in Salesforce: ${SalesforceObjId}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  event_logger.error("Error deleting event in Salesforce:", err.message);
                  await sendMessage("ERROR", "500", `Error deleting event in Salesforce: ${err.message}`);
                  return;
               }
               break;

            default:
               channel.nack(msg, false, false);
               event_logger.error(`invalid queue: info_${action}`);
               await sendMessage("ERROR", "400", `Invalid queue: info_${action}`);
               return;
         }

         await channel.ack(msg);
      });

      event_logger.info(`Listening for messages on queue "info_${action}"…`);
      await sendMessage("INFO", "200", `Listening for messages on queue: info_${action}`);
   }
};
