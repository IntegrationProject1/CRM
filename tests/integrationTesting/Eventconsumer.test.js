// --- Mocks to prevent open handles and undefined functions ---
jest.mock('pino', () => {
    const fakeLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn(() => fakeLogger)
    };
    fakeLogger.transport = jest.fn(() => ({}));
    fakeLogger.destination = jest.fn(() => ({}));
    return Object.assign(() => fakeLogger, fakeLogger);
});
jest.mock('../../publisher/logger', () => ({
    sendMessage: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
    event_logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    contact_logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    user_logger:    { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../utils/xmlJsonTranslator', () => ({
    jsonToXml: jest.fn(() => '<UserMessage></UserMessage>'),
    xmlToJson: jest.fn()
}));
jest.mock('../../utils/xmlValidator', () => ({
    validateXml: jest.fn(() => ({ isValid: true }))
}));

const StartEventConsumer = require('../../consumers/EventConsumer');
const xmlJsonTranslator = require('../../utils/xmlJsonTranslator');

describe('EventConsumer Integration', () => {
    let channel, salesforceClient, sObjectMock;

    beforeEach(() => {
        sObjectMock = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            run: jest.fn().mockResolvedValue([{ Id: 'sf123' }])
        };
        channel = {
            assertQueue: jest.fn(),
            consume: jest.fn(),
            ack: jest.fn(),
            nack: jest.fn()
        };
        salesforceClient = {
            createEvent: jest.fn(),
            updateEvent: jest.fn(),
            deleteEvent: jest.fn(),
            sObject: jest.fn(() => sObjectMock)
        };
        jest.clearAllMocks();
    });

    it('processes a valid create event message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            CreateEvent: {
                EventUUID: 'uuid-1',
                EventName: 'Test Event'
            }
        });
        await StartEventConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('<CreateEvent><EventUUID>uuid-1</EventUUID><EventName>Test Event</EventName></CreateEvent>') };
        await handler(msg);

        expect(salesforceClient.createEvent).toHaveBeenCalledWith(expect.objectContaining({ UUID__c: 'uuid-1', Name: 'Test Event' }));
        expect(channel.ack).toHaveBeenCalledWith(msg);
    });

    it('processes a valid update event message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            UpdateEvent: {
                EventUUID: 'uuid-2',
                EventName: 'Updated Event'
            }
        });
        await StartEventConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[1][1];
        const msg = { content: Buffer.from('<UpdateEvent><EventUUID>uuid-2</EventUUID><EventName>Updated Event</EventName></UpdateEvent>') };
        await handler(msg);

        expect(salesforceClient.updateEvent).toHaveBeenCalledWith('sf123', expect.objectContaining({ Name: 'Updated Event' }));
        expect(channel.ack).toHaveBeenCalledWith(msg);
    });

    it('processes a valid delete event message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            DeleteEvent: {
                EventUUID: 'uuid-3'
            }
        });
        await StartEventConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[2][1];
        const msg = { content: Buffer.from('<DeleteEvent><EventUUID>uuid-3</EventUUID></DeleteEvent>') };
        await handler(msg);

        expect(salesforceClient.deleteEvent).toHaveBeenCalledWith('sf123');
        expect(channel.ack).toHaveBeenCalledWith(msg);
    });

    it('log errors for invalid XML', async () => {
        xmlJsonTranslator.xmlToJson.mockRejectedValue(new Error('Invalid XML'));
        await StartEventConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('invalid xml') };
        await handler(msg);

        expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
        expect(require('../../utils/logger').event_logger.error).toHaveBeenCalledWith('Invalid XML format:', 'invalid xml');
    });

    it('log errors for missing root XML', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({});
        await StartEventConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('<InvalidRoot></InvalidRoot>') };
        await handler(msg);

        expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
        expect(require('../../utils/logger').event_logger.error).toHaveBeenCalled();
    });
});
