const EventCDCHandler = require('../../cdc/EventCDCHandler');

const sObjectMock = {
    update: jest.fn(),
    retrieve: jest.fn(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    scanAll: jest.fn().mockReturnThis(),
    run: jest.fn()
};
const mockSfClient = {
    sObject: jest.fn(() => sObjectMock)
};

const mockRMQChannel = {
    assertExchange: jest.fn(),
    publish: jest.fn()
};

jest.mock('../../utils/xmlJsonTranslator', () => ({
    jsonToXml: jest.fn(() => '<EventMessage></EventMessage>')
}));
jest.mock('../../utils/xmlValidator', () => ({
    validateXml: jest.fn(() => ({ isValid: true }))
}));
jest.mock('../../utils/logger', () => ({
    event_logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warning: jest.fn(),
        error: jest.fn()
    }
}));
jest.mock('../../publisher/logger', () => ({
    sendMessage: jest.fn()
}));

describe('EventCDCHandler integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('handles CREATE event and publishes messages', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['a01xx000003DGb2'],
                    changeOrigin: 'CDC'
                },
                Name: 'My Event',
                Description__c: 'desc',
                StartDateTime__c: '2025-05-26T10:00:00Z',
                EndDateTime__c: '2025-05-26T12:00:00Z',
                Location__c: 'Room 1',
                Organiser__c: 'Org',
                EventType__c: 'Webinar'
            }
        };

        await EventCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject).toHaveBeenCalledWith('Event__c');
        expect(sObjectMock.update).toHaveBeenCalledWith(
            expect.objectContaining({
                Id: 'a01xx000003DGb2',
                UUID__c: expect.any(String)
            })
        );
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('handles UPDATE event and publishes messages', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UPDATE',
                    recordIds: ['a01xx000003DGb2'],
                    changeOrigin: 'CDC'
                },
                Name: 'Updated Event'
            }
        };
        sObjectMock.retrieve.mockResolvedValue({ UUID__c: 'uuid-123', Name: 'Updated Event' });

        await EventCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject).toHaveBeenCalledWith('Event__c');
        expect(sObjectMock.retrieve).toHaveBeenCalledWith('a01xx000003DGb2');
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('handles DELETE event and publishes messages', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'DELETE',
                    recordIds: ['a01xx000003DGb2'],
                    changeOrigin: 'CDC'
                }
            }
        };
        sObjectMock.select().where().limit().scanAll().run.mockResolvedValue([{ UUID__c: 'uuid-123' }]);

        await EventCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject).toHaveBeenCalledWith('Event__c');
        expect(sObjectMock.select).toHaveBeenCalledWith('UUID__c');
        expect(sObjectMock.where).toHaveBeenCalledWith({ Id: 'a01xx000003DGb2', IsDeleted: true });
        expect(sObjectMock.limit).toHaveBeenCalledWith(1);
        expect(sObjectMock.scanAll).toHaveBeenCalledWith(true);
        expect(sObjectMock.run).toHaveBeenCalled();
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('logs and sends error if no recordId is present', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: [],
                    changeOrigin: 'CDC'
                }
            }
        };

        await EventCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.error).toHaveBeenCalledWith('No recordId found for action:', 'CREATE');
        expect(require('../../publisher/logger').sendMessage).toHaveBeenCalledWith("ERROR", "400", expect.stringContaining('No recordId found for action: CREATE'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });

    it('logs and sends error on thrown exception', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UPDATE',
                    recordIds: ['a01xx000003DGb2'],
                    changeOrigin: 'CDC'
                }
            }
        };
        // Simulate missing UUID__c (should throw)
        sObjectMock.retrieve.mockResolvedValue({});

        await EventCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining('❌ Critical error during UPDATE action:'), expect.any(String));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "500", expect.stringContaining('Critical error during UPDATE action:'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });
});
