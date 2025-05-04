const amqp = require('amqplib');
const SalesforceClient = require('../../salesforceClient');
const { startCDCListener } = require('../../cdcListener');

jest.setTimeout(20000); // Extra tijd

describe('E2E CDC Listener test', () => {
  let connection, channel;

  beforeAll(async () => {
    connection = await amqp.connect(`amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
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

      setTimeout(() => reject('⏰ Timeout: geen bericht ontvangen'), 8000);
    });

    expect(message).toHaveProperty('UserMessage');
    expect(message.UserMessage.ActionType).toBe('CREATE');
  });

  afterAll(async () => {
    await channel.close();
    await connection.close();
  });
});
