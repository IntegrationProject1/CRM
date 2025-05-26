const ContactCDCHandler = require('../../cdc/ContactCDCHandler');

// Mock dependencies
const mockSfClient = {
    updateUser: jest.fn(),
    sObject: jest.fn().mockReturnValue({
        retrieve: jest.fn(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        scanAll: jest.fn().mockReturnThis(),
        run: jest.fn()
    })
};

const mockRMQChannel = {
    assertExchange: jest.fn(),
    publish: jest.fn()
};

// Mock utility modules
jest.mock('../../utils/xmlJsonTranslator', () => ({
    jsonToXml: jest.fn(() => '<UserMessage></UserMessage>')
}));
jest.mock('../../utils/xmlValidator', () => ({
    validateXml: jest.fn(() => ({ isValid: true }))
}));

describe('ContactCDCHandler integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('handles CREATE event and publishes messages', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['001xx000003DGb2'],
                    changeOrigin: 'CDC'
                },
                Name: { FirstName: 'John', LastName: 'Doe' },
                Email: 'john@example.com'
            }
        };

        await ContactCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.updateUser).toHaveBeenCalled();
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('handles UPDATE event and publishes messages', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UPDATE',
                    recordIds: ['001xx000003DGb2'],
                    changeOrigin: 'CDC'
                }
            }
        };
        mockSfClient.sObject().retrieve.mockResolvedValue({ UUID__c: 'uuid-123', FirstName: 'Jane', LastName: 'Doe' });

        await ContactCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject().retrieve).toHaveBeenCalled();
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('handles DELETE event and publishes messages', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'DELETE',
                    recordIds: ['001xx000003DGb2'],
                    changeOrigin: 'CDC'
                }
            }
        };
        mockSfClient.sObject().select().where().limit().scanAll().run.mockResolvedValue([{ UUID__c: 'uuid-123' }]);

        await ContactCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject().select).toHaveBeenCalled();
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });
});
