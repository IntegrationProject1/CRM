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
 * @param {string} [serviceName='CRM_Service'] - Service name (optional).
 * @returns {Promise<void>} Resolves when exchange is set and interval starts.
 */

async function startHeartbeat(channel, exchangeName, routingKey, serviceName = 'CRM_Service') {
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