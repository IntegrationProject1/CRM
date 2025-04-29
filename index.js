require('dotenv').config();
const amqp               = require('amqplib');
const os                 = require('os');
const ContactCDCHandler = require('./ContactCDCHandler');
const SalesforceClient   = require('./salesforceClient');
const createUserConsumer = require('./consumers/createUserConsumer');
const updateUserConsumer = require('./consumers/updateUserConsumer');
const deleteUserConsumer = require('./consumers/deleteUserConsumer');
const startHeartbeat     = require('./publisher/heartbeat'); // ✅ netjes uitbesteed

(async () => {
  try {
    // ─── 1️⃣ RabbitMQ connectie & exchanges ──────────────────────────────
    const conn    = await amqp.connect({
      protocol: 'amqp',
      hostname: process.env.RABBITMQ_HOST,
      port:     process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
      vhost:    '/'
    });
    const channel = await conn.createChannel();
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
    await channel.assertExchange("", 'direct', { durable: true });
    await createUserConsumer(channel, sfClient, "");

    await channel.assertExchange("", 'direct', { durable: true });
    await updateUserConsumer(channel, sfClient, "");

    await channel.assertExchange("", 'direct', { durable: true });
    await deleteUserConsumer(channel, sfClient, "");


    // ─── 4️⃣ Start de CDC listener ──────────────────────────────────────
    const cdcClient = sfClient.createCDCClient();

    cdcClient.subscribe('/data/ContactChangeEvent', async function (message) {
      await ContactCDCHandler(message, sfClient, channel);
    });

    startHeartbeat(channel, startHeartbeat, 'CRM_Service'); // ✅ nu perfect centraal geregeld

  } catch (err) {
    console.error('❌ Fout bij opstarten:', err.response?.data || err.message);
    process.exit(1);
  }
})();
