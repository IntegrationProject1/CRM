const EventCDCHandler = require('../../cdc/EventCDCHandler');

jest.mock('../../utils/xmlJsonTranslator', () => ({
    jsonToXml: jest.fn(() => '<xml>stub</xml>')
}));
jest.mock('../../utils/xmlValidator', () => ({
    validateXml: jest.fn(() => true)
}));

const xmlJsonTranslator = require('../../utils/xmlJsonTranslator');
const validator = require('../../utils/xmlValidator');

describe('EventCDCHandler', () => {
    let sfClient, RMQChannel;

    beforeEach(() => {
        // Mock the Salesforce client with the needed chain for DELETE (scanAll)
        const sObjectMock = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            scanAll: jest.fn().mockReturnThis(),
            run: jest.fn().mockResolvedValue([{ UUID__c: 'uuid-123' }]),
            update: jest.fn().mockResolvedValue(),
            retrieve: jest.fn().mockResolvedValue({ UUID__c: 'uuid-123' }),
        };
        sfClient = {
            sObject: jest.fn(() => sObjectMock),
            update: jest.fn().mockResolvedValue(),
            retrieve: jest.fn().mockResolvedValue({ UUID__c: 'uuid-123' }),
        };
        RMQChannel = {
            assertExchange: jest.fn(),
            publish: jest.fn()
        };
        jest.clearAllMocks();
    });

    it('handles CREATE CDC event', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sf-id-1'],
                    changeOrigin: 'other'
                },
                Name: 'EventName',
                Description__c: 'Desc',
                StartDateTime__c: '2025-05-22T09:00:00Z',
                EndDateTime__c: '2025-05-22T17:00:00Z',
                Location__c: 'Loc',
                Organiser__c: 'Org',
                EventType__c: 'Type'
            }
        };

        await EventCDCHandler(message, sfClient, RMQChannel);

        expect(sfClient.sObject).toHaveBeenCalledWith('Event__c');
        expect(sfClient.sObject().update).toHaveBeenCalledWith({ Id: 'sf-id-1', UUID__c: expect.any(String) });
        expect(xmlJsonTranslator.jsonToXml).toHaveBeenCalledWith(expect.objectContaining({
            CreateEvent: expect.any(Object)
        }));
        expect(validator.validateXml).toHaveBeenCalledWith('<xml>stub</xml>', expect.stringContaining('CreateEvent.xsd'));
        expect(RMQChannel.assertExchange).toHaveBeenCalledWith('event', 'topic', { durable: true });
        expect(RMQChannel.publish).toHaveBeenCalledWith(
            'event',
            expect.stringContaining('planning.event.create'),
            Buffer.from('<xml>stub</xml>')
        );
    });

    it('handles UPDATE CDC event', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'UPDATE',
                    recordIds: ['sf-id-1'],
                    changeOrigin: 'other'
                },
                Name: 'EventName',
                Description__c: 'Desc'
            }
        };

        await EventCDCHandler(message, sfClient, RMQChannel);

        expect(sfClient.sObject).toHaveBeenCalledWith('Event__c');
        expect(sfClient.sObject().retrieve).toHaveBeenCalledWith('sf-id-1');
        expect(xmlJsonTranslator.jsonToXml).toHaveBeenCalledWith(expect.objectContaining({
            UpdateEvent: expect.any(Object)
        }));
        expect(validator.validateXml).toHaveBeenCalledWith('<xml>stub</xml>', expect.stringContaining('UpdateEvent.xsd'));
        expect(RMQChannel.publish).toHaveBeenCalled();
    });

    it('handles DELETE CDC event', async () => {
        // Set up the scanAll().run() chain to return a UUID for the deleted record
        sfClient.sObject().select().where().limit().scanAll().run.mockResolvedValue([
            { UUID__c: 'uuid-123' }
        ]);
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'DELETE',
                    recordIds: ['sf-id-1'],
                    changeOrigin: 'other'
                }
            }
        };

        await EventCDCHandler(message, sfClient, RMQChannel);

        expect(xmlJsonTranslator.jsonToXml).toHaveBeenCalledWith(expect.objectContaining({
            DeleteEvent: expect.any(Object)
        }));
        expect(validator.validateXml).toHaveBeenCalledWith('<xml>stub</xml>', expect.stringContaining('DeleteEvent.xsd'));
        expect(RMQChannel.publish).toHaveBeenCalled();
    });

    it('skips Salesforce-originated changes', async () => {
        const message = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    recordIds: ['sf-id-1'],
                    changeOrigin: 'com/salesforce/api/rest/50.0'
                }
            }
        };
        await EventCDCHandler(message, sfClient, RMQChannel);
        expect(sfClient.sObject().update).not.toHaveBeenCalled();
        expect(RMQChannel.publish).not.toHaveBeenCalled();
    });
});
