require('dotenv').config(); // 📦 Laad .env voor lokale omgeving

const amqp = require('amqplib');
const SalesforceClient = require('../../salesforceClient');
const { startCDCListener } = require('../../cdcListener');

// ✅ CI fallback (indien niet gedefinieerd)
const isCI = process.env.CI === 'true';

process.env.RABBITMQ_HOST = process.env.RABBITMQ_HOST || (isCI ? 'rabbitmq' : 'localhost');

process.env.RABBITMQ_USERNAME = process.env.RABBITMQ_USERNAME || 'guest';
process.env.RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'guest';
process.env.RABBITMQ_PORT = process.env.RABBITMQ_PORT || '5672';

// ✅ Langere timeout voor trage CI-start
jest.setTimeout(25000);

// ✅ Retry-functie voor RabbitMQ-connectie
async function waitForRabbitMQ(amqpUrl, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await amqp.connect(amqpUrl);
    } catch (err) {
      console.warn(`⏳ Wachten op RabbitMQ (${i + 1}/${retries})...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('❌ RabbitMQ niet bereikbaar na meerdere pogingen');
}


describe('E2E CDC Listener test', () => {
  let connection, channel;

  beforeAll(async () => {
    const amqpUrl = `amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
    connection = await waitForRabbitMQ(amqpUrl);
    channel = await connection.createChannel();

    await channel.assertExchange('user', 'topic', { durable: true });

    const services = ['frontend', 'facturatie', 'kassa'];
    for (const service of services) {
      const q = `test_e2e_${service}`;
      await channel.assertQueue(q, { durable: false });
      await channel.bindQueue(q, 'user', `${service}.user.create`);
      await channel.purgeQueue(q);
    }

    const sfClient = new SalesforceClient(
      process.env.SALESFORCE_USERNAME,
      process.env.SALESFORCE_PASSWORD,
      process.env.SALESFORCE_TOKEN,
      process.env.SALESFORCE_LOGIN_URL
    );
    await sfClient.login();
    await startCDCListener(sfClient, channel);
  });

  it('✅ verwerkt een CREATE CDC-event en publiceert berichten naar RabbitMQ', async () => {
    const queue = 'test_e2e_frontend';

    const message = await new Promise((resolve, reject) => {
      channel.consume(queue, (msg) => {
        if (msg) {
          const parsed = JSON.parse(msg.content.toString());
          channel.ack(msg);
          resolve(parsed);
        }
      }, { noAck: false });

      setTimeout(() => reject('⏰ Timeout: geen bericht ontvangen'), 15000);
    });

    expect(message).toHaveProperty('UserMessage');
    expect(message.UserMessage.ActionType).toBe('CREATE');
  });

  afterAll(async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
  });
});
