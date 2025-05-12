const path = require('path');
const { validateXml } = require('../utils/xmlValidator');

/**
 * Starts sending periodic heartbeat messages to a RabbitMQ exchange.
 * @param {Object} channel - RabbitMQ channel to publish messages.
 * @param {string} exchangeName - Name of the exchange to publish to.
 * @param {string} [serviceName='CRM_Service'] - Service name (optional).
 * @returns {Promise<void>} Resolves when exchange is set and interval starts.
 */

async function startHeartbeat(channel, exchangeName, serviceName = 'CRM_Service') {
   try {
      // 1. Exchange aanmaken
      await channel.assertExchange(exchangeName, 'direct', { durable: true });

      // 2. Queue aanmaken en binden met lege routing key
      const queueName = exchangeName; // Gebruik dezelfde naam als exchange
      await channel.assertQueue(queueName, {
         durable: true,
         arguments: {
            'x-queue-type': 'classic' // Explicitiet voor classic queues
         }
      });

      // 3. Bind queue aan exchange
      await channel.bindQueue(queueName, exchangeName, '');

      // 4. Start heartbeat interval
      setInterval(() => {
         const xml = `
                <Heartbeat>
                    <ServiceName>${serviceName}</ServiceName>
                </Heartbeat>`.trim();

         const xsdPath = path.join(__dirname, '../xsd/heartbeatXSD/heartbeat.xsd');

         if (!validateXml(xml, xsdPath)) {
            console.error('❌ Heartbeat XML is niet geldig tegen XSD. Bericht NIET verzonden.');
            return;
         }

         channel.publish(exchangeName, '', Buffer.from(xml));
         console.log('📡 Geldige Heartbeat verzonden naar queue:', xml);
      }, 1000);

   } catch (error) {
      console.error('❌ Fout in heartbeat setup:', error);
      throw error;
   }
}

module.exports = startHeartbeat;