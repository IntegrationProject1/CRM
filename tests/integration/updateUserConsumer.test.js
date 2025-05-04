const updateUserConsumer = require('../../consumers/updateUserConsumer');

describe('UpdateUserConsumer Integration Test', () => {
  let mockChannel;

  beforeEach(() => {
    mockChannel = {
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      consume: jest.fn((queue, cb) => {
        const msg = { content: Buffer.from(JSON.stringify({ Id: '123', Email: 'update@mail.com' })) };
        cb(msg);
      }),
      ack: jest.fn(),
      nack: jest.fn(),
    };
  });

  it('should call SalesforceClient.updateUser and ack the message', async () => {
    const mockSalesforceClient = {
      updateUser: jest.fn().mockResolvedValue({ success: true }),
    };

    await updateUserConsumer(mockChannel, mockSalesforceClient, 'crm.exchange');

    expect(mockSalesforceClient.updateUser).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });
});
