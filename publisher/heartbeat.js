const os = require('os');
const path = require('path');
const { validateXml } = require('../xmlValidator');

function startHeartbeat(channel, exchangeName, serviceName = 'CRM_Service') {
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
        console.log('📡 Geldige Heartbeat verzonden:\n', xml);
    }, 1000); //
}

module.exports = startHeartbeat;
