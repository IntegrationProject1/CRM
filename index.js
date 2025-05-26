/**
 * @file This file initializes the CRM Service.
 * @module index
 * @description Handles RabbitMQ connections, Salesforce login, and CDC listeners.
 *
 * @author Lars
 * @author Jürgen
 * @author Mateo
 * @author Antoine
 * @author Karim
 * @author Aiden
 *
 * @copyright Copyright (c) 2023, E-xpo
 * @license Apache-2.0
 */

require('dotenv').config();
const amqp = require('amqplib');
// Increase the maximum number of listeners to prevent MaxListenersExceededWarning
process.setMaxListeners(15);
const ContactCDCHandler = require('./cdc/ContactCDCHandler');
const EventCDCHandler = require('./cdc/EventCDCHandler');
const SessionCDCHandler = require('./cdc/SessionCDCHandler');
// const SessionParticipateCDCHandler = require('./cdc/SessionParticipateCDCHandler');
const EventParticipantCDCHandler = require('./cdc/EventParticipantCDCHandler');
const SalesforceClient = require('./salesforceClient');
const StartUserConsumer = require('./consumers/UserConsumer');
const StartSessionConsumer = require('./consumers/SessionConsumer');
// const StartSessionParticipateConsumer = require('./consumers/SessionParticipateConsumer');
const StartEventConsumer = require('./consumers/EventConsumer');
const startHeartbeat = require('./publisher/heartbeat');
const { sendMessage } = require('./publisher/logger');
const { general_logger } = require("./utils/logger");

(async () => {
   try {
      /**
       * Start the CRM Service and log the initialization process.
       */
      general_logger.info('Starting CRM Service');
      await sendMessage("INFO", "200", "Start of CRM Service");

      // Connect to RabbitMQ
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
      general_logger.info('Connected to RabbitMQ');
      await sendMessage("INFO", "200", "Connected to RabbitMQ");

      // Log in to Salesforce
      general_logger.info('Logging in to Salesforce');
      const sfClient = new SalesforceClient(
         process.env.SALESFORCE_USERNAME,
         process.env.SALESFORCE_PASSWORD,
         process.env.SALESFORCE_TOKEN,
         process.env.SALESFORCE_LOGIN_URL
      );
      await sendMessage("INFO", "200", "Logged in to Salesforce");

      await sfClient.login();

      // Start the consumers
      general_logger.info('Starting consumers');
      await StartUserConsumer(channel, sfClient);
      await StartEventConsumer(channel, sfClient);
      await StartSessionConsumer(channel, sfClient);
      // await StartSessionParticipateConsumer(channel, sfClient);
      await sendMessage("INFO", "200", "Consumers for CRM Service started");

      // Start the CDC listeners
      await sendMessage("INFO", "200", "Starting CDC listeners for CRM Service");
      const cdcClient = sfClient.createCDCClient();
      general_logger.info('CDC listeners started');

      // Subscribe to ContactChangeEvent
      await sendMessage("INFO", "200", "Starting consumers (ContactChangeEvent) for CRM Service");
      cdcClient.subscribe('/data/ContactChangeEvent', async (message) => {
         await ContactCDCHandler(message, sfClient, channel);
      });
      general_logger.info('Listening to ContactChangeEvent');

      // Subscribe to Event__ChangeEvent
      await sendMessage("INFO", "200", "Starting consumers (Event__ChangeEvent) for CRM Service");
      cdcClient.subscribe('/data/Event__ChangeEvent', async (message) => {
         await EventCDCHandler(message, sfClient, channel);
      });
      general_logger.info('Listening to Event__ChangeEvent');

      // Subscribe to Event_Participant__ChangeEvent
      cdcClient.subscribe('/data/Event_Participant__ChangeEvent', async (message) => {
         await EventParticipantCDCHandler(message, sfClient, channel);
      });
      await sendMessage("INFO", "200", "Starting consumers (Event_Participant__ChangeEvent) for CRM Service");
      general_logger.info('Listening to Event_Participant__ChangeEvent');

      // Subscribe to Session__ChangeEvent
      await sendMessage("INFO", "200", "Starting Session CDC Listener");
      cdcClient.subscribe('/data/Session__ChangeEvent', async (message) => {
         await SessionCDCHandler(message, sfClient, channel);
      });
      general_logger.info('Listening to Session__ChangeEvent');

      // Start the heartbeat publisher
      const heartBeatQueue = process.env.RABBITMQ_EXCHANGE_HEARTBEAT;
      const heartBeatRoutingKey = process.env.RABBITMQ_ROUTING_KEY_HEARTBEAT;
      general_logger.debug(heartBeatQueue);
      general_logger.debug(heartBeatRoutingKey);

      general_logger.info('Starting the heartbeat publisher');
      await sendMessage("INFO", "200", "Starting the heartbeat publisher for CRM Service");
      await startHeartbeat(channel, heartBeatQueue, heartBeatRoutingKey, 'CRM');
   } catch (err) {
      /**
       * Handle errors during initialization and log the error details.
       */
      general_logger.error('Error during startup:', err.response?.data || err.message);
      await sendMessage("ERROR", "500", 'Error during startup: ' + err.response?.data || err.message);
      process.exit(1);
   }
})();
