const SessionParticipantCDCHandler = require('../../cdc/SessionParticipateCDCHandler');

const sObjectMock = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    scanAll: jest.fn().mockReturnThis(),
    run: jest.fn(),
    retrieve: jest.fn(),
    update: jest.fn()
};
const mockSfClient = {
    sObject: jest.fn(() => sObjectMock)
};

const mockRMQChannel = {
    assertExchange: jest.fn(),
    publish: jest.fn()
};

jest.mock('../../utils/xmlJsonTranslator', () => ({
    jsonToXml: jest.fn(() => '<SessionParticipantMessage></SessionParticipantMessage>')
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

describe('SessionParticipantCDCHandler integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('skips Salesforce API-originated changes', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeOrigin: "com/salesforce/api/rest/50.0",
                    changeType: 'CREATE'
                }
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.debug)
            .toHaveBeenCalledWith("Salesforce API call detected, skipping action.");
        expect(require('../../publisher/logger').sendMessage).not.toHaveBeenCalledWith(
            expect.stringContaining("Captured Session Participant Object:")
        );
    });

    it('handles CREATE event and publishes messages', async () => {
        // Mock session lookup
        sObjectMock.retrieve
            .mockResolvedValueOnce({
                UUID__c: 'sess-uuid',
                Event__r: { UUID__c: 'event-uuid' }
            })
            .mockResolvedValueOnce({
                Email: 'user@example.com',
                LastName: 'Doe'
            });
        // Update participant
        sObjectMock.update.mockResolvedValue({});
        // Participants lookup
        sObjectMock.select().where().run.mockResolvedValueOnce([
            { ParticipantEmail__c: 'user@example.com' }
        ]);
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: true });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                },
                Session__c: 'sess-1',
                Contact__c: 'contact-1'
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockSfClient.sObject).toHaveBeenCalledWith('Session__c');
        expect(sObjectMock.retrieve).toHaveBeenCalledWith('sess-1');
        expect(mockSfClient.sObject).toHaveBeenCalledWith('Contact');
        expect(sObjectMock.retrieve).toHaveBeenCalledWith('contact-1');
        expect(mockSfClient.sObject).toHaveBeenCalledWith('Session_Participant__c');
        expect(sObjectMock.update).toHaveBeenCalledWith(
            expect.objectContaining({
                Id: 'sp-1',
                Session_UUID__c: 'sess-uuid',
                ParticipantEmail__c: 'user@example.com',
                Name: 'Doe'
            })
        );
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('handles DELETE event and publishes messages', async () => {
        // Deleted participant lookup
        sObjectMock.select().where().limit().scanAll().run.mockResolvedValueOnce([
            { Session__c: 'sess-1', Session_UUID__c: 'sess-uuid' }
        ]);
        // Session lookup for event UUID
        sObjectMock.select().retrieve.mockResolvedValueOnce({
            Event__r: { UUID__c: 'event-uuid' }
        });
        // Participants lookup
        sObjectMock.select().where().run.mockResolvedValueOnce([
            { ParticipantEmail__c: 'user@example.com' }
        ]);
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: true });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'DELETE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                }
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('handles UNDELETE event and publishes messages', async () => {
        // Session lookup for UUIDs
        sObjectMock.retrieve.mockResolvedValueOnce({
            UUID__c: 'sess-uuid',
            Event__r: { UUID__c: 'event-uuid' }
        });
        // Participants lookup
        sObjectMock.select().where().run.mockResolvedValueOnce([
            { ParticipantEmail__c: 'user@example.com' }
        ]);
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: true });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UNDELETE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                },
                Session__c: 'sess-1'
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    it('logs and sends warning for UPDATE action', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UPDATE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                }
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.warn)
            .toHaveBeenCalledWith("Update action not supported for Session_Participant__c.");
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("WARNING", "400", "Update action not supported for Session_Participant__c.");
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

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith('No recordId found for action:', 'CREATE');
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "400", expect.stringContaining('No recordId found for action: CREATE'));
    });

    it('logs and sends error if no Session ID in CDC object or query', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                }
                // No Session__c
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining("No Session ID found in the CDC object for action CREATE"));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "400", expect.stringContaining("No Session ID found in the CDC object for action CREATE"));
    });

    it('logs and sends error if missing UUIDs for session', async () => {
        sObjectMock.retrieve.mockResolvedValueOnce({
            // Missing UUID__c and/or Event__r.UUID__c
        });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                },
                Session__c: 'sess-1',
                Contact__c: 'contact-1'
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining("Missing UUIDs for Session (sess-1)"));
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "400", expect.stringContaining("Missing UUIDs for Session (sess-1)"));
    });

    it('logs and sends error if contact has no email', async () => {
        sObjectMock.retrieve
            .mockResolvedValueOnce({
                UUID__c: 'sess-uuid',
                Event__r: { UUID__c: 'event-uuid' }
            })
            .mockResolvedValueOnce({
                // No Email
            });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                },
                Session__c: 'sess-1',
                Contact__c: 'contact-1'
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith("Error processing CREATE action:", "Contact has no email");
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "500", expect.stringContaining("Error processing CREATE action: Contact has no email"));
    });

    it('logs and sends error if XML validation fails', async () => {
        sObjectMock.retrieve
            .mockResolvedValueOnce({
                UUID__c: 'sess-uuid',
                Event__r: { UUID__c: 'event-uuid' }
            })
            .mockResolvedValueOnce({
                Email: 'user@example.com',
                LastName: 'Doe'
            });
        sObjectMock.update.mockResolvedValue({});
        sObjectMock.select().where().run.mockResolvedValueOnce([
            { ParticipantEmail__c: 'user@example.com' }
        ]);
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: false });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                },
                Session__c: 'sess-1',
                Contact__c: 'contact-1'
            }
        };

        await SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel);

        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith("XML validation error:", "XML validation failed");
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "400", expect.stringContaining("XML validation error: XML validation failed"));
    });

    it('logs and sends error if participant lookup fails', async () => {
        sObjectMock.retrieve
            .mockResolvedValueOnce({
                UUID__c: 'sess-uuid',
                Event__r: { UUID__c: 'event-uuid' }
            })
            .mockResolvedValueOnce({
                Email: 'user@example.com',
                LastName: 'Doe'
            });
        sObjectMock.update.mockResolvedValue({});
        sObjectMock.select().where().run.mockRejectedValueOnce(new Error('DB error'));
        require('../../utils/xmlValidator').validateXml.mockReturnValue({ isValid: true });

        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sp-1'],
                    changeOrigin: 'CDC'
                },
                Session__c: 'sess-1',
                Contact__c: 'contact-1'
            }
        };

        await expect(SessionParticipantCDCHandler(message, mockSfClient, mockRMQChannel))
            .rejects.toThrow('DB error');

        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith("❌ Failed to fetch participants:", "DB error");
        expect(require('../../publisher/logger').sendMessage)
            .toHaveBeenCalledWith("ERROR", "500", expect.stringContaining("Failed to fetch participants: DB error"));
    });
});
