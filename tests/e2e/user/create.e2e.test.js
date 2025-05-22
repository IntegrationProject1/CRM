require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require('../../../salesforceClient');
const { startCDCListener, stopCDCListener } = require('../../../cdc/cdcListener');
const { xmlToJson } = require('../../../utils/xmlJsonTranslator');

process.env.IGNORE_CDC_API_ORIGIN = 'true';

jest.setTimeout(25000); // ⏱️ Extra tijd voor CI

const waitForRabbitMQ = async (amqpUrl, retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await amqp.connect(amqpUrl);
    } catch (err) {
      console.warn(`Wachten op RabbitMQ (${i + 1}/${retries})...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('RabbitMQ niet bereikbaar');
};

describe('🧪 E2E – User CREATE flow', () => {
  let connection, channel, sfClient;

  beforeAll(async () => {
    const amqpUrl = `amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
    connection = await waitForRabbitMQ(amqpUrl);
    channel = await connection.createChannel();

    await channel.assertExchange('user', 'topic', { durable: true });

    const services = ['frontend', 'facturatie', 'kassa'];
    for (const service of services) {
      const queue = `test_user_create_${service}`;
      await channel.assertQueue(queue, { durable: false });
      await channel.bindQueue(queue, 'user', `${service}.user.create`);
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
  });

  it('📤 publiceert correcte CREATE payload naar alle services', async () => {
    const queue = 'test_user_create_frontend';
    const uniqueEmail = `john${Date.now()}@example.com`;

    await sfClient.createUser({
      FirstName: 'John',
      LastName: 'Doe',
      Email: uniqueEmail,
      Phone: '123456789',
      Password__c: 'hashed123'
    });

    const message = await new Promise((resolve, reject) => {
      channel.consume(queue, async (msg) => {
        if (msg) {
          try {
            const parsed = await xmlToJson(msg.content.toString());
            channel.ack(msg);
            resolve(parsed);
          } catch (err) {
            console.error('❌ Fout bij parsen XML naar JSON:', err.message);
            reject(err);
          }
        }
      }, { noAck: false });

      setTimeout(() => reject('⏰ Geen bericht ontvangen binnen de tijd'), 15000);
    });

    expect(message).toHaveProperty('UserMessage');
    expect(message.UserMessage.ActionType).toBe('CREATE');
    expect(message.UserMessage.UUID).toBeDefined();
    expect(message.UserMessage.TimeOfAction).toBeDefined();
  });

  afterAll(async () => {
    await stopCDCListener();
    await new Promise(resolve => setTimeout(resolve, 500)); // laat laatste async logs afvloeien
    if (channel) await channel.close();
    if (connection) await connection.close();
    
  });
});
