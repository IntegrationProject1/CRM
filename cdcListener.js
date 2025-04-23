const jsforce = require('jsforce');
const amqp = require('amqplib');

async function startCDCListener() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SALESFORCE_LOGIN_URL
  });

  await conn.login(
    process.env.SALESFORCE_USERNAME,
    process.env.SALESFORCE_PASSWORD + process.env.SALESFORCE_TOKEN
  );

  console.log('✅ Verbonden met Salesforce Streaming API');

  const amqpConn = await amqp.connect(`amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
  const channel = await amqpConn.createChannel();

  // Luister op de standaard CDC kanaal voor Contact
  const replayId = -1; // -1 = nieuwste events
  const channelName = '/data/ContactChangeEvent';

  const client = conn.streaming.createClient([
    new jsforce.StreamingExtension.Replay(channelName, replayId),
    new jsforce.StreamingExtension.AuthFailure(() => {
      console.error("🔐 Auth failure in streaming");
    })
  ]);

  const subscription = client.subscribe(channelName, async (message) => {
    console.log("📥 Salesforce CDC Event ontvangen:", message);

    const { changeType, payload } = message;
    const action = changeType.toLowerCase(); // create | update | delete
    const routingKey = `crm_user_${action}`;

    const formattedMessage = {
      uuid: payload.Id, // evt. External_Id__c
      source: "salesforce",
      action: action,
      payload: {
        FirstName: payload.FirstName,
        LastName: payload.LastName,
        Email: payload.Email
      }
    };

    // Publiceer op alle relevante queues
    const targetQueues = [
      `frontend_user_${action}`,
      `facturatie_user_${action}`,
      `kassa_user_${action}`
    ];

    for (const q of targetQueues) {
      await channel.assertQueue(q, { durable: true });
      channel.sendToQueue(q, Buffer.from(JSON.stringify(formattedMessage)));
      console.log(`📤 Bericht verstuurd naar ${q}`);
    }
  });

  subscription.on('error', (err) => {
    console.error('❌ CDC Listener Error:', err);
  });
}

module.exports = startCDCListener;
