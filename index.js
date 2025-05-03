require('dotenv').config();
const amqp = require('amqplib');
const ContactCDCHandler = require('./ContactCDCHandler');
const SalesforceClient   = require('./salesforceClient');
const StartUserConsumer = require('./consumers/UserConsumer');
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

      // ─── 3️⃣Start de consumers ────────────────────────────────────────────
      await StartUserConsumer(channel, sfClient);

      // ─── 4️⃣ Start de CDC listeners (bevat ook de publishers) ──────────────────────────────────────
      const cdcClient = sfClient.createCDCClient();

      cdcClient.subscribe('/data/ContactChangeEvent', async function (message) {
         await ContactCDCHandler(message, sfClient, channel);
      });

      let heartBeatQueue = process.env.RABBITMQ_EXCHANGE_HEARTBEAT;

    startHeartbeat(channel, heartBeatQueue, 'CRM_Service');

   } catch (err) {

      console.error('❌ Fout bij opstarten:', err.response?.data || err.message);
      process.exit(1);
   }
})();
