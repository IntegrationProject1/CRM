/**
 * @module tests/userConsumer.test
 * @description Integration tests for the UserConsumer module.
 * @requires ../consumers/UserConsumer
 * @requires ../utils/xmlJsonTranslator
 * @requires jest
 */

const StartUserConsumer = require('../consumers/UserConsumer');

// Mock dependencies
const mockSalesforceClient = {
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    sObject: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        run: jest.fn()
    })
};

const mockChannel = {
    assertQueue: jest.fn(),
    consume: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn()
};

jest.mock('../utils/xmlJsonTranslator', () => ({
    xmlToJson: jest.fn(async (xml) => ({
        UserMessage: {
            UUID: 'uuid-123',
            TimeOfAction__c: '2025-05-07T17:14:29Z',
            EncryptedPassword: 'pw',
            FirstName: 'John',
            LastName: 'Doe',
            Phone: '123456789',
            Email: 'john@example.com'
        }
    }))
}));

describe('UserConsumer integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('processes CREATE message', async () => {
        await StartUserConsumer(mockChannel, mockSalesforceClient);

        // Simulate message handler
        const handler = mockChannel.consume.mock.calls[0][1];
        await handler({ content: Buffer.from('<UserMessage></UserMessage>') });

        expect(mockSalesforceClient.createUser).toHaveBeenCalled();
        expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('processes UPDATE message', async () => {
        // Setup sObject().select().where().limit().run to return a Salesforce ID
        mockSalesforceClient.sObject().select().where().limit().run.mockResolvedValue([{ Id: '001xx000003DGb2' }]);
        await StartUserConsumer(mockChannel, mockSalesforceClient);

        // Simulate message handler for update queue
        const handler = mockChannel.consume.mock.calls[1][1];
        await handler({ content: Buffer.from('<UserMessage></UserMessage>') });

        expect(mockSalesforceClient.updateUser).toHaveBeenCalledWith('001xx000003DGb2', expect.any(Object));
        expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('processes DELETE message', async () => {
        // Setup sObject().select().where().limit().run to return a Salesforce ID
        mockSalesforceClient.sObject().select().where().limit().run.mockResolvedValue([{ Id: '001xx000003DGb2' }]);
        await StartUserConsumer(mockChannel, mockSalesforceClient);

        // Simulate message handler for delete queue
        const handler = mockChannel.consume.mock.calls[2][1];
        await handler({ content: Buffer.from('<UserMessage></UserMessage>') });

        expect(mockSalesforceClient.deleteUser).toHaveBeenCalledWith('001xx000003DGb2');
        expect(mockChannel.ack).toHaveBeenCalled();
    });
});
