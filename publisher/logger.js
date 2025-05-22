const path = require('path');
const amqp = require('amqplib');

const {validateXml} = require('../utils/xmlValidator');
const {logger_logger} = require('../utils/logger');

/**
 * Sending messages to a RabbitMQ log exchange.
 * @param {Object} channel - RabbitMQ channel to publish messages.
 * @param {string} exchangeName - Name of the exchange to publish to.
 * @param {string} [serviceName='CRM_Service'] - Service name (optional).
 * @param {string} status_level - Status level (e.g., 'info', 'error').
 * @param {string} code - Code for the message.
 * @param {string} message - Message content.
 * @returns {Promise<void>} Resolves when exchange is set and interval starts.
 * @example
 * sendMessage(channel, 'logExchange', 'CRM_Service', 'info', '200', 'Heartbeat message');
 * @example
 * sendMessage(channel, 'logExchange', 'CRM_Service', 'error', '500', 'Heartbeat error');
 */

async function sendLog(channel, exchangeName, serviceName = 'CRM_Service', status_level, code, message) {
    //start sending messages to a RabbitMQ log exchange
    await channel.assertExchange(exchangeName, 'direct', {durable: true});
    /**
     * XML message to be sent to RabbitMQ.
     * @type {string}
     */
    const xml = `
            <Log>
              <ServiceName>${serviceName}</ServiceName>
              <Status>${status_level}</Status>
              <Code>${code}</Code>
              <Message>${message}</Message>
            </Log>`.trim();
    /**
     * Path to the XSD file for validation.
     * @type {string}
     */
    const xsdPath = path.join(__dirname, '../xsd/loggerXSD/logger.xsd');

    if (!validateXml(xml, xsdPath)) {
        logger_logger.error('The XML is not valid against the XSD. Message NOT sent.');
        return;
    }

    channel.publish(exchangeName, 'controlroom.log.event', Buffer.from(xml));
    logger_logger.debug('Sending message', channel, exchangeName, serviceName, status_level);
}

/**
 * Sends a message to a RabbitMQ exchange.
 * @param {string} status_level - Status level (e.g., 'info', 'error').
 * @param {string} code - Code for the message.
 * @param {string} message - Message content.
 * @returns {Promise<void>} Resolves when the message is sent.
 * @example
 * sendMessage('logExchange', 'info', '200', 'Heartbeat message');
 */
async function sendMessage(status_level, code, message) {
    try {
        const conn    = await amqp.connect({
            protocol: 'amqp',
            hostname: process.env.RABBITMQ_HOST,
            port:     process.env.RABBITMQ_PORT,
            username: process.env.RABBITMQ_USERNAME,
            password: process.env.RABBITMQ_PASSWORD,
            vhost:    '/'
        });
        let exchangeName ='log_monitoring';
        const channel = await conn.createChannel();
        await sendLog(channel, exchangeName, 'CRM_Service', status_level, code, message);
    } catch (error) {
        logger_logger.error(error);
    }
}

module.exports = sendMessage;
