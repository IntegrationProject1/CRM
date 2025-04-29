const os = require('os');

function startHeartbeat(channel, exchangeName, serviceName = 'CRM_Service') {
    setInterval(() => {
        const xml = `
<Heartbeat>
  <ServiceName>${serviceName}</ServiceName>
  <Timestamp>${new Date().toISOString()}</Timestamp>
  <Hostname>${os.hostname()}</Hostname>
</Heartbeat>`.trim();

        channel.publish(exchangeName, '', Buffer.from(xml));
        console.log('📡 Heartbeat verzonden:\n', xml);
    }, 5000); // elke 5 seconden
}

module.exports = startHeartbeat;
