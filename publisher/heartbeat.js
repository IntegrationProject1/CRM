/**
 * Heartbeat Publisher
 * @module HeartbeatPublisher
 * @file publisher/heartbeat.js
 * @description Sends periodic heartbeat messages to a RabbitMQ exchange to monitor service health.
 * @requires path - Provides utilities for working with file and directory paths.
 * @requires validateXml - A utility function for validating XML against an XSD schema.
 * @requires fs - Provides file system operations.
 * @requires heartbeat_logger - A logger for logging events in the HeartbeatPublisher.
 * @requires sendMessage - A function to send messages to the RabbitMQ log exchange.
 */

const path = require('path');
const {validateXml} = require('../utils/xmlValidator');
const fs = require("fs");
const {heartbeat_logger} = require("../utils/logger");
const {sendMessage} = require("./logger");

/**
 * Starts sending periodic heartbeat messages to a RabbitMQ exchange.
 * @param {Object} channel - RabbitMQ channel to publish messages.
 * @param {string} exchangeName - Name of the exchange to publish to.
 * @param {string} [routingKey=''] - Routing key for the message (optional).
 * @param {string} [serviceName='CRM'] - Service name (optional).
 * @returns {Promise<void>} Resolves when exchange is set and interval starts.
 * @example
 * const channel = await rabbitMQConnection.createChannel();
 * startHeartbeat(channel, 'heartbeatExchange', 'heartbeat.routingKey', 'CRM_Service');
 */
async function startHeartbeat(channel, exchangeName, routingKey, serviceName = 'CRM') {
   await channel.assertExchange(exchangeName, 'direct', {durable: true});

   setInterval(async () => {
      const xml = `
            <Heartbeat>
              <ServiceName>${serviceName}</ServiceName>
            </Heartbeat>`.trim();

      const xsdPath = path.join(__dirname, '../xsd/heartbeatXSD/heartbeat.xsd');

      if (!fs.existsSync(xsdPath)) {
         heartbeat_logger.error('XSD file not found. Ensure it exists at:', xsdPath);
         await sendMessage("error", "500", "XSD file not found");
         return;
      }

      if (!validateXml(xml, xsdPath)) {
         heartbeat_logger.error('Heartbeat XML not valid based on the XSD. Message not send.');
         await sendMessage("error", "400", "Heartbeat XML not valid based on the XSD");
         return;
      }

      channel.publish(exchangeName, routingKey, Buffer.from(xml));
      // console.log('📡 Geldige Heartbeat verzonden:\n', xml);
   }, 1000); // 1000 = 1 seconde
}
module.exports = startHeartbeat;