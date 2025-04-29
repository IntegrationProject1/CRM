require('dotenv').config();
const amqp               = require('amqplib');
const SalesforceClient   = require('./salesforceClient');
const createUserConsumer = require('./consumers/createUserConsumer');
const updateUserConsumer = require('./consumers/updateUserConsumer');
const deleteUserConsumer = require('./consumers/deleteUserConsumer');
const startHeartbeat     = require('./publisher/heartbeat'); // ✅ netjes uitbesteed

(async () => {
  try {
    // ─── 1️⃣ RabbitMQ connectie & exchanges ──────────────────────────────
    const conn = await amqp.connect({
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

    await channel.assertExchange(hbX,   'direct', { durable: true });
    await channel.assertExchange(crudX, 'direct', { durable: true });
    console.log('✅ Verbonden met RabbitMQ');

    // ─── 2️⃣ Start Heartbeat service ───────────────────────────────────────
    startHeartbeat(channel, hbX, 'CRM_Service'); // ✅ nu perfect centraal geregeld

    // ─── 3️⃣ Login bij Salesforce via jsforce ──────────────────────────────
    const sfClient = new SalesforceClient(
      process.env.SALESFORCE_USERNAME,
      process.env.SALESFORCE_PASSWORD,
      process.env.SALESFORCE_TOKEN,
      process.env.SALESFORCE_LOGIN_URL
    );
    await sfClient.login();

    // ─── 4️⃣ Start de consumers ────────────────────────────────────────────
    await createUserConsumer(channel, sfClient, crudX);
    await updateUserConsumer(channel, sfClient, crudX);
    await deleteUserConsumer(channel, sfClient, crudX);

  } catch (err) {
    console.error('❌ Fout bij opstarten:', err.response?.data || err.message);
    process.exit(1);
  }
})();
