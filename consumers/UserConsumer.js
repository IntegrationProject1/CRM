/**
 * @module UserConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van gebruikers in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");
const { addressToJson } = require("../utils/adressTranslator");
const {user_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");

/**
 * Start de UserConsumer om berichten van RabbitMQ-queues te verwerken.
 * @param {Object} channel - Het RabbitMQ-kanaal voor het consumeren van berichten.
 * @param {Object} salesforceClient - De Salesforce-client voor interactie met Salesforce.
 * @returns {Promise<void>} - Een belofte die wordt vervuld wanneer de consumer is gestart.
 */
module.exports = async function StartUserConsumer(channel, salesforceClient) {

   const queues = ["create", "update", "delete"];

   for (const action of queues) {
      await channel.assertQueue(`crm_user_${action}`, {durable: true});

      await channel.consume(`crm_user_${action}`, async (msg) => {
         if (!msg) return;

         const content = msg.content.toString();
         user_logger.info(`[${action}UserConsumer] Received: ${content}`);
         await sendMessage("info", "200", "[UserConsumer] Received: " + content);

         // convert XML to JSON
         let jsonConv;
         try {
            jsonConv = await xmlJsonTranslator.xmlToJson(content);
         } catch (e) {
            channel.nack(msg, false, false);
            user_logger.error("[UserConsumer] Invalid xml formate:", e);
            await sendMessage("error", "400", "[UserConsumer] Invalid xml formate: " + e);
            return;
         }

         if (!jsonConv.UserMessage) {
            channel.nack(msg, false, false);
            user_logger.error("Invalid format:", jsonConv);
            await sendMessage("error", "400", "[UserConsumer] Invalid format: " + jsonConv);
            return;
         }
         const objectData = jsonConv.UserMessage;

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
                user_logger.error("[UserConsumer] Error retrieving Salesforce ID:", err.message);
                await sendMessage("error", "400", "[UserConsumer] Error retrieving Salesforce ID: " + err.message);
               return;
            }

            if (!result || result.length === 0) {
               channel.nack(msg, false, false);
               user_logger.error("[UserConsumer] No Salesforce ID found for UUID:", objectData.UUID);
               await sendMessage("error", "400", "[UserConsumer] No Salesforce ID found for UUID: " + objectData.UUID);
               return;
            }
            SalesforceObjId = result[0].Id;
         }

         if (!objectData.UUID) {
            channel.nack(msg, false, false);
            console.error("❌ UUID ontbreekt in het bericht");
            user_logger.error("[UserConsumer] UUID missing in message:");
            await sendMessage("error", "400", "[UserConsumer] UUID missing in message");
            return;
         }

         let JSONMsg;

         switch (action) {
            case "create":
               try {
                  const businessData = objectData.Business || {};
                  const realAddress = addressToJson(businessData.RealAddress || "");
                  const facturationAddress = addressToJson(businessData.FacturationAddress || "");

                  JSONMsg = {
                     "UUID__c": objectData.UUID,
                     "TimeOfAction__c": objectData.TimeOfAction,
                     "Password__c": objectData.EncryptedPassword || "",
                     "FirstName": objectData.FirstName || "",
                     "LastName": objectData.LastName || "",
                     "Phone": objectData.PhoneNumber || "",
                     "Email": objectData.EmailAddress || "",
                     // Business velden
                     "BusinessName__c": businessData.BusinessName || "",
                     "BusinessEmail__c": businessData.BusinessEmail || "",
                     "BTWNumber__c": businessData.BTWNumber || "",
                     // RealAddress mapping
                     "MailingStreet": `${realAddress.Street}`.trim(),
                     "MailingCity": realAddress.City || "",
                     "MailingState": realAddress.State || "",
                     "MailingPostalCode": realAddress.PostalCode || "",
                     "MailingCountry": realAddress.Country || "",
                     // FacturationAddress mapping
                     "OtherStreet": `${facturationAddress.Street}`.trim(),
                     "OtherCity": facturationAddress.City || "",
                     "OtherState": facturationAddress.State || "",
                     "OtherPostalCode": facturationAddress.PostalCode || "",
                     "OtherCountry": facturationAddress.Country || ""
                  };

                  await salesforceClient.createUser(JSONMsg);
                  user_logger.info("[UserConsumer] User created:", JSONMsg);
                  await sendMessage("info", "201", "[UserConsumer] User created: " + JSONMsg);
               } catch (err) {
                  channel.nack(msg, false, false);
                  user_logger.error("[UserConsumer] Error creating user:", err.message);
                  await sendMessage("error", "400", "[UserConsumer] Error creating user: " + err.message);
                  return;
               }
               break;

            case "update":
               try {
                  const businessData = objectData.Business || {};
                  const realAddress = addressToJson(businessData.RealAddress || "");
                  const facturationAddress = addressToJson(businessData.FacturationAddress || "");

                  JSONMsg = {
                     "TimeOfAction__c": objectData.TimeOfAction,
                     "Password__c": objectData.EncryptedPassword || "",
                     "FirstName": objectData.FirstName || "",
                     "LastName": objectData.LastName || "",
                     "Phone": objectData.PhoneNumber || "",
                     "Email": objectData.EmailAddress || "",
                     // Business velden
                     "BusinessName__c": businessData.BusinessName || "",
                     "BusinessEmail__c": businessData.BusinessEmail || "",
                     "BTWNumber__c": businessData.BTWNumber || "",
                     // Adres updates
                     "MailingStreet": `${realAddress.Street}`.trim(),
                     "MailingCity": realAddress.City || "",
                     "MailingState": realAddress.State || "",
                     "MailingPostalCode": realAddress.PostalCode || "",
                     "MailingCountry": realAddress.Country || "",
                     "OtherStreet": `${facturationAddress.Street}`.trim(),
                     "OtherCity": facturationAddress.City || "",
                     "OtherState": facturationAddress.State || "",
                     "OtherPostalCode": facturationAddress.PostalCode || "",
                     "OtherCountry": facturationAddress.Country || ""
                  };

                  await salesforceClient.updateUser(SalesforceObjId, JSONMsg);
                  user_logger.info("[UserConsumer] User updated:", JSONMsg);
                  await sendMessage("info", "200", "[UserConsumer] User updated: " + JSONMsg);
               } catch (err) {
                  channel.nack(msg, false, false);
                  user_logger.error("[UserConsumer] Error updating user:", err.message);
                  await sendMessage("error", "400", "[UserConsumer] Error updating user: " + err.message);
                  return;
               }
               break;

            case "delete":
               try {
                  await salesforceClient.deleteUser(SalesforceObjId);
                  user_logger.info("[UserConsumer] User deleted:", SalesforceObjId);
                  await sendMessage("info", "200", "[UserConsumer] User deleted: " + SalesforceObjId);
               } catch (err) {
                  channel.nack(msg, false, false);
                  user_logger.error("[UserConsumer] Error deleting user:", err.message);
                  await sendMessage("error", "400", "[UserConsumer] Error deleting user: " + err.message);
                  return;
               }
               break;

            default:
               channel.nack(msg, false, false);
               user_logger.error("[UserConsumer] Invalid queue:", action);
               await sendMessage("error", "400", "[UserConsumer] Invalid queue: " + action);
               return;
         }

         await channel.ack(msg);
      });
      user_logger.info(`[UserConsumer] Listening for messages on queue "crm_user_${action}"…`);
      await sendMessage("info", "200", "[UserConsumer] Listening for messages on queue");
   }
};
