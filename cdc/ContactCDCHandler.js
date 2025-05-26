/**
 * Contact CDC Handler
 * @module ContactCDCHandler
 * @file cdc/ContactCDCHandler.js
 * @description Processes Salesforce Change Data Capture (CDC) messages for Contact objects and publishes them to RabbitMQ.
 * @requires dotenv - Loads environment variables from a `.env` file.
 * @requires jsonToXml - A utility for converting JSON objects to XML format.
 * @requires validator - A utility for validating XML against an XSD schema.
 * @requires hrtimeBase - A base time for generating microsecond precision timestamps.
 * @requires jsonToAddress - A utility for converting Salesforce address objects to a standardized string format.
 * @requires user_logger - A logger for logging events in the ContactCDCHandler.
 * @requires sendMessage - A function to send messages to the RabbitMQ queue.
 */

require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const hrtimeBase = process.hrtime.bigint();
const { jsonToAddress } = require("../utils/adressTranslator");
const {user_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");

/**
 * Formats a Salesforce address object into a standardized string format.
 * @param {Object} address - The Salesforce address object.
 * @returns {string} - The formatted address string.
 * @example
 * const address = {
 *    Street: "Main Street",
 *    HouseNumber: "123",
 *    BusCode: "A",
 *    City: "Amsterdam",
 *    State: "North Holland",
 *    PostalCode: "1012AB",
 *    Country: "Netherlands"
 * };
 * const formattedAddress = formatAddress(address);
 * console.log(formattedAddress);
 * // "Main Street 123 A, Amsterdam, North Holland, 1012AB, Netherlands"
 */
async function formatAddress(address) {
   if (!address || !address.Street) return "";

   try {
      const streetParts = [
         address.Street,
         address.HouseNumber,
         address.BusCode
      ].filter(Boolean).join(' ');

      return jsonToAddress({
         Country: address.Country || '',
         State: address.State || '',
         PostalCode: address.PostalCode || '',
         City: address.City || '',
         Street: streetParts
      });
   } catch (error) {
      user_logger.error('Address conversion error:', error);
      await sendMessage("error", "500", `Address conversion error: ${error.message}`);
      return "";
   }
}

/**
 * Generates the current ISO 8601 timestamp with microsecond precision.
 * @returns {string} - The generated timestamp.
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
 * Processes Salesforce CDC messages for Contact objects and publishes them to RabbitMQ.
 * @param {Object} message - The CDC message payload.
 * @param {Object} sfClient - The Salesforce client for interacting with Salesforce.
 * @param {Object} RMQChannel - The RabbitMQ channel for publishing messages.
 * @returns {Promise<void>} - A promise that resolves when the message is processed.
 */
module.exports = async function ContactCDCHandler(message, sfClient, RMQChannel) {
   const { ChangeEventHeader, ...cdcObjectData } = message.payload;

   const ignoreOrigin = process.env.IGNORE_CDC_API_ORIGIN === 'true';
   if (!ignoreOrigin && ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
      user_logger.debug("Salesforce API call detected, skipping action.");
      return;
   }

   const action = ChangeEventHeader.changeType;
   user_logger.info('Captured Contact CDC Event:', { header: ChangeEventHeader, changes: cdcObjectData });
   await sendMessage("info", "200", `Captured Contact CDC Event: ${JSON.stringify({ header: ChangeEventHeader, changes: cdcObjectData })}`);

   let recordId;
   if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) {
         user_logger.error('No recordId found for action:', action);
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
            await sfClient.updateUser(recordId, { UUID__c: UUID });
            user_logger.info("UUID successfully updated:", UUID);
            await sendMessage("info", "200", `UUID successfully updated: ${UUID}`);


            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: UUID,
                  TimeOfAction: new Date().toISOString(),
                  EncryptedPassword: cdcObjectData.Password__c || "",
                  FirstName: cdcObjectData.Name?.FirstName || "",
                  LastName: cdcObjectData.Name?.LastName || "",
                  PhoneNumber: cdcObjectData.Phone || "",
                  EmailAddress: cdcObjectData.Email || "",

                  Business: {
                     BusinessName: cdcObjectData.BusinessName__c || "",
                     BusinessEmail: cdcObjectData.BusinessEmail__c || "",
                     RealAddress: cdcObjectData.MailingAddress
                         ? jsonToAddress(cdcObjectData.MailingAddress)
                         : "",
                     BTWNumber: cdcObjectData.BTWNumber__c || "",
                     FacturationAddress: cdcObjectData.OtherAddress
                         ? jsonToAddress(cdcObjectData.OtherAddress)
                         : ""
                  }
               }
            };
            // console.warn('test create', JSONMsg);
            xsdPath = './xsd/userXSD/UserCreate.xsd';
            break;

         case 'UPDATE':
            const updatedRecord = await sfClient.sObject('Contact').retrieve(recordId);
            if (!updatedRecord?.UUID__c) {
               throw new Error(`No UUID found for record: ${recordId}`);
            }

            // Maak adresobjecten van Salesforce velden voor de update te laten werken.
            const mailingAddress = {
               Street: updatedRecord.MailingStreet,
               City: updatedRecord.MailingCity,
               State: updatedRecord.MailingState,
               PostalCode: updatedRecord.MailingPostalCode,
               Country: updatedRecord.MailingCountry
            };

            const otherAddress = {
               Street: updatedRecord.OtherStreet,
               City: updatedRecord.OtherCity,
               State: updatedRecord.OtherState,
               PostalCode: updatedRecord.OtherPostalCode,
               Country: updatedRecord.OtherCountry
            };

            JSONMsg = {
               UserMessage: {
                  ActionType: action,
                  UUID: updatedRecord.UUID__c,
                  TimeOfAction: new Date().toISOString(),
                  EncryptedPassword: updatedRecord.Password__c || "",
                  FirstName: updatedRecord.FirstName || "",
                  LastName: updatedRecord.LastName || "",
                  PhoneNumber: updatedRecord.Phone || "",
                  EmailAddress: updatedRecord.Email || "",
                  Business: {
                     BusinessName: updatedRecord.BusinessName__c || "",
                     BusinessEmail: updatedRecord.BusinessEmail__c || "",
                     RealAddress: formatAddress(mailingAddress),
                     BTWNumber: updatedRecord.BTWNumber__c || "",
                     FacturationAddress: formatAddress(otherAddress)
                  }
               }
            };
            xsdPath = './xsd/userXSD/UserUpdate.xsd';
            break;

         case 'DELETE':
            const query = sfClient.sObject('Contact')
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
               UserMessage: {
                  ActionType: action,
                  UUID: deletedRecord.UUID__c,
                  TimeOfAction: new Date().toISOString(),
               }
            };
            xsdPath = './xsd/userXSD/UserDelete.xsd';
            break;

         default:
            user_logger.warn("Unhandled action:", action);
            await sendMessage("warn", "400", `Unhandled action: ${action}`);

            return;
      }

      xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
      if (!validator.validateXml(xmlMessage, xsdPath)) {
         throw new Error(`XML validation failed for action: ${action}`);
      }

      const exchangeName = 'user';
      await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

      const routingKeys = [
         `frontend.user.${action.toLowerCase()}`,
         `facturatie.user.${action.toLowerCase()}`,
         `kassa.user.${action.toLowerCase()}`
      ];

      for (const routingKey of routingKeys) {
         RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
         console.log(`Message sent to ${exchangeName} (${routingKey})`);
      }

   } catch (error) {
      console.error(`Critical error during ${action} actie:`, error.message);
      if (error.response?.body) {
         console.error('Salesforce API error details:', error.response.body);
      }
   }
};
