const SessionCDCHandler = require('../../cdc/SessionCDCHandler');

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
    jsonToXml: jest.fn(() => '<SessionMessage></SessionMessage>')
}));
jest.mock('../../utils/xmlValidator', () => ({
    validateXml: jest.fn(() => ({ isValid: true }))
}));
jest.mock('../../utils/logger', () => ({
    session_logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));
jest.mock('../../publisher/logger', () => ({
    sendMessage: jest.fn()
}));

describe('SessionCDCHandler integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('handles CREATE event and publishes messages', async () => {
        // Mock event and guest speaker lookups
        sObjectMock.update.mockResolvedValue({});
        sObjectMock.run
            .mockResolvedValueOnce([{ UUID__c: 'event-uuid' }]) // Event__c lookup
            .mockResolvedValueOnce([{ Email: 'speaker@example.com' }]) // GuestSpeaker__c lookup
            .mockResolvedValue([{ Email: 'user1@example.com' }, { Email: 'user2@example.com' }]); // Users

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sess-1'],
                    changeOrigin: 'CDC'
                },
                Name: 'Session Name',
                Description__c: 'desc',
                Event__c: 'evt-1',
                GuestSpeaker__c: 'guest-1',
                Session_Participant__c: 'user-1;user-2',
                Capacity__c: 10,
                StartDateTime__c: '2025-05-26T10:00:00Z',
                EndDateTime__c: '2025-05-26T12:00:00Z',
                Location__c: 'Room 1',
                SessionType__c: 'Workshop'
            }
        };

        await SessionCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject).toHaveBeenCalledWith('Session__c');
        expect(sObjectMock.update).toHaveBeenCalled();
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('session', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(1);
    });

    it('handles UPDATE event and publishes messages', async () => {
        sObjectMock.retrieve.mockResolvedValue({
            UUID__c: 'sess-uuid',
            Name: 'Session Name',
            Description__c: 'desc',
            Event__c: 'evt-1',
            GuestSpeaker__c: 'guest-1',
            Capacity__c: 10,
            StartDateTime__c: '2025-05-26T10:00:00Z',
            EndDateTime__c: '2025-05-26T12:00:00Z',
            Location__c: 'Room 1',
            SessionType__c: 'Workshop'
        });
        sObjectMock.run
            .mockResolvedValueOnce([{ UUID__c: 'event-uuid' }]) // Event__c lookup
            .mockResolvedValueOnce([{ Email: 'speaker@example.com' }]); // GuestSpeaker__c lookup

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UPDATE',
                    recordIds: ['sess-1'],
                    changeOrigin: 'CDC'
                },
                Name: 'Updated Session Name'
            }
        };

        await SessionCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject).toHaveBeenCalledWith('Session__c');
        expect(sObjectMock.retrieve).toHaveBeenCalledWith('sess-1');
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('session', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(1);
    });

    it('handles DELETE event and publishes messages', async () => {
        sObjectMock.select().where().limit().scanAll().run.mockResolvedValue([{ UUID__c: 'sess-uuid' }]);

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'DELETE',
                    recordIds: ['sess-1'],
                    changeOrigin: 'CDC'
                }
            }
        };

        await SessionCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject).toHaveBeenCalledWith('Session__c');
        expect(sObjectMock.select).toHaveBeenCalledWith('UUID__c');
        expect(sObjectMock.where).toHaveBeenCalledWith({ Id: 'sess-1' });
        expect(sObjectMock.limit).toHaveBeenCalledWith(1);
        expect(sObjectMock.scanAll).toHaveBeenCalledWith(true);
        expect(sObjectMock.run).toHaveBeenCalled();
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('session', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(1);
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

        await SessionCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.error).toHaveBeenCalledWith('No recordId found for action:', 'CREATE');
        expect(require('../../publisher/logger').sendMessage).toHaveBeenCalledWith("ERROR", "400", expect.stringContaining('No recordId found for action: CREATE'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });

    it('logs and sends error on thrown exception (missing UUID on DELETE)', async () => {
        sObjectMock.select().where().limit().scanAll().run.mockResolvedValue([{}]);

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'DELETE',
                    recordIds: ['sess-1'],
                    changeOrigin: 'CDC'
                }
            }
        };

        await SessionCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining('Error during DELETE action:'), expect.any(String));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "500", expect.stringContaining('Error during DELETE action:'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });
});
