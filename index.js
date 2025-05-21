require('dotenv').config();
const amqp = require('amqplib');
const ContactCDCHandler = require('./cdc/ContactCDCHandler');
const EventCDCHandler = require('./cdc/EventCDCHandler');
const SessionCDCHandler = require('./cdc/SessionCDCHandler');
const SessionParticipateCDCHandler = require('./cdc/SessionParticipateCDCHandler');
const SalesforceClient = require('./salesforceClient');
const StartUserConsumer = require('./consumers/UserConsumer');
const StartSessionConsumer = require('./consumers/SessionConsumer');
const StartSessionParticipateConsumer = require('./consumers/SessionParticipateConsumer');
const StartEventConsumer = require('./consumers/EventConsumer');
const startHeartbeat = require('./publisher/heartbeat');
const sendMessage = require('./publisher/logger');
const {general_logger} = require("./utils/logger");

(async () => {
   try {
      general_logger.info('Start CRM Service');

      await sendMessage("logExchange", "info", "200", "Start van CRM Service");

      const conn = await amqp.connect({
         protocol: 'amqp',
         hostname: process.env.RABBITMQ_HOST,
         port: process.env.RABBITMQ_PORT,
         username: process.env.RABBITMQ_USERNAME,
         password: process.env.RABBITMQ_PASSWORD,
         vhost: '/'
      });

      general_logger.debug(conn);
      const channel = await conn.createChannel();
      general_logger.info('Verbonden met RabbitMQ');

      general_logger.info('Login in Salesforce');
      const sfClient = new SalesforceClient(
          process.env.SALESFORCE_USERNAME,
          process.env.SALESFORCE_PASSWORD,
          process.env.SALESFORCE_TOKEN,
          process.env.SALESFORCE_LOGIN_URL
      );
      general_logger.debug(sfClient);
      await sfClient.login();

      general_logger.info('Start de consumers');
//-------------------------------------------------------------------------------------------------------------------------------------------
      await sendMessage("logExchange", "info", "200", "Start de consumers van CRM Service");
      await StartUserConsumer(channel, sfClient);
      await StartEventConsumer(channel, sfClient);
      await StartSessionConsumer(channel, sfClient);
      await StartSessionParticipateConsumer(channel, sfClient);
//-------------------------------------------------------------------------------------------------------------------------------------------
      general_logger.info('Start de CDC listeners');
        await sendMessage("logExchange", "info", "200", "Start de CDC listeners van CRM Service");
      const cdcClient = sfClient.createCDCClient();
//-------------------------------------------------------------------------------------------------------------------------------------------
      general_logger.info('Luister naar ContactChangeEvent');
      await sendMessage("logExchange", "info", "200", "Start de consumers (ContactChangeEvent) van CRM Service");
      cdcClient.subscribe('/data/ContactChangeEvent', async (message) => {
         await ContactCDCHandler(message, sfClient, channel);
      });
//-------------------------------------------------------------------------------------------------------------------------------------------
      general_logger.info('Luister naar Event__ChangeEvent');
      await sendMessage("logExchange", "info", "200", "Start de consumers (Event__ChangeEvent) van CRM Service");
      cdcClient.subscribe('/data/Event__ChangeEvent', async (message) => {
         await EventCDCHandler(message, sfClient, channel);
      });
//-------------------------------------------------------------------------------------------------------------------------------------------
      general_logger.info('Luister naar Session__ChangeEvent');
      await sendMessage("logExchange", "info", "200", "Start de consumers (Session__ChangeEvent) van CRM Service");
      cdcClient.subscribe('/data/Session__ChangeEvent', async (message) => {
         await SessionCDCHandler(message, sfClient, channel);
      });
//-------------------------------------------------------------------------------------------------------------------------------------------
      general_logger.info('Luister naar SessionParticipate__ChangeEvent');
      await sendMessage("logExchange", "info", "200", "Start de consumers (SessionParticipate__ChangeEvent) van CRM Service");
      cdcClient.subscribe('/data/SessionParticipate__ChangeEvent', async (message) => {
         await SessionParticipateCDCHandler(message, sfClient, channel);
      });
//-------------------------------------------------------------------------------------------------------------------------------------------
      const heartBeatQueue = process.env.RABBITMQ_EXCHANGE_HEARTBEAT;
      const heartBeatRoutingKey = process.env.RABBITMQ_ROUTING_KEY_HEARTBEAT;
      general_logger.debug(heartBeatQueue);
      general_logger.debug(heartBeatRoutingKey);
//-------------------------------------------------------------------------------------------------------------------------------------------
      general_logger.info('Start de heartbeat publisher');
      await sendMessage("logExchange", "info", "200", "Start de heartbeat publisher van CRM Service");
      await startHeartbeat(channel, heartBeatQueue, heartBeatRoutingKey, 'CRM_Service');
//-------------------------------------------------------------------------------------------------------------------------------------------
   } catch (err) {
      general_logger.error('Fout bij opstarten:', err.response?.data || err.message);
      await sendMessage("logExchange", "error", "500", 'Fout bij opstarten: ' + err.response?.data || err.message);
      process.exit(1);
   }
})();

