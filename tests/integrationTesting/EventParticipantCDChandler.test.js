const EventParticipantCDCHandler = require('../../cdc/EventParticipantCDCHandler');

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
        warn: jest.fn(),
        error: jest.fn()
    }
}));
jest.mock('../../publisher/logger', () => ({
    sendMessage: jest.fn()
}));

describe('EventParticipantCDCHandler integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('handles CREATE event and publishes messages', async () => {
        // Mock event and contact lookups
        sObjectMock.retrieve
            .mockResolvedValueOnce({ UUID__c: 'event-uuid' }) // Event__c
            .mockResolvedValueOnce({ UUID__c: 'contact-uuid', LastName: 'Doe' }); // Contact
        sObjectMock.update.mockResolvedValue({});
        sObjectMock.select().where().run.mockResolvedValue([
            { Contact_UUID__c: 'contact-uuid' }
        ]);
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: true });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['epart-1'],
                    changeOrigin: 'CDC'
                },
                Event__c: 'evt-1',
                Contact__c: 'contact-1'
            }
        };

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('handles DELETE event and publishes messages', async () => {
        // First call: for Event__c and Event_UUID__c
        sObjectMock.select().where().limit().scanAll().run.mockResolvedValueOnce([
            { Event__c: 'evt-1', Event_UUID__c: 'event-uuid' }
        ]);
        // Second call: for Contact_UUID__c
        sObjectMock.select().where().run.mockResolvedValueOnce([
            { Contact_UUID__c: 'contact-uuid' }
        ]);
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: true });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'DELETE',
                    recordIds: ['epart-1'],
                    changeOrigin: 'CDC'
                }
            }
        };

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

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

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.error).toHaveBeenCalledWith('No recordId found for action:', 'CREATE');
        expect(require('../../publisher/logger').sendMessage).toHaveBeenCalledWith("ERROR", "400", expect.stringContaining('No recordId found for action: CREATE'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });

    it('logs and sends error if no Event ID in CDC object', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['epart-1'],
                    changeOrigin: 'CDC'
                }
                // No Event__c!
            }
        };

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining('No Event ID found in the CDC object for action CREATE'));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "400", expect.stringContaining('No Event ID found in the CDC object for action CREATE'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });

    it('logs and sends error if no Event UUID', async () => {
        sObjectMock.retrieve.mockResolvedValueOnce({}); // No UUID__c

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['epart-1'],
                    changeOrigin: 'CDC'
                },
                Event__c: 'evt-1',
                Contact__c: 'contact-1'
            }
        };

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining('No UUID found for event record: evt-1'));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "400", expect.stringContaining('No UUID found for event record: evt-1'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });

    it('logs and sends error if no Contact UUID', async () => {
        sObjectMock.retrieve
            .mockResolvedValueOnce({ UUID__c: 'event-uuid' }) // Event__c
            .mockResolvedValueOnce({}); // Contact (no UUID__c)

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['epart-1'],
                    changeOrigin: 'CDC'
                },
                Event__c: 'evt-1',
                Contact__c: 'contact-1'
            }
        };

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining('No UUID found for contact ID: contact-1'));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "400", expect.stringContaining('No UUID found for contact ID: contact-1'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });

    it('logs and sends error if XSD validation fails', async () => {
        sObjectMock.retrieve
            .mockResolvedValueOnce({ UUID__c: 'event-uuid' }) // Event__c
            .mockResolvedValueOnce({ UUID__c: 'contact-uuid', LastName: 'Doe' }); // Contact
        sObjectMock.update.mockResolvedValue({});
        sObjectMock.select().where().run.mockResolvedValue([
            { Contact_UUID__c: 'contact-uuid' }
        ]);
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: false });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['epart-1'],
                    changeOrigin: 'CDC'
                },
                Event__c: 'evt-1',
                Contact__c: 'contact-1'
            }
        };

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining('Error during XSD validation:'), expect.any(String));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "500", expect.stringContaining('Error during XSD validation:'));
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });

    it('logs and sends warning for UPDATE action', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UPDATE',
                    recordIds: ['epart-1'],
                    changeOrigin: 'CDC'
                }
            }
        };

        await EventParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').event_logger.warn)
            .toHaveBeenCalledWith("Update action not supported for Event_Participant__c.");
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("WARNING", "400", "Update action not supported for Event_Participant__c.");
        expect(mockRMQChannel.publish).not.toHaveBeenCalled();
    });
});
