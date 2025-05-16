/**
 * @module UserConsumer
 * @file consumers/UserConsumer.js
 * @description Processes user-related messages from RabbitMQ and interacts with Salesforce.
 * @requires ../utils/xmlJsonTranslator
 * @requires ../utils/logger
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");
const { user_logger } = require("../utils/logger");

/**
 * Initializes and starts the UserConsumer to process messages from RabbitMQ queues.
 * @param action - The action type (create, update, delete).
 * @param msg - The message object from RabbitMQ.
 * @param channel - The RabbitMQ channel for consuming messages.
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} - Resolves when the consumer is started.
 */
async function processMessage(action, msg, channel, salesforceClient) {
   const content = msg.content.toString();
   user_logger.info(`[${action}UserConsumer] Ontvangen`, content);

   let jsonConv;
   try {
      jsonConv = await xmlJsonTranslator.xmlToJson(content);
   } catch (e) {
      handleInvalidMessage(channel, msg, 'Ongeldig XML formaat:', content);
      return;
   }

   if (!jsonConv.UserMessage) {
      handleInvalidMessage(channel, msg, "Ongeldig formaat:", jsonConv);
      return;
   }

   const objectData = jsonConv.UserMessage;

   if (!objectData.UUID) {
      handleInvalidMessage(channel, msg, "UUID ontbreekt in het bericht");
      return;
   }

   let SalesforceObjId;
   if (['update', 'delete'].includes(action)) {
      SalesforceObjId = await getSalesforceId(objectData.UUID, salesforceClient, channel, msg);
      if (!SalesforceObjId) return;
   }

   await handleAction(action, objectData, SalesforceObjId, salesforceClient, channel, msg);
}

/**
 * Handles invalid messages by logging the error and sending a negative acknowledgment.
 * @param channel - The RabbitMQ channel for consuming messages.
 * @param msg - The message object from RabbitMQ.
 * @param errorMessage - The error message to log.
 * @param content - The content of the message (optional).
 * @returns {void}
 */
function handleInvalidMessage(channel, msg, errorMessage, content = null) {
   channel.nack(msg, false, false);
   user_logger.error(errorMessage, content);
}

/**
 * Retrieves the Salesforce ID for a given UUID.
 * @param UUID - The UUID to search for.
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @param channel - The RabbitMQ channel for consuming messages.
 * @param msg - The message object from RabbitMQ.
 * @returns {Promise<*|null>} - The Salesforce ID if found, otherwise null.
 */
async function getSalesforceId(UUID, salesforceClient, channel, msg) {
   const query = salesforceClient.sObject("Contact")
      .select("Id")
      .where({ UUID__c: UUID })
      .limit(1);

   try {
      const result = await query.run();
      if (!result || result.length === 0) {
         handleInvalidMessage(channel, msg, "Geen Salesforce ID gevonden voor UUID:", UUID);
         return null;
      }
      return result[0].Id;
   } catch (err) {
      handleInvalidMessage(channel, msg, "Fout bij ophalen Salesforce ID:", err.message);
      return null;
   }
}

/**
 * Handles the action based on the message type (create, update, delete).
 * @param action - The action type (create, update, delete).
 * @param objectData - The object data extracted from the message.
 * @param SalesforceObjId - The Salesforce object ID (if applicable).
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @param channel - The RabbitMQ channel for consuming messages.
 * @param msg - The message object from RabbitMQ.
 * @returns {Promise<void>} - Resolves when the action is completed.
 */
async function handleAction(action, objectData, SalesforceObjId, salesforceClient, channel, msg) {
   try {
      switch (action) {
         case "create":
            await createUser(objectData, salesforceClient);
            break;
         case "update":
            await updateUser(SalesforceObjId, objectData, salesforceClient);
            break;
         case "delete":
            await deleteUser(SalesforceObjId, salesforceClient);
            break;
         default:
            handleInvalidMessage(channel, msg, `Ongeldige queue: ${action}`);
            return;
      }
      await channel.ack(msg);
   } catch (err) {
      channel.nack(msg, false, false);
      user_logger.error(`Fout bij ${action}:`, err.message);
   }
}

/**
 * Creates a new user in Salesforce.
 * @param objectData - The object data extracted from the message.
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} - Resolves when the user is created.
 */
async function createUser(objectData, salesforceClient) {
   const JSONMsg = {
      "UUID__c": objectData.UUID,
      "TimeOfAction__c": objectData.TimeOfAction__c,
      "Password__c": objectData.EncryptedPassword || "",
      "FirstName": objectData.FirstName || "",
      "LastName": objectData.LastName || "",
      "Phone": objectData.Phone || "",
      "Email": objectData.Email || "",
   };
   await salesforceClient.createUser(JSONMsg);
   user_logger.info("Gebruiker aangemaakt in Salesforce");
}

/**
 * Updates an existing user in Salesforce.
 * @param SalesforceObjId - The Salesforce object ID of the user to update.
 * @param objectData - The object data extracted from the message.
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} - Resolves when the user is updated.
 */
async function updateUser(SalesforceObjId, objectData, salesforceClient) {
   const JSONMsg = {
      "TimeOfAction__c": objectData.TimeOfAction__c,
      "Password__c": objectData.EncryptedPassword || "",
      "FirstName": objectData.FirstName || "",
      "LastName": objectData.LastName || "",
      "Phone": objectData.Phone || "",
      "Email": objectData.Email || "",
   };
   await salesforceClient.updateUser(SalesforceObjId, JSONMsg);
   user_logger.info("Gebruiker geüpdatet in Salesforce");
}

/**
 * Deletes a user from Salesforce.
 * @param SalesforceObjId - The Salesforce object ID of the user to delete.
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} - Resolves when the user is deleted.
 */
async function deleteUser(SalesforceObjId, salesforceClient) {
   await salesforceClient.deleteUser(SalesforceObjId);
   user_logger.info("Gebruiker verwijderd uit Salesforce");
}

/**
 * Starts the UserConsumer to listen for messages on RabbitMQ queues.
 * @param channel - The RabbitMQ channel for consuming messages.
 * @param salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} - Resolves when the consumer is started.
 */
module.exports = async function StartUserConsumer(channel, salesforceClient) {
   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_user_${action}`, { durable: true });

      await channel.consume(`crm_user_${action}`, async (msg) => {
         if (!msg) return;
         await processMessage(action, msg, channel, salesforceClient);
      });

      user_logger.info(`Listening for messages on queue "crm_user_${action}"…`);
   }
};