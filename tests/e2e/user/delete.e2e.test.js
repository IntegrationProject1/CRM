require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require('../../../salesforceClient');
const { startCDCListener, stopCDCListener } = require('../../../cdc/cdcListener');
const { xmlToJson } = require('../../../utils/xmlJsonTranslator');

process.env.IGNORE_CDC_API_ORIGIN = 'true';
jest.setTimeout(30000); //extra tijd voor CI gevem

const waitForRabbitMQ = async (amqpUrl, retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await amqp.connect(amqpUrl);
    } catch {
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('RabbitMQ niet bereikbaar');
};

describe('🧪 E2E – User DELETE flow', () => {
  let connection, channel, sfClient, createdId, uuid;

  beforeAll(async () => {
    const amqpUrl = `amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
    connection = await waitForRabbitMQ(amqpUrl);
    channel = await connection.createChannel();

    await channel.assertExchange('user', 'topic', { durable: true });

    const services = ['frontend', 'facturatie', 'kassa'];
    for (const service of services) {
      const queue = `test_user_delete_${service}`;
      await channel.assertQueue(queue, { durable: false });
      await channel.bindQueue(queue, 'user', `${service}.user.delete`);
      await channel.purgeQueue(queue);
    }

    sfClient = new SalesforceClient(
      process.env.SALESFORCE_USERNAME,
      process.env.SALESFORCE_PASSWORD,
      process.env.SALESFORCE_TOKEN,
      process.env.SALESFORCE_LOGIN_URL
    );
    await sfClient.login();
    await startCDCListener(sfClient, channel);

    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    uuid = new Date().toISOString();

    const result = await sfClient.createUser({
      FirstName: `ToBe-${uniqueSuffix}`,
      LastName: `Deleted-${uniqueSuffix}`,
      Email: `delete-${uniqueSuffix}@example.com`,
      Phone: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      Password__c: `delete-${uniqueSuffix}`,
      UUID__c: uuid,
      TimeOfAction__c: uuid //toegevoegd om REQUIRED_FIELD_MISSING op te lossen
    });

    createdId = result.id;
  });

  it('📤 publiceert correcte DELETE payload naar alle services', async () => {
    const queue = 'test_user_delete_frontend';

    const consumePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject('⏰ Geen DELETE-bericht ontvangen'), 15000);

      channel.consume(queue, async (msg) => {
        if (msg) {
          clearTimeout(timeoutId);
          try {
            const parsed = await xmlToJson(msg.content.toString());
            channel.ack(msg);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        }
      }, { noAck: false });
    });

    await sfClient.deleteUser(createdId);
    const message = await consumePromise;

    expect(message).toHaveProperty('UserMessage');
    expect(message.UserMessage.ActionType).toBe('DELETE');
    expect(message.UserMessage.UUID).toBe(uuid);
    expect(message.UserMessage.TimeOfAction).toBeDefined();
  });

  afterAll(async () => {
    await stopCDCListener();
    await new Promise(resolve => setTimeout(resolve, 500));
    if (channel) await channel.close();
    if (connection) await connection.close();
  });
});
