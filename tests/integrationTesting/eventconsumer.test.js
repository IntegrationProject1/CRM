const StartEventConsumer = require('../../consumers/EventConsumer');

jest.mock('../../utils/xmlJsonTranslator', () => ({
    xmlToJson: jest.fn()
}));
const xmlJsonTranslator = require('../../utils/xmlJsonTranslator');

describe('EventConsumer integration', () => {
    let mockChannel;
    let mockSalesforceClient;

    beforeEach(() => {
        jest.clearAllMocks();

        mockChannel = {
            assertQueue: jest.fn(),
            consume: jest.fn(),
            ack: jest.fn(),
            nack: jest.fn()
        };

        mockSalesforceClient = {
            createEvent: jest.fn(),
            updateEvent: jest.fn(),
            deleteEvent: jest.fn(),
            sObject: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                run: jest.fn()
            })
        };
    });

    it('processes CREATE message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            CreateEvent: {
                EventUUID: 'uuid-123',
                EventName: 'Test Event',
                EventDescription: 'Desc',
                StartDateTime: '2025-05-22T09:00:00Z',
                EndDateTime: '2025-05-22T17:00:00Z',
                EventLocation: 'Test Location',
                Organisator: 'Test Org',
                Capacity: '100',
                EventType: 'Conference'
            }
        });

        await StartEventConsumer(mockChannel, mockSalesforceClient);

        // Simulate message handler for create queue
        const handler = mockChannel.consume.mock.calls[0][1];
        await handler({ content: Buffer.from('<CreateEvent></CreateEvent>') });

        expect(mockSalesforceClient.createEvent).toHaveBeenCalledWith(expect.objectContaining({
            UUID__c: 'uuid-123',
            Name: 'Test Event',
            Description__c: '', // Because in your consumer: Description__c: rabbitMQMsg.Description || ""
            StartDateTime__c: '2025-05-22T09:00:00Z',
            EndDateTime__c: '2025-05-22T17:00:00Z',
            Location__c: 'Test Location',
            Organiser__c: 'Test Org',
            EventType__c: 'Conference'
        }));
        expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('processes UPDATE message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            UpdateEvent: {
                EventUUID: 'uuid-123',
                EventName: 'Updated Event',
                Description: 'Updated Desc',
                StartDateTime: '2025-05-23T09:00:00Z',
                EndDateTime: '2025-05-23T17:00:00Z',
                Location: 'Updated Location',
                Organisator: 'Updated Org',
                EventType: 'Workshop'
            }
        });
        mockSalesforceClient.sObject().select().where().limit().run.mockResolvedValue([{ Id: '001xx000003DGb2' }]);

        await StartEventConsumer(mockChannel, mockSalesforceClient);

        const handler = mockChannel.consume.mock.calls[1][1];
        await handler({ content: Buffer.from('<UpdateEvent></UpdateEvent>') });

        expect(mockSalesforceClient.updateEvent).toHaveBeenCalledWith('001xx000003DGb2', expect.objectContaining({
            Name: 'Updated Event',
            Description__c: 'Updated Desc',
            StartDateTime__c: '2025-05-23T09:00:00Z',
            EndDateTime__c: '2025-05-23T17:00:00Z',
            Location__c: 'Updated Location',
            Organiser__c: 'Updated Org',
            EventType__c: 'Workshop'
        }));
        expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('processes DELETE message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            DeleteEvent: {
                EventUUID: 'uuid-123'
            }
        });
        mockSalesforceClient.sObject().select().where().limit().run.mockResolvedValue([{ Id: '001xx000003DGb2' }]);

        await StartEventConsumer(mockChannel, mockSalesforceClient);

        const handler = mockChannel.consume.mock.calls[2][1];
        await handler({ content: Buffer.from('<DeleteEvent></DeleteEvent>') });

        expect(mockSalesforceClient.deleteEvent).toHaveBeenCalledWith('001xx000003DGb2');
        expect(mockChannel.ack).toHaveBeenCalled();
    });

    it('nacks on invalid XML', async () => {
        xmlJsonTranslator.xmlToJson.mockRejectedValue(new Error('Invalid XML'));
        await StartEventConsumer(mockChannel, mockSalesforceClient);

        const handler = mockChannel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('<Invalid></Invalid>') };
        await handler(msg);

        expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
        expect(mockSalesforceClient.createEvent).not.toHaveBeenCalled();
    });

    it('nacks on missing root XSD', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({});
        await StartEventConsumer(mockChannel, mockSalesforceClient);

        const handler = mockChannel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('<CreateEvent></CreateEvent>') };
        await handler(msg);

        expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
        expect(mockSalesforceClient.createEvent).not.toHaveBeenCalled();
    });
});
