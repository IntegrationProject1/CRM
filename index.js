/**
 * @module index
 * @description CRM Service main entry point.
 * Initializes RabbitMQ connection, Salesforce client, consumers, CDC listeners, and heartbeat publisher.
 *
 * @author Lars
 * @author Jurgen
 * @author Matheo
 * @author Antoine Goethuys
 * @author Karim
 * @author Aiden
 */

const { general_logger } = require('./utils/logger');
const { connect } = require('amqplib');
const { SalesforceClient } = require('./utils/salesforceClient');
const startHeartbeat = require('./publisher/heartbeat');
const StartUserConsumer = require('./consumers/UserConsumer');
const ContactCDCHandler = require('./cdc/ContactCDCHandler');

/**
* Establishes a connection to RabbitMQ.
* @async
* @returns {Promise<Channel>} The RabbitMQ channel instance.
*/
async function connectToRabbitMQ() {
 const conn = await connect({
     protocol: 'amqp',
     hostname: process.env.RABBITMQ_HOST,
     port: process.env.RABBITMQ_PORT,
     username: process.env.RABBITMQ_USERNAME,
     password: process.env.RABBITMQ_PASSWORD,
     vhost: '/'
 });
 return await conn.createChannel();
}

/**
* Logs in to Salesforce and returns the client instance.
* @async
* @returns {Promise<SalesforceClient>} The Salesforce client instance.
*/
async function loginToSalesforce() {
 const sfClient = new SalesforceClient(
     process.env.SALESFORCE_USERNAME,
     process.env.SALESFORCE_PASSWORD,
     process.env.SALESFORCE_TOKEN,
     process.env.SALESFORCE_LOGIN_URL
 );
 await sfClient.login();
 return sfClient;
}

/**
* Starts the CDC listeners for Salesforce.
* @param {SalesforceClient} sfClient - The Salesforce client instance.
* @param {Channel} channel - The RabbitMQ channel instance.
*/
function startCDCListeners(sfClient, channel) {
 const cdcClient = sfClient.createCDCClient();
 cdcClient.subscribe('/data/ContactChangeEvent', async (message) => {
     await ContactCDCHandler(message, sfClient, channel);
 });
}

/**
* Starts the CRM service.
* @async
* @returns {Promise<void>}
*/
async function startCRMService() {
    try {
        /**
         * Make a connection to RabbitMQ.
         * @type {Channel}
         */
        const channel = await connectToRabbitMQ();
        general_logger.info('Connected to RabbitMQ');
        /**
         * Login to Salesforce and create a client instance.
         * @type {SalesforceClient}
         */
        const sfClient = await loginToSalesforce();
        general_logger.info('Logged in to Salesforce');
        /**
         * Start the user consumer.
         */
        await StartUserConsumer(channel, sfClient);
        general_logger.info('Started consumers');
        /**
        * Start the CDC listeners.
        */
        startCDCListeners(sfClient, channel);
        general_logger.info('Started CDC listeners');

         await startHeartbeat(
             channel,
             process.env.RABBITMQ_EXCHANGE_HEARTBEAT,
             process.env.RABBITMQ_ROUTING_KEY_HEARTBEAT,
             'CRM_Service'
         );
         general_logger.info('Started heartbeat publisher');
     } catch (err) {
         general_logger.error('Error during startup:', err.response?.data || err.message);
         process.exit(1);
     }
 }

/**
 * Main entry point for the CRM service.
 */
startCRMService()
    /**
     * Logs a message indicating that the CRM service has started successfully.
     */
     .then(() => {
         general_logger.info('CRM Service started successfully');
     })
    /**
     * Logs an error message if the CRM service fails to start.
     */
     .catch((err) => {
         general_logger.error('Failed to start CRM Service:', err);
         process.exit(1);
     });