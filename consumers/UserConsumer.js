/**
 * @module UserConsumer
 * @file consumers/UserConsumer.js
 * @description Processes user-related messages from RabbitMQ and interacts with Salesforce.
 * @requires ../utils/xmlJsonTranslator
 * @requires ../utils/logger
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");
const {user_logger} = require("../utils/logger");

/**
 * Initializes and starts the UserConsumer to process messages from RabbitMQ queues.
 * Handles create, update, and delete actions for users in Salesforce.
 *
 * @async
 * @function
 * @param {Object} channel - The RabbitMQ channel for consuming messages.
 * @param {Object} salesforceClient - The Salesforce client for interacting with Salesforce.
 * @returns {Promise<void>} Resolves when the consumer is started.
 */
module.exports = async function StartUserConsumer(channel, salesforceClient) {

   /**
    * List of user actions to listen for.
    * @type {string[]}
    */
   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_user_${action}`, {durable: true});

      await channel.consume(`crm_user_${action}`, async (msg) => {
         if (!msg) return;

         /**
          * The message content as a string.
          * @type {string}
          */
         const content = msg.content.toString();
         // console.log(`📥 [${action}UserConsumer] Ontvangen`);
         user_logger.info(`[${action}UserConsumer] Ontvangen`, content);

         // convert XML to JSON
         /**
          * The parsed JSON object from the XML message.
          * @type {Object}
          */
         let jsonConv;
         try {
            jsonConv = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            // console.error('❌ Ongeldig XML formaat:', content);
            user_logger.error('Ongeldig XML formaat:', content);
            return;
         }

         if (!jsonConv.UserMessage) {
            channel.nack(msg, false, false);
            // console.error("❌ Ongeldig formaat:", jsonConv);
            user_logger.error("Ongeldig formaat:", jsonConv);
            return;
         }
         /**
          * The user data extracted from the message.
          * @type {Object}
          */
         const objectData = jsonConv.UserMessage;

         /**
          * Salesforce Contact object ID, if applicable.
          * @type {string|undefined}
          */
         let SalesforceObjId;
         if (['update', 'delete'].includes(action)) { // Salesforce object ID ophalen (op basis van UUID) voor update/delete
            // retrieve Salesforce ID from UUID
            const query = salesforceClient.sObject("Contact")
                .select("Id")
                .where({ UUID__c: objectData.UUID })
                .limit(1);

            let result;
            try {
               result = await query.run();
            } catch (err) {
               channel.nack(msg, false, false);
               // console.error("❌ Fout bij ophalen Salesforce ID:", err.message);
               user_logger.error("Fout bij ophalen Salesforce ID:", err.message);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               // console.error("❌ Geen Salesforce ID gevonden voor UUID:", objectData.UUID);
               user_logger.error("Geen Salesforce ID gevonden voor UUID:", objectData.UUID);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         if (!objectData.UUID) {
            channel.nack(msg, false, false);
            console.error("❌ UUID ontbreekt in het bericht");
            return;
         }

         /**
          * The payload to send to Salesforce.
          * @type {Object}
          */
         let JSONMsg;

         switch (action) {
            case "create":
               try {
                  JSONMsg = {
                     "UUID__c": objectData.UUID,
                     "TimeOfAction__c": objectData.TimeOfAction__c,
                     "Password__c": objectData.EncryptedPassword || "",
                     "FirstName": objectData.FirstName || "",
                     "LastName": objectData.LastName || "",
                     "Phone": objectData.Phone || "",
                     "Email": objectData.Email || "",
                     // "Business": { // Is nog niet in SalesForce  verwerkt
                     //    "BusinessName": objectData.BusinessName || "",
                     //    "BusinessEmail": objectData.BusinessEmail || "",
                     //    "RealAddress": objectData.RealAddress || "",
                     //    "BTWNumber": objectData.BTWNumber || "",
                     //    "FacturationAddress": objectData.FacturationAddress || ""
                     // }
                  };

                  await salesforceClient.createUser(JSONMsg);
                  // console.log("✅ Gebruiker aangemaakt in Salesforce");
                  user_logger.info("Gebruiker aangemaakt in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  // console.error("❌ Fout bij create:", err.message);
                  user_logger.error("Fout bij create:", err.message);
                  return;
               }
               break;

            case "update":
               try {
                  JSONMsg = {
                     "TimeOfAction__c": objectData.TimeOfAction__c,
                     "Password__c": objectData.EncryptedPassword || "",
                     "FirstName": objectData.FirstName || "",
                     "LastName": objectData.LastName || "",
                     "Phone": objectData.Phone || "",
                     "Email": objectData.Email || "",
                  };

                  await salesforceClient.updateUser(SalesforceObjId, JSONMsg);
                  // console.log("✅ Gebruiker geüpdatet in Salesforce");
                  user_logger.info("Gebruiker geüpdatet in Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  // console.error("❌ Fout bij update:", err.message);
                  user_logger.error("Fout bij update:", err.message);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.deleteUser(SalesforceObjId);
                  // console.log("✅ Gebruiker verwijderd uit Salesforce");
                  user_logger.info("Gebruiker verwijderd uit Salesforce");
               } catch (err) {
                  channel.nack(msg, false, false);
                  // console.error("❌ Fout bij delete:", err.message);
                  user_logger.error("Fout bij delete:", err.message);
                  return;
               }
               break;

            default:
               channel.nack(msg, false, false);
               // console.error(`❌ Ongeldige queue: ${action}`);
               user_logger.error(`Ongeldige queue: ${action}`);
               return;
         }

         await channel.ack(msg);
      });

      // console.log(`🔔 Listening for messages on queue "crm_user_${action}"…`);
      user_logger.info(`Listening for messages on queue "crm_user_${action}"…`);
   }
};