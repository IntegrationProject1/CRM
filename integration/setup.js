// /integration/setup.js
require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require('../salesforceClient');

// Test environment configuration
const testConfig = {
    rabbitmq: {
        url: process.env.TEST_RABBITMQ_URL || 'amqp://localhost:5672',
        exchanges: {
            user: 'user_test',
            event: 'event_test'
        }
    },
    salesforce: {
        username: process.env.TEST_SF_USERNAME,
        password: process.env.TEST_SF_PASSWORD,
        token: process.env.TEST_SF_TOKEN,
        loginUrl: process.env.TEST_SF_LOGIN_URL
    }
};

// Setup RabbitMQ connection for tests
async function setupRabbitMQ() {
    const connection = await amqp.connect(testConfig.rabbitmq.url);
    const channel = await connection.createChannel();

    // Create test exchanges
    await channel.assertExchange(testConfig.rabbitmq.exchanges.user, 'topic', { durable: true });
    await channel.assertExchange(testConfig.rabbitmq.exchanges.event, 'topic', { durable: true });

    return { connection, channel };
}

// Setup Salesforce client for tests
async function setupSalesforce() {
    const client = new SalesforceClient(
        testConfig.salesforce.username,
        testConfig.salesforce.password,
        testConfig.salesforce.token,
        testConfig.salesforce.loginUrl
    );
    await client.login();
    return client;
}

// Cleanup test data
async function cleanupTestData(salesforceClient, testIds) {
    if (testIds.contacts && testIds.contacts.length) {
        for (const id of testIds.contacts) {
            try {
                await salesforceClient.deleteUser(id);
            } catch (err) {
                console.warn(`Cleanup warning: ${err.message}`);
            }
        }
    }

    // Add cleanup for events if needed
}

module.exports = {
    testConfig,
    setupRabbitMQ,
    setupSalesforce,
    cleanupTestData
};
