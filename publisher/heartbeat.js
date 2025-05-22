const path = require('path');
const {validateXml} = require('../utils/xmlValidator');
const fs = require("fs");

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

   setInterval(() => {
      const xml = `
            <Heartbeat>
              <ServiceName>${serviceName}</ServiceName>
            </Heartbeat>`.trim();

      const xsdPath = path.join(__dirname, '../xsd/heartbeatXSD/heartbeat.xsd');

      if (!fs.existsSync(xsdPath)) {
         console.error('❌ XSD file not found. Ensure it exists at:', xsdPath);
         return;
      }

      if (!validateXml(xml, xsdPath)) {
         console.error('❌ Heartbeat XML is niet geldig tegen XSD. Bericht NIET verzonden.');
         return;
      }

      channel.publish(exchangeName, routingKey, Buffer.from(xml));
      // console.log('📡 Geldige Heartbeat verzonden:\n', xml);
   }, 1000); // 1000 = 1 seconde
}
module.exports = startHeartbeat;