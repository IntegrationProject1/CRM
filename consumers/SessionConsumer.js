/**
 * @module SessionConsumer
 * @file consumers/SessionConsumer.js
 * @description Manages the processing of messages from RabbitMQ queues for creating, updating, and deleting sessions in Salesforce.
 * @requires xmlJsonTranslator - A module for converting XML to JSON.
 * @requires session_logger - A logger for logging session-related messages.
 * @requires sendMessage - A function to send messages to the logger.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");
const {session_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");

/**
 * Start the SessionConsumer to process messages from RabbitMQ queues.
 * @param channel - The RabbitMQ channel for consuming messages.
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} - A promise that resolves when the consumer has started.
 * @example
 * StartSessionConsumer(channel, salesforceClient)
 *  .then(() => console.log("SessionConsumer started"))
 *  .catch(err => console.error("Error starting SessionConsumer:", err));
 */
module.exports = async function StartSessionConsumer(channel, salesforceClient) {
   /**
    * capitalize - Capitalize the first letter of a string.
    * @param s - The string to capitalize.
    * @returns {string} - The string with the first letter capitalized.
    * @example
    * capitalize("example") // returns "Example"
    */
   function capitalize(s) {
      return String(s[0]).toUpperCase() + String(s).slice(1);
   }

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_session_${action}`, {durable: true});

      session_logger.info(`[UserConsumer] listenen on queue: crm_session_${action}`);
      await sendMessage("INFO", "200", `[UserConsumer] listenen on queue: crm_session_${action}`);
      await channel.consume(`crm_session_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         session_logger.info(`[${action}SessionConsumer] Ontvangen bericht: ${content}`);
         await sendMessage("INFO", "200", `[${action}SessionConsumer] Ontvangen bericht: ${content}`);

         // XML naar JSON conversie
         let rabbitMQMsg;
         try {
            rabbitMQMsg = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            session_logger.error(`[${action}SessionConsumer] Invalid XML formate: ${content}`);
            await sendMessage("ERROR", "400", `[${action}SessionConsumer] Invalid XML formate: ${content}`);
            return;
         }

         let SalesforceObjId;
         rabbitMQMsg = rabbitMQMsg[`${capitalize(action)}Session`];

         if (!rabbitMQMsg) {
            channel.nack(msg, false, false);
            session_logger.error(`[${action}SessionConsumer] Invalid XML root: ${JSON.stringify(rabbitMQMsg)}`);
            await sendMessage("ERROR", "400", `[${action}SessionConsumer] Invalid XML root: ${JSON.stringify(rabbitMQMsg)}`);
            return;
         }

         if (["update", "delete"].includes(action)) {
            const query = salesforceClient.sObject("Session__c")
                .select("Id")
                .where({UUID__c: rabbitMQMsg.SessionUUID})
                .limit(1);

            let result;
            try {
               result = await query.run();
            } catch (err) {
               channel.nack(msg, false, false);
               session_logger.error(`[${action}SessionConsumer] Error fetching Salesforce Session ID: ${err.message}`);
               await sendMessage("ERROR", "500", `[${action}SessionConsumer] Error fetching Salesforce Session ID: ${err.message}`);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               session_logger.error(`[${action}SessionConsumer] No Salesforce Session found for UUID: ${rabbitMQMsg.SessionUUID}`);
               await sendMessage("ERROR", "404", `[${action}SessionConsumer] No Salesforce Session found for UUID: ${rabbitMQMsg.SessionUUID}`);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         let salesForceMsg;
         switch (action) {
            case "create":
               try {
                  const eventQuery = salesforceClient.sObject("Event__c")
                      .select("Id")
                      .where({UUID__c: rabbitMQMsg.EventUUID})
                      .limit(1);
                  const eventResult = await eventQuery.run();

                  salesForceMsg = {
                     UUID__c: rabbitMQMsg.SessionUUID,
                     Name: rabbitMQMsg.SessionName,
                     Description__c: rabbitMQMsg.SessionDescription || "",
                     StartDateTime__c: rabbitMQMsg.StartDateTime,
                     EndDateTime__c: rabbitMQMsg.EndDateTime,
                     Location__c: rabbitMQMsg.SessionLocation,
                     Capacity__c: rabbitMQMsg.Capacity || 0,
                     SessionType__c: rabbitMQMsg.SessionType,
                     Event__c: eventResult[0]?.Id || ""
                  };

                  if (rabbitMQMsg.GuestSpeakers?.GuestSpeaker?.[0]?.email) {
                     const gsQuery = salesforceClient.sObject("Contact")
                         .select("Id")
                         .where({Email: rabbitMQMsg.GuestSpeakers.GuestSpeaker[0].email})
                         .limit(1);
                     const gsResult = await gsQuery.run();
                     if (gsResult[0]?.Id) {
                        salesForceMsg.GuestSpeaker__c = gsResult[0].Id;
                     }
                  }

                  if (rabbitMQMsg.RegisteredUsers?.User) {
                     const participantIds = await Promise.all(
                         rabbitMQMsg.RegisteredUsers.User.map(async u => {
                            const participantQuery = salesforceClient.sObject("Session_Participant__c")
                                .select("Id")
                                .where({ParticipantEmail__c: u.email})
                                .limit(1);
                            const result = await participantQuery.run();
                            return result[0]?.Id;
                         })
                     );
                     salesForceMsg.RegisteredUsers__c = participantIds.filter(Boolean).join(';');
                  }

                  await salesforceClient.sObject("Session__c").create(salesForceMsg);
                  session_logger.info(`[${action}SessionConsumer] Sessie aangemaakt in Salesforce: ${JSON.stringify(salesForceMsg)}`);
                  await sendMessage("INFO", "201", `[${action}SessionConsumer] Sessie is created in Salesforce: ${JSON.stringify(salesForceMsg)}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  session_logger.error(`[${action}SessionConsumer] Error creating session in Salesforce: ${err.message}`);
                  await sendMessage("ERROR", "500", `[${action}SessionConsumer] Error creating session in Salesforce: ${err.message}`);
                  return;
               }
               break;

            case "update":
               try {
                  salesForceMsg = {
                     Id: SalesforceObjId,
                     ...(rabbitMQMsg.SessionName && {Name: rabbitMQMsg.SessionName}),
                     ...(rabbitMQMsg.SessionDescription && {Description__c: rabbitMQMsg.SessionDescription}),
                     ...(rabbitMQMsg.StartDateTime && {StartDateTime__c: rabbitMQMsg.StartDateTime}),
                     ...(rabbitMQMsg.EndDateTime && {EndDateTime__c: rabbitMQMsg.EndDateTime}),
                     ...(rabbitMQMsg.SessionLocation && {Location__c: rabbitMQMsg.SessionLocation}),
                     ...(rabbitMQMsg.Capacity && {Capacity__c: Number(rabbitMQMsg.Capacity)}),
                     ...(rabbitMQMsg.SessionType && {SessionType__c: rabbitMQMsg.SessionType})
                  };

                  if (rabbitMQMsg.GuestSpeakers?.GuestSpeaker) {
                     const guestList = Array.isArray(rabbitMQMsg.GuestSpeakers.GuestSpeaker)
                         ? rabbitMQMsg.GuestSpeakers.GuestSpeaker
                         : [rabbitMQMsg.GuestSpeakers.GuestSpeaker];

                     const guestIds = await Promise.all(
                         guestList.map(async guest => {
                            if (!guest?.email) return null;
                            const result = await salesforceClient.sObject("Contact")
                                .select("Id")
                                .where({Email: guest.email})
                                .limit(1)
                                .run();
                            return result[0]?.Id;
                         })
                     );

                     if (guestIds.length > 0) {
                        salesForceMsg.GuestSpeaker__c = guestIds.filter(Boolean).join(';');
                     }
                  }

                  if (rabbitMQMsg.RegisteredUsers?.User) {
                     const userList = Array.isArray(rabbitMQMsg.RegisteredUsers.User)
                         ? rabbitMQMsg.RegisteredUsers.User
                         : [rabbitMQMsg.RegisteredUsers.User];

                     const userIds = await Promise.all(
                         userList.map(async u => {
                            if (!u?.email) return null;
                            const result = await salesforceClient.sObject("Session_Participant__c")
                                .select("Id")
                                .where({ParticipantEmail__c: u.email})
                                .limit(1)
                                .run();
                            return result[0]?.Id;
                         })
                     );

                     if (userIds.length > 0) {
                        salesForceMsg.RegisteredUsers__c = userIds.filter(Boolean).join(';');
                     }
                  }

                  await salesforceClient.sObject("Session__c").update(salesForceMsg);
                  session_logger.info(`[${action}SessionConsumer] Sessie is updated in Salesforce: ${JSON.stringify(salesForceMsg)}`);
                  await sendMessage("INFO", "200", `[${action}SessionConsumer] Sessie is updated in Salesforce: ${JSON.stringify(salesForceMsg)}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  session_logger.error("Error when updating", err.message);
                  await sendMessage("ERROR", "500", `Error when updating session in Salesforce: ${err.message}`);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.sObject("Session__c").delete(SalesforceObjId);
                  session_logger.info(`[${action}SessionConsumer] Sessie is deleted from Salesforce: ${SalesforceObjId}`);
                  await sendMessage("INFO", "200", `[${action}SessionConsumer] Sessie is deleted from Salesforce: ${SalesforceObjId}`);
               } catch (err) {
                  channel.nack(msg, false, false);
                  session_logger.error(`[${action}SessionConsumer] Error deleting session in Salesforce: ${err.message}`);
                  await sendMessage("ERROR", "500", `Error deleting session in Salesforce: ${err.message}`);
                  return;
               }
               break;

            default:
               channel.nack(msg, false, false);
               session_logger.error(`[${action}SessionConsumer] Ongeldige queue: ${action}`);
               await sendMessage("ERROR", "400", `[${action}SessionConsumer] Ongeldige queue: ${action}`);
               return;
         }

         await channel.ack(msg);
      });

      session_logger.info("Listening for messages on queue: crm_session_" + action);
      await sendMessage("INFO", "200", "Listening for messages on queue: crm_session_" + action);
   }
};
