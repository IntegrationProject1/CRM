require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require('../salesforceClient');
const createUserConsumer = require('../consumers/createUserConsumer');
const updateUserConsumer = require('../consumers/updateUserConsumer');
const deleteUserConsumer = require('../consumers/deleteUserConsumer');
const { jsonToXml } = require('../xmlJsonTranslator');
const validator = require('../xmlValidator');

describe('User Consumer Integration Tests', () => {
    let rabbitConnection, channel, salesforceClient, testIds;
    const exchange = process.env.RABBITMQ_EXCHANGE || 'crm.exchange';

    beforeAll(async () => {
        rabbitConnection = await amqp.connect({
            hostname: process.env.RABBITMQ_HOST,
            port: process.env.RABBITMQ_PORT,
            username: process.env.RABBITMQ_USERNAME,
            password: process.env.RABBITMQ_PASSWORD
        });
        channel = await rabbitConnection.createChannel();

        salesforceClient = new SalesforceClient(
            process.env.SALESFORCE_USERNAME,
            process.env.SALESFORCE_PASSWORD,
            process.env.SALESFORCE_TOKEN,
            process.env.SALESFORCE_LOGIN_URL
        );
        await salesforceClient.login();

        await createUserConsumer(channel, salesforceClient, exchange);
        await updateUserConsumer(channel, salesforceClient, exchange);
        await deleteUserConsumer(channel, salesforceClient, exchange);

        testIds = { contacts: [] };
    }, 30000);

    afterAll(async () => {
        for (const id of testIds.contacts) {
            try {
                await salesforceClient.deleteUser(id);
                console.log(`Cleaned up test contact: ${id}`);
            } catch (e) {
                console.warn(`Cleanup warning: ${e.message}`);
            }
        }
        await channel.close();
        await rabbitConnection.close();
    }, 10000);

    test('Should create a user in Salesforce when message is published to create queue', async () => {
        const testUser = {
            FirstName: 'Test',
            LastName: 'Integration',
            Email: `test.${Date.now()}@example.com`,
            Phone: '123-456-7890'
        };

        await channel.publish(
            exchange,
            'crm_user_create',
            Buffer.from(JSON.stringify(testUser))
        );

        // Wait for consumer to process
        await new Promise(r => setTimeout(r, 4000));

        const result = await salesforceClient.query(
            `SELECT Id, FirstName, LastName, Email FROM Contact WHERE Email = '${testUser.Email}' LIMIT 1`
        );

        expect(result.records.length).toBe(1);
        expect(result.records[0].FirstName).toBe(testUser.FirstName);
        expect(result.records[0].LastName).toBe(testUser.LastName);

        testIds.contacts.push(result.records[0].Id);
    }, 15000);

    test('Should update a user in Salesforce when message is published to update queue', async () => {
        // Arrange - Create a user first by publishing to the create queue
        const originalUser = {
            FirstName: 'Update',
            LastName: 'Test',
            Email: `update.${Date.now()}@example.com`,
            Phone: '123-456-7890'
        };
        await channel.publish(
            exchange,
            'crm_user_create',
            Buffer.from(JSON.stringify(originalUser))
        );
        await new Promise(r => setTimeout(r, 4000));

        // Query for the new user's ID
        const result = await salesforceClient.query(
            `SELECT Id FROM Contact WHERE Email = '${originalUser.Email}' LIMIT 1`
        );
        const contactId = result.records[0]?.Id;
        expect(contactId).toBeDefined();
        testIds.contacts.push(contactId);

        const updateData = {
            id: contactId,
            FirstName: 'Updated',
            LastName: 'Integration'
        };

        await channel.publish(
            exchange,
            'crm_user_update',
            Buffer.from(JSON.stringify(updateData))
        );
        await new Promise(r => setTimeout(r, 4000));

        const updated = await salesforceClient.query(
            `SELECT Id, FirstName, LastName FROM Contact WHERE Id = '${contactId}' LIMIT 1`
        );
        expect(updated.records[0].FirstName).toBe('Updated');
        expect(updated.records[0].LastName).toBe('Integration');
    }, 15000);

    test('Should delete a user in Salesforce when message is published to delete queue', async () => {
        // Arrange - Create a user first by publishing to the create queue
        const deleteUser = {
            FirstName: 'Delete',
            LastName: 'Test',
            Email: `delete.${Date.now()}@example.com`
        };
        await channel.publish(
            exchange,
            'crm_user_create',
            Buffer.from(JSON.stringify(deleteUser))
        );
        await new Promise(r => setTimeout(r, 4000));

        // Query for the new user's ID
        const result = await salesforceClient.query(
            `SELECT Id FROM Contact WHERE Email = '${deleteUser.Email}' LIMIT 1`
        );
        const userId = result.records[0]?.Id;
        expect(userId).toBeDefined();
        testIds.contacts.push(userId);

        await channel.publish(
            exchange,
            'crm_user_delete',
            Buffer.from(JSON.stringify({ id: userId }))
        );
        await new Promise(r => setTimeout(r, 4000));

        // Assert
        const deleted = await salesforceClient.query(
            `SELECT Id FROM Contact WHERE Id = '${userId}' LIMIT 1`
        );
        expect(deleted.records.length).toBe(0);

        // Remove from cleanup list since it's already deleted
        testIds.contacts = testIds.contacts.filter(id => id !== userId);
    }, 15000);
});
