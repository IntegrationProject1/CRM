const amqp = require('amqplib');
const createUserConsumer = require('../../consumers/createUserConsumer');
const SalesforceClient = require('../../salesforceClient');

jest.mock('amqplib');
jest.mock('../../salesforceClient');

describe('CreateUserConsumer Integration Test', () => {
  let mockChannel;

  beforeEach(() => {
    mockChannel = {
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      consume: jest.fn((queue, cb) => {
        const msg = { content: Buffer.from(JSON.stringify({ Email: 'test@mail.com' })) };
        cb(msg);
      }),
      ack: jest.fn(),
      nack: jest.fn(),
    };
  });

  it('should call SalesforceClient.createUser and ack the message', async () => {
    const mockSalesforceClient = {
      createUser: jest.fn().mockResolvedValue({ id: '123' }),
    };

    await createUserConsumer(mockChannel, mockSalesforceClient, 'crm.exchange');

    expect(mockChannel.assertQueue).toHaveBeenCalled();
    expect(mockChannel.bindQueue).toHaveBeenCalled();
    expect(mockSalesforceClient.createUser).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });
});
