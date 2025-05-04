const deleteUserConsumer = require('../../consumers/deleteUserConsumer');

describe('DeleteUserConsumer Integration Test', () => {
  let mockChannel;

  beforeEach(() => {
    mockChannel = {
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      consume: jest.fn((queue, cb) => {
        const msg = { content: Buffer.from(JSON.stringify({ Id: '123' })) };
        cb(msg);
      }),
      ack: jest.fn(),
      nack: jest.fn(),
    };
  });

  it('should call SalesforceClient.deleteUser and ack the message', async () => {
    const mockSalesforceClient = {
      deleteUser: jest.fn().mockResolvedValue({ success: true }),
    };

    await deleteUserConsumer(mockChannel, mockSalesforceClient, 'crm.exchange');

    expect(mockSalesforceClient.deleteUser).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });
});
