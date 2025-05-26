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
    session_logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
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

const StartSessionConsumer = require('../../consumers/SessionConsumer');
const xmlJsonTranslator = require('../../utils/xmlJsonTranslator');

describe('SessionConsumer Integration', () => {
    let channel, salesforceClient, sObjectMock;

    beforeEach(() => {
        sObjectMock = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            run: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        };
        channel = {
            assertQueue: jest.fn(),
            consume: jest.fn(),
            ack: jest.fn(),
            nack: jest.fn()
        };
        salesforceClient = {
            sObject: jest.fn(() => sObjectMock)
        };
        jest.clearAllMocks();
    });

    it('processes a valid create session message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            CreateSession: {
                SessionUUID: 'sess-1',
                SessionName: 'Session Test',
                EventUUID: 'evt-1'
            }
        });
        sObjectMock.run.mockResolvedValueOnce([{ Id: 'evt123' }]); // for Event__c

        await StartSessionConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('<CreateSession><SessionUUID>sess-1</SessionUUID><SessionName>Session Test</SessionName><EventUUID>evt-1</EventUUID></CreateSession>') };
        await handler(msg);

        expect(salesforceClient.sObject).toHaveBeenCalledWith("Session__c");
        expect(sObjectMock.create).toHaveBeenCalledWith(expect.objectContaining({
            UUID__c: 'sess-1',
            Name: 'Session Test',
            Event__c: 'evt123'
        }));
        expect(channel.ack).toHaveBeenCalledWith(msg);
    });

    it('processes a valid update session message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            UpdateSession: {
                SessionUUID: 'sess-2',
                SessionName: 'Updated Session'
            }
        });
        sObjectMock.run.mockResolvedValueOnce([{ Id: 'sess456' }]); // for Session__c

        await StartSessionConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[1][1];
        const msg = { content: Buffer.from('<UpdateSession><SessionUUID>sess-2</SessionUUID><SessionName>Updated Session</SessionName></UpdateSession>') };
        await handler(msg);

        expect(salesforceClient.sObject).toHaveBeenCalledWith("Session__c");
        expect(sObjectMock.update).toHaveBeenCalledWith(expect.objectContaining({
            Id: 'sess456',
            Name: 'Updated Session'
        }));
        expect(channel.ack).toHaveBeenCalledWith(msg);
    });

    it('processes a valid delete session message', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({
            DeleteSession: {
                SessionUUID: 'sess-3'
            }
        });
        sObjectMock.run.mockResolvedValueOnce([{ Id: 'sess789' }]); // for Session__c

        await StartSessionConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[2][1];
        const msg = { content: Buffer.from('<DeleteSession><SessionUUID>sess-3</SessionUUID></DeleteSession>') };
        await handler(msg);

        expect(salesforceClient.sObject).toHaveBeenCalledWith("Session__c");
        expect(sObjectMock.delete).toHaveBeenCalledWith('sess789');
        expect(channel.ack).toHaveBeenCalledWith(msg);
    });

    it('log errors error for invalid XML', async () => {
        xmlJsonTranslator.xmlToJson.mockRejectedValue(new Error('Invalid XML'));
        await StartSessionConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('invalid xml') };
        await handler(msg);

        expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
        expect(require('../../utils/logger').session_logger.error)
            .toHaveBeenCalledWith(expect.stringContaining("Invalid XML formate"));
    });

    it('log errors for missing root XML', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({});
        await StartSessionConsumer(channel, salesforceClient);

        const handler = channel.consume.mock.calls[0][1];
        const msg = { content: Buffer.from('<InvalidRoot></InvalidRoot>') };
        await handler(msg);

        expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
        expect(require('../../utils/logger').session_logger.error).toHaveBeenCalled();
    });
});
