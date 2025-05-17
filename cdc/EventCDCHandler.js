require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const hrtimeBase = process.hrtime.bigint();

/**
 * Generates the current ISO 8601 timestamp with microsecond precision.
 * @returns {string} ISO 8601 date-time string with microseconds.
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
 * @module EventCDCHandler
 * @description Handles Salesforce CDC messages for Event objects and publishes them to RabbitMQ.
 * @param {Object} message - The Salesforce CDC message.
 * @param {Object} sfClient - The Salesforce client for interacting with Salesforce.
 * @param {Object} RMQChannel - The RabbitMQ channel for publishing messages.
 * @returns {Promise<void>}
 */
module.exports = async function EventCDCHandler(message, sfClient, RMQChannel) {
   const { ChangeEventHeader, ...cdcObject } = message.payload;

   if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
      console.log("🚫 Salesforce API call detected, skipping action.");
      return;
   }

   console.log("Captured Event Object: ", { header: ChangeEventHeader, changes: cdcObject });

   const action = ChangeEventHeader.changeType;

   let recordId;
   if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) return console.error('❌ No recordId found.');
   }

   let UUID;
   let JSONMsg;
   let xmlMessage;
   let xsdPath;

   try {
      switch (action) {
         case 'CREATE':
            UUID = generateMicroDateTime();
            console.log('recordid:', recordId);
            await sfClient.sObject('Event__c')
               .update({Id: recordId, UUID__c: UUID });
            console.log("✅ UUID successfully updated:", UUID);

            JSONMsg = {
               CreateEvent: {
                  UUID: UUID,
                  Name: cdcObject.Name,
                  Description: cdcObject.Description__c,
                  StartDateTime: cdcObject.StartDateTime__c,
                  EndDateTime: cdcObject.EndDateTime__c,
                  Location: cdcObject.Location__c,
                  Organisator: cdcObject.Organiser__c,
                  Capacity: 1, // bestaat niet in Event__c maar is in session
                  EventType: cdcObject.EventType__c,
                  RegisteredUsers: [
                     ...(cdcObject.Session_Participant__c ? [{ User: { UUID: cdcObject.Session_Participant__c } }] : [])

                     // { User: { UUID: cdcObject.Session_Participant__c } }
                  ]
               }
            };
            xsdPath = './xsd/eventsXSD/CreateEvent.xsd';
            break;

         case 'UPDATE':
            return console.warn("⚠️ Update Event kan nog niet worden geimplementeerd, door een niet valide XSD");

            const updatedRecord = await sfClient.sObject('Event__c')
               .retrieve(recordId);
            if (!updatedRecord?.UUID__c) {
               throw new Error(`No UUID found for record: ${recordId}`);
            }

            JSONMsg = {
               UpdateEvent: {
                  UUID: updatedRecord.UUID__c,
                  FieldsToUpdate: {
                     ...(cdcObject.Name && { Name: cdcObject.Name }),
                     ...(cdcObject.Description__c && { Description: cdcObject.Description__c }),
                     ...(cdcObject.StartDateTime__c && { StartDateTime: cdcObject.StartDateTime__c }),
                     ...(cdcObject.EndDateTime__c && { EndDateTime: cdcObject.EndDateTime__c }),
                     ...(cdcObject.Location__c && { Location: cdcObject.Location__c }),
                     ...(cdcObject.Organiser__c && { Organisator: cdcObject.Organiser__c }),
                     ...(cdcObject.GuestSpeaker__c && { Capacity: cdcObject.GuestSpeaker__c }),
                     ...(cdcObject.EventType__c && { EventType: cdcObject.EventType__c }),
                     ...(cdcObject.RegisteredUsers && { RegisteredUsers: cdcObject.RegisteredUsers || { User: [] } })
                  }
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
                  UUID: deletedRecord.UUID__c
               }
            };
            xsdPath = './xsd/eventsXSD/DeleteEvent.xsd';
            break;

         default:
            console.warn("⚠️ Unhandled action:", action);
            return;
      }

      xmlMessage = jsonToXml(JSONMsg);

      if (!validator.validateXml(xmlMessage, xsdPath)) {
         throw new Error(`XML validation failed for action: ${action}`);
      }

      const exchangeName = 'event';
      await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });


      return; // RabbitMQ queues nog niet duidelijk

      const routingKeys = [
         // `frontend.event.${action.toLowerCase()}`,
         // `facturatie.event.${action.toLowerCase()}`,
         // `kassa.event.${action.toLowerCase()}`
      ];

      for (const routingKey of routingKeys) {
         RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
         console.log(`📤 Message sent to ${exchangeName} (${routingKey})`);
      }

   } catch (error) {
      console.error(`❌ Critical error during ${action} action:`, error.message);
      if (error.response?.body) {
         console.error('Salesforce API error details:', error.response.body);
      }
   }
};