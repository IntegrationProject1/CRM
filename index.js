require('dotenv').config();
const amqp               = require('amqplib');
const os                 = require('os');
const SalesforceClient   = require('./salesforceClient');
const createUserConsumer = require('./consumers/createUserConsumer');
const updateUserConsumer = require('./consumers/updateUserConsumer');
const deleteUserConsumer = require('./consumers/deleteUserConsumer');

(async () => {
  try {
    // ─── 1️⃣ RabbitMQ connectie & exchanges ──────────────────────────────
    const conn    = await amqp.connect({
      protocol: 'amqp',
      hostname: process.env.RABBITMQ_HOST,
      port:     +process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
      vhost:    '/'
    });
    const channel = await conn.createChannel();

    const hbX   = process.env.RABBITMQ_EXCHANGE_HEARTBEAT;
    const crudX = process.env.RABBITMQ_EXCHANGE_CRUD;

    await channel.assertExchange(hbX,   'fanout', { durable: true });
    await channel.assertExchange(crudX, 'direct', { durable: true });
    console.log('✅ Verbonden met RabbitMQ');

    // ─── 2️⃣ Login bij Salesforce via jsforce ──────────────────────────────
    const sfClient = new SalesforceClient(
      process.env.SALESFORCE_USERNAME,
      process.env.SALESFORCE_PASSWORD,
      process.env.SALESFORCE_TOKEN,
      process.env.SALESFORCE_LOGIN_URL
    );
    await sfClient.login(); // 🔐 OAuth-login via jsforce

    // ─── 3️⃣ Start de consumers ────────────────────────────────────────────
    await createUserConsumer(channel, sfClient, crudX);
    await updateUserConsumer(channel, sfClient, crudX);
    await deleteUserConsumer(channel, sfClient, crudX);

    // ─── 4️⃣ Heartbeat elke 5s ─────────────────────────────────────────────
    setInterval(() => {
      const timestamp = new Date().toISOString();
      const hostname  = os.hostname();
      const xml = `
<Heartbeat>
  <ServiceName>crm-service</ServiceName>
  <Status>Online</Status>
  <Timestamp>${timestamp}</Timestamp>
  <HeartBeatInterval>1</HeartBeatInterval>
  <Metadata>
    <Version>1.0.0</Version>
    <Host>${hostname}</Host>
    <Environment>Production</Environment>
  </Metadata>
</Heartbeat>`.trim();

      channel.publish(hbX, '', Buffer.from(xml));
      console.log('📡 Heartbeat verzonden:\n', xml);
    }, 1000);

  } catch (err) {
    console.error('❌ Fout bij opstarten:', err.response?.data || err.message);
    process.exit(1);
  }
})();
// const startCDCListener = require('./cdcListener');
// startCDCListener();
