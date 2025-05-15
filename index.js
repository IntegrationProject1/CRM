require('dotenv').config();
const amqp = require('amqplib');
const ContactCDCHandler = require('./cdc/ContactCDCHandler');
const EventCDCHandler = require('./cdc/EventCDCHandler');
const SalesforceClient   = require('./salesforceClient');
const StartUserConsumer = require('./consumers/UserConsumer');
const startHeartbeat     = require('./publisher/heartbeat');
const {general_logger} = require("./utils/logger");

(async () => {
   try {
      // ─── 1️⃣ RabbitMQ connectie & exchanges ──────────────────────────────
      general_logger.info('Start CRM Service');
      const conn    = await amqp.connect({
         protocol: 'amqp',
         hostname: process.env.RABBITMQ_HOST,
         port:     process.env.RABBITMQ_PORT,
         username: process.env.RABBITMQ_USERNAME,
         password: process.env.RABBITMQ_PASSWORD,
         vhost:    '/'
      });

      general_logger.debug(conn);

      const channel = await conn.createChannel();
      general_logger.info('Verbonden met RabbitMQ');
      // console.log('✅ Verbonden met RabbitMQ');

      // ─── 2️⃣ Login bij Salesforce via jsforce ──────────────────────────────
      general_logger.info('Login in Salesforce');
      const sfClient = new SalesforceClient(
         process.env.SALESFORCE_USERNAME,
         process.env.SALESFORCE_PASSWORD,
         process.env.SALESFORCE_TOKEN,
         process.env.SALESFORCE_LOGIN_URL
      );
      general_logger.debug(sfClient);
      await sfClient.login(); // 🔐 OAuth-login via jsforce

      // ─── 3️⃣Start de consumers ────────────────────────────────────────────
      general_logger.info('Start de consumers');
      await StartUserConsumer(channel, sfClient);

      // ─── 4️⃣ Start de CDC listeners (bevat ook de publishers) ──────────────────────────────────────
      general_logger.info('Start de CDC listeners');
      const cdcClient = sfClient.createCDCClient();

      general_logger.info('Luister naar de ContactChangeEvent');
      cdcClient.subscribe('/data/ContactChangeEvent', async function (message) {
         await ContactCDCHandler(message, sfClient, channel);
      });
      cdcClient.subscribe('/data/Event__ChangeEvent', async function (message) {
         await EventCDCHandler(message, sfClient, channel);
      });

      let heartBeatQueue = process.env.RABBITMQ_EXCHANGE_HEARTBEAT;
      general_logger.debug(heartBeatQueue);
      let heartBeatRoutingKey = process.env.RABBITMQ_ROUTING_KEY_HEARTBEAT;
      general_logger.debug(heartBeatRoutingKey);

      // ─── 5️⃣ Start de heartbeat publisher ──────────────────────────────
      general_logger.info('Start de heartbeat publisher');
      await startHeartbeat(channel, heartBeatQueue, heartBeatRoutingKey, 'CRM_Service');

   } catch (err) {
      general_logger.error('Fout bij opstarten:', err.response?.data || err.message);
      //console.error('❌ Fout bij opstarten:', err.response?.data || err.message);
      process.exit(1);
   }
})();
