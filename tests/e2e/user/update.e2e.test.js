process.env.IGNORE_CDC_API_ORIGIN = 'true';
require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require('../../../salesforceClient');
const { startCDCListener, stopCDCListener } = require('../../../cdc/cdcListener');
const { xmlToJson } = require('../../../utils/xmlJsonTranslator');

jest.setTimeout(30000); // CI-bescherming

const waitForRabbitMQ = async (amqpUrl, retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await amqp.connect(amqpUrl);
    } catch {
      console.warn(`⏳ Wachten op RabbitMQ (${i + 1}/${retries})...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('RabbitMQ niet bereikbaar');
};

describe('🧪 E2E – User UPDATE flow', () => {
  let connection, channel, sfClient, createdId;

  beforeAll(async () => {
    const amqpUrl = `amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
    connection = await waitForRabbitMQ(amqpUrl);
    channel = await connection.createChannel();

    await channel.assertExchange('user', 'topic', { durable: true });

    const services = ['frontend', 'facturatie', 'kassa'];
    for (const service of services) {
      const queue = `test_user_update_${service}`;
      await channel.assertQueue(queue, { durable: false });
      await channel.bindQueue(queue, 'user', `${service}.user.update`);
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

    const uniqueEmail = `update-${Date.now()}@example.com`;
    const result = await sfClient.conn.sobject('Contact').create({
      FirstName: 'PreUpdate',
      LastName: 'Test',
      Email: uniqueEmail
    });

    createdId = result.id;
  });

  it('📤 publiceert correcte UPDATE payload naar alle services', async () => {
    const queue = 'test_user_update_frontend';

    const consumePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject('⏰ Geen UPDATE-bericht ontvangen');
      }, 15000);

      channel.consume(queue, async (msg) => {
        if (msg) {
          try {
            const parsed = await xmlToJson(msg.content.toString());
            channel.ack(msg);
            clearTimeout(timeout); // 🧹 timeout opruimen
            resolve(parsed);
          } catch (err) {
            clearTimeout(timeout);
            console.error('❌ Fout bij parsen XML naar JSON:', err.message);
            reject(`❌ JSON parse error: ${err.message}`);
          }
        }
      }, { noAck: false });
    });

    await sfClient.conn.sobject('Contact').update({
      Id: createdId,
      FirstName: 'PostUpdate'
    });

    const message = await consumePromise;

    expect(message).toHaveProperty('UserMessage');
    expect(message.UserMessage.ActionType).toBe('UPDATE');
    expect(message.UserMessage.UUID).toBeDefined();
    expect(message.UserMessage.TimeOfAction).toBeDefined();
  });

  afterAll(async () => {
    await stopCDCListener();
    await new Promise(resolve => setTimeout(resolve, 500)); // Laatste logs afvloeien
    if (channel) await channel.close();
    if (connection) await connection.close();
  });
});
