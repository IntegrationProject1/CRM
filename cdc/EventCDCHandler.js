/**
 * Event CDC Handler
 * @module EventCDCHandler
 * @file cdc/EventCDCHandler.js
 * @description Handles Salesforce Change Data Capture (CDC) messages for Event objects and publishes them to RabbitMQ.
 * @requires dotenv - Loads environment variables from a `.env` file.
 * @requires xmlJsonTranslator - A module for converting JSON to XML.
 * @requires validator - A module for validating XML against an XSD schema.
 * @requires event_logger - A logger for logging events in the EventCDCHandler.
 * @requires sendMessage - A function to send messages to the RabbitMQ queue.
 */

require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const {event_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");
const hrtimeBase = process.hrtime.bigint();

/**
 * Generates the current ISO 8601 timestamp with microsecond precision.
 * @returns {string} - The generated timestamp.
 * @example
 * const timestamp = generateMicroDateTime();
 * console.log(timestamp); // "2023-10-05T12:34:56.789123Z"
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
 * Processes Salesforce CDC messages for Event objects and publishes them to RabbitMQ.
 * @param {Object} message - The Salesforce CDC message.
 * @param {Object} sfClient - The Salesforce client for interacting with Salesforce.
 * @param {Object} RMQChannel - The RabbitMQ channel for publishing messages.
 * @returns {Promise<void>} - A promise that resolves when the message is processed.
 * @example
 * EventCDCHandler(message, sfClient, RMQChannel)
 *  .then(() => console.log("Event processed successfully"))
 *  .catch(err => console.error("Error processing event:", err));
 */
module.exports = async function EventCDCHandler(message, sfClient, RMQChannel) {
   const { ChangeEventHeader, ...cdcObject } = message.payload;

   if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
      event_logger.debug("Salesforce API call detected, skipping action.");
      return;
   }

   event_logger.info('Captured Event Object:', { header: ChangeEventHeader, changes: cdcObject });
   await sendMessage("INFO", "200", `Captured Event Object: ${JSON.stringify({ header: ChangeEventHeader, changes: cdcObject })}`);

   const action = ChangeEventHeader.changeType;

   let recordId;
   if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) {
         event_logger.error('No recordId found for action:', action);
         await sendMessage("error", "400", 'No recordId found for action: ' + action);
         return;
      }
   }

   let UUID;
   let JSONMsg;
   let xmlMessage;
   let xsdPath;

   try {
      switch (action) {
         case 'CREATE':
            UUID = generateMicroDateTime();
            event_logger.debug("recordId:", recordId);
            await sfClient.sObject('Event__c')
               .update({Id: recordId, UUID__c: UUID });
            event_logger.info("UUID successfully updated:", UUID);
            await sendMessage("INFO", "201", `UUID successfully updated: ${UUID}`);

            JSONMsg = {
               CreateEvent: {
                  EventUUID: UUID,
                  EventName: cdcObject.Name,
                  EventDescription: cdcObject.Description__c,
                  StartDateTime: cdcObject.StartDateTime__c,
                  EndDateTime: cdcObject.EndDateTime__c,
                  EventLocation: cdcObject.Location__c,
                  Organisator: cdcObject.Organiser__c,
                  Capacity: 1, // bestaat niet in Event__c maar is in session
                  EventType: cdcObject.EventType__c,
                  RegisteredUsers: []
               }
            };
            xsdPath = './xsd/eventsXSD/CreateEvent.xsd';
            break;

         case 'UPDATE':
            const updatedRecord = await sfClient.sObject('Event__c')
               .retrieve(recordId);

            if (!updatedRecord?.UUID__c) {
               throw new Error(`No UUID found for record: ${recordId}`);
            }

            // Add fields to update only if they exist in cdcObject (changed fields)
            JSONMsg = {
               UpdateEvent: {
                  EventUUID: updatedRecord.UUID__c,
                  ...(cdcObject.Name && { EventName: cdcObject.Name }),
                  ...(cdcObject.Description__c && { EventDescription: cdcObject.Description__c }),
                  ...(cdcObject.StartDateTime__c && { StartDateTime: cdcObject.StartDateTime__c }),
                  ...(cdcObject.EndDateTime__c && { EndDateTime: cdcObject.EndDateTime__c }),
                  ...(cdcObject.Location__c && { EventLocation: cdcObject.Location__c }),
                  ...(cdcObject.Organiser__c && { Organisator: cdcObject.Organiser__c }),
                  ...(cdcObject.GuestSpeaker__c && { Capacity: cdcObject.GuestSpeaker__c }),
                  ...(cdcObject.EventType__c && { EventType: cdcObject.EventType__c })
               }
            };
            xsdPath = './xsd/eventsXSD/UpdateEvent.xsd';
            break;

         case 'DELETE':
            const query = sfClient.sObject('Event__c')
               .select('UUID__c')
               .where({ Id: recordId, IsDeleted: true })
               .limit(1)
               .scanAll(true);

            const resultDel = await query.run();
            const deletedRecord = resultDel[0];

            if (!deletedRecord?.UUID__c) {
               throw new Error(`No UUID found for deleted record: ${recordId}`);
            }

            JSONMsg = {
               DeleteEvent: {
                  ActionType: action,
                  EventUUID: deletedRecord.UUID__c,
                  TimeOfAction: new Date().toISOString()
               }
            };
            xsdPath = './xsd/eventsXSD/DeleteEvent.xsd';
            break;

         default:
            event_logger.warning("Unhandled action:", action);
            await sendMessage("warn", "400", `Unhandled action: ${action}`);
            return;
      }

      xmlMessage = jsonToXml(JSONMsg);

      const validationResult = validator.validateXml(xmlMessage, xsdPath);
      if (!validationResult.isValid) {
         throw new Error(`XML validation failed for action: ${action}`);
      }

      const exchangeName = 'event';
      await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

      const routingKeys = [
         `frontend.event.${action.toLowerCase()}`,
         // `facturatie.event.${action.toLowerCase()}`,
         `kassa.event.${action.toLowerCase()}`,
         `planning.event.${action.toLowerCase()}`
      ];

      for (const routingKey of routingKeys) {
         RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
         event_logger.info(`Message sent to ${exchangeName} (${routingKey})`);
         await sendMessage("INFO", "200", `Message sent to ${exchangeName} (${routingKey})`);
      }

   } catch (error) {
      event_logger.error(`❌ Critical error during ${action} action:`, error.message);
      await sendMessage("error", "500", `Critical error during ${action} action: ${error.message}`);
      if (error.response?.body) {
         event_logger.error('Salesforce API error details:', error.response.body);
         await sendMessage("error", "500", `Salesforce API error details: ${JSON.stringify(error.response.body)}`);
      }
   }
};
