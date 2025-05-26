/**
 * Event Participant CDC Handler
 * @module EventParticipantCDCHandler
 * @file cdc/EventParticipantCDCHandler.js
 * @description Handles Salesforce Change Data Capture (CDC) messages for Event Participant objects and publishes updates to RabbitMQ.
 * @requires xmlJsonTranslator - A module for converting JSON to XML.
 * @requires validator - A module for validating XML against an XSD schema.
 * @requires event_logger - A logger for logging events in the EventParticipantCDCHandler.
 * @requires sendMessage - A function to send messages to the RabbitMQ queue.
 */

const {jsonToXml} = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const {event_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");

/**
 * Processes Salesforce CDC messages for Event Participant objects and publishes updates to RabbitMQ.
 * @param {Object} message - The Salesforce CDC message.
 * @param {Object} sfClient - The Salesforce client for interacting with Salesforce.
 * @param {Object} RMQChannel - The RabbitMQ channel for publishing messages.
 * @returns {Promise<void>} - A promise that resolves when the message is processed.
 * @example
 * EventParticipantCDCHandler(message, sfClient, RMQChannel)
 *  .then(() => console.log("Event Participant processed successfully"))
 *  .catch(err => console.error("Error processing Event Participant:", err));
 */
module.exports = async function EventParticipantCDCHandler(message, sfClient, RMQChannel) {
   const {ChangeEventHeader, ...cdcObject} = message.payload;

   if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
      event_logger.debug("Salesforce REST API call detected, skipping action.");
      return;
   }
   event_logger.info('Received Event Participant Object:', event_logger.info);
   await sendMessage("info", "200", `Captured Event Participant Object: ${JSON.stringify({header: ChangeEventHeader, changes: cdcObject})}`);
   const action = ChangeEventHeader.changeType;

   let recordId;
   let eventUUID;
   let eventRecord;

   if (['CREATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId){
         event_logger.error('No recordId found for action:', action);
         await sendMessage("error", "400", 'No recordId found for action: ' + action);
         return;
      }
   }

   if (action === 'UPDATE') {
      event_logger.warn("Update action not supported for Event_Participant__c.");
      await sendMessage("warn", "400", "Update action not supported for Event_Participant__c.");
      return;
   }


   let eventIdQuery;

   // Query eventId in case of record deletion
   if (action === 'DELETE') {
      try {
         const query = await sfClient.sObject('Event_Participant__c')
            .select('Event__c, Event_UUID__c')
            .where({ Id: recordId, IsDeleted: true })
            .limit(1)
            .scanAll(true)
            .run();

         eventIdQuery = query[0]?.Event__c;
         eventUUID = query[0]?.Event_UUID__c;
         event_logger.debug("Event ID from deleted participant:", eventIdQuery);
         // await sendMessage("debug", "200", `Event ID from deleted participant: ${eventIdQuery}`);


      } catch (e) {
            event_logger.error("Error retrieving Event ID from deleted participant:", e.message);
            await sendMessage("error", "500", `Error retrieving Event ID from deleted participant: ${e.message}`);
         return;
      }
   }

   // Retrieve required eventId from associated Event
   const eventId = cdcObject.Event__c || eventIdQuery;

   if (!eventId) {
        event_logger.error("No Event ID found in the CDC object for action " + action);
        await sendMessage("error", "400", "No Event ID found in the CDC object for action " + action);
        return;
   }

   // Assign an EventUUID and ContactUUID upon creation
   if (action === 'CREATE') {
      // Get UUID for associated event
      try {
         eventRecord = await sfClient.sObject('Event__c')
            .retrieve(eventId);

      } catch (e) {
         event_logger.error("Error retrieving associated event record:", e.message);
         await sendMessage("error", "500", `Error retrieving associated event record: ${e.message}`);
         return;
      }

      eventUUID = eventRecord.UUID__c;
      if (!eventUUID) {
         event_logger.error(`No UUID found for event record: ${eventId}`);
         await sendMessage("error", "400", `No UUID found for event record: ${eventId}`);
         return;
      }

      event_logger.debug("Event record:", eventRecord);
      // await sendMessage("debug", "200", `Event record: ${JSON.stringify(eventRecord)}`);

      let contactRecord;
      try {
         contactRecord = await sfClient.sObject('Contact')
            .retrieve(cdcObject.Contact__c);

      } catch (e) {
         event_logger.error("Error retrieving associated contact record:", e.message);
         await sendMessage("error", "500", `Error retrieving associated contact record: ${e.message}`);
         return;
      }

      if (!contactRecord.UUID__c) {
            event_logger.error(`No UUID found for contact ID: ${cdcObject.Contact__c}`);
            await sendMessage("error", "400", `No UUID found for contact ID: ${cdcObject.Contact__c}`);
            return;
      }

      await sfClient.sObject("Event_Participant__c")
         .update({ Id: recordId, Event_UUID__c: eventUUID, Contact_UUID__c: contactRecord.UUID__c, Name: contactRecord.LastName || "-" });
   } else if (action === "UNDELETE") {
      eventUUID = cdcObject.Event_UUID__c
   }

   if (!eventUUID) {
      event_logger.error("Failed to retrieve the associated event UUID record for this participant using action " + action);
      await sendMessage("error", "400", "Failed to retrieve the associated event UUID record for this participant using action " + action);
      return;

   }

   let jsonParticipants = await getEventParticipantsAsJson(eventId);

   let JSONMsg = {
      UpdateEvent: {
         EventUUID: eventUUID,
         // RegisteredUsers: jsonParticipants
         RegisteredUsers: {
            User: jsonParticipants.map(participant => ({
               UUID: participant.User.UUID
            }))
         }
      }
   };
   event_logger.debug("JSON Message for Event Update:", JSONMsg);
   // await sendMessage("debug", "200", `JSON Message for Event Update: ${JSON.stringify(JSONMsg)}`);


   // valideer XML
   let xmlMessage = jsonToXml(JSONMsg);
   console.log(xmlMessage);

   let xsdPath = './xsd/eventsXSD/UpdateEvent.xsd';

   try {
      const validationResult = validator.validateXml(xmlMessage, xsdPath);
      if (!validationResult.isValid) {
         throw new Error(`XML validation failed for update`);
      }
   } catch (e) {
      event_logger.error(`Error during XSD validation:`, e.message);
      await sendMessage("error", "500", `Error during XSD validation: ${e.message}`);
      return;
   }

   const exchangeName = 'event';
   await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

   const routingKeys = [
      `frontend.event.update`,
      // `facturatie.event.update`,
      `kassa.event.update`,
      `planning.event.update`
   ];

   for (const routingKey of routingKeys) {
      RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
      event_logger.info(`Message sent to ${exchangeName} (${routingKey})`);
      await sendMessage("info", "200", `Message sent to ${exchangeName} (${routingKey})`);

   }

   async function getEventParticipantsAsJson(eventId) {
      try {
         // Query all Event_Participant__c records linked to the given eventId
         const participants = await sfClient.sObject('Event_Participant__c')
            .select('Id, Name, Contact_UUID__c, Event_UUID__c')
            .where({ Event__c: eventId })
            .run();

         event_logger.debug("Retrieved Event Participants:", participants);
         // await sendMessage("debug", "200", `Retrieved Event Participants: ${JSON.stringify(participants)}`);


         // Map the results into a JSON message list
         const jsonMessageList = participants.map(participant => ({
            User: {
               UUID: participant.Contact_UUID__c
            }
         }));

         console.log("Retrieved Event Participants JSON List:", jsonMessageList);
         event_logger.debug("Retrieved Event Participants JSON List:", jsonMessageList);
         // await sendMessage("debug", "200", `Retrieved Event Participants JSON List: ${JSON.stringify(jsonMessageList)}`);
         return jsonMessageList;
      } catch (error) {
         event_logger.error("Error retrieving Event Participants:", error.message);
         await sendMessage("error", "500", `Error retrieving Event Participants: ${error.message}`);
         throw error;
      }
   }
};
