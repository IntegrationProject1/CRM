const {jsonToXml} = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
module.exports = async function EventParticipantCDCHandler(message, sfClient, RMQChannel) {
   const {ChangeEventHeader, ...cdcObject} = message.payload;

   if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
      console.log("🚫 Salesforce API call detected, skipping action.");
      return;
   }
   console.log("Captured Event Participant Object:", {header: ChangeEventHeader, changes: cdcObject});
   const action = ChangeEventHeader.changeType;

   let recordId;
   let eventUUID;
   let eventRecord;

   if (['CREATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) return console.error('❌ No recordId found.');
   }

   if (action == 'UPDATE') return console.warn("❌ Update action not supported for Event_Participant__c.");


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
         console.log("del result", query)

      } catch (e) {
         return console.error("❌ No Event ID found for deleted Participant.")
      }
   }

   // Retrieve required eventId from associated Event
   const eventId = cdcObject.Event__c || eventIdQuery;

   if (!eventId) {
      return console.error("❌ No Event ID found in the CDC object for action " + action);
   }

   // Assign an EventUUID and ContactUUID upon creation
   if (action === 'CREATE') {
      // Get UUID for associated event
      try {
         eventRecord = await sfClient.sObject('Event__c')
            .retrieve(eventId);

      } catch (e) {
         return console.log("❌ Error retrieving associated event record.");
      }

      eventUUID = eventRecord.UUID__c;
      if (!eventUUID) {
         return console.error(`❌ No UUID found for event record: ${eventId}`);
      }

      console.log("event record:", eventRecord)

      let contactRecord;
      try {
         contactRecord = await sfClient.sObject('Contact')
            .retrieve(cdcObject.Contact__c);

      } catch (e) {
         return console.log("❌ Error retrieving associated contact record.");
      }

      if (!contactRecord.UUID__c) {
         return console.error(`❌ No UUID found for contact ID: ${cdcObject.Contact__c}`);
      }

      await sfClient.sObject("Event_Participant__c")
         .update({ Id: recordId, Event_UUID__c: eventUUID, Contact_UUID__c: contactRecord.UUID__c, Name: contactRecord.LastName || "-" });
   } else if (action == "UNDELETE") {
      eventUUID = cdcObject.Event_UUID__c
   }

   if (!eventUUID) return console.error("❌ Failed to retrieve the associated event UUID record for this participant using action " + action)

   jsonParticipants = await getEventParticipantsAsJson(eventId);

   JSONMsg = {
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
   console.log(JSONMsg)

   // valideer XML
   xmlMessage = jsonToXml(JSONMsg);
   console.log(xmlMessage);

   xsdPath = './xsd/eventsXSD/UpdateEvent.xsd';

   try {
      if (!validator.validateXml(xmlMessage, xsdPath)) {
         throw new Error(`XML validation failed for update`);
      }
   } catch (e) {
      return console.error(`❌ Fout tijdens XSD validatie:`, e.message);
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
      console.log(`📤 Message sent to ${exchangeName} (${routingKey})`);
   }

   async function getEventParticipantsAsJson(eventId) {
      try {
         // Query all Event_Participant__c records linked to the given eventId
         const participants = await sfClient.sObject('Event_Participant__c')
            .select('Id, Name, Contact_UUID__c, Event_UUID__c')
            .where({ Event__c: eventId })
            .run();

         console.log("rsult", participants)

         // Map the results into a JSON message list
         const jsonMessageList = participants.map(participant => ({
            User: {
               UUID: participant.Contact_UUID__c
            }
         }));

         console.log("Retrieved Event Participants JSON List:", jsonMessageList);
         return jsonMessageList;
      } catch (error) {
         console.error("Error retrieving Event Participants:", error.message);
         throw error;
      }
   }
};