const startUserConsumer = require('../../consumers/UserConsumer');
const xmlJsonTranslator = require('../../utils/xmlJsonTranslator');

jest.mock('../../utils/xmlJsonTranslator');

describe('UserConsumer', () => {
    const mockChannel = {
        assertQueue: jest.fn(),
        consume: jest.fn(),
        ack: jest.fn(),
        nack: jest.fn()
    };

    const mockSalesforceClient = {
        createUser: jest.fn(),
        updateUser: jest.fn(),
        deleteUser: jest.fn(),
        sObject: jest.fn()
    };

    const mockMsg = (content) => ({
        content: Buffer.from(content)
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should process create message and call createUser', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({ UserMessage: { UUID: '123' } });
        mockSalesforceClient.createUser.mockResolvedValue();

        await startUserConsumer(mockChannel, mockSalesforceClient);

        const consumerCallback = mockChannel.consume.mock.calls[0][1];
        await consumerCallback(mockMsg('<UserMessage><UUID>123</UUID></UserMessage>'));

        expect(mockSalesforceClient.createUser).toHaveBeenCalled();
        expect(mockChannel.ack).toHaveBeenCalled();
    });

    test('should nack and log error on invalid XML', async () => {
        xmlJsonTranslator.xmlToJson.mockRejectedValue(new Error('Invalid XML'));

        await startUserConsumer(mockChannel, mockSalesforceClient);

        const consumerCallback = mockChannel.consume.mock.calls[0][1];
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await consumerCallback(mockMsg('<InvalidXML>'));

        expect(mockChannel.nack).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('❌ Ongeldig XML formaat:', '<InvalidXML>');
    });

    test('should nack and log error on missing UserMessage', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({});

        await startUserConsumer(mockChannel, mockSalesforceClient);

        const consumerCallback = mockChannel.consume.mock.calls[0][1];
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await consumerCallback(mockMsg('<UserMessage></UserMessage>'));

        expect(mockChannel.nack).toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('❌ Ongeldig formaat:', {});
    });

    test('should process update message and call updateUser', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({ UserMessage: { UUID: '123' } });
        const mockQuery = {
            run: jest.fn().mockResolvedValue([{ Id: 'sfId123' }])
        };
        mockSalesforceClient.sObject.mockReturnValue({
            select: () => ({
                where: () => ({
                    limit: () => mockQuery
                })
            })
        });
        mockSalesforceClient.updateUser.mockResolvedValue();

        await startUserConsumer(mockChannel, mockSalesforceClient);

        const consumerCallback = mockChannel.consume.mock.calls[1][1]; // update
        await consumerCallback(mockMsg('<UserMessage><UUID>123</UUID></UserMessage>'));

        expect(mockSalesforceClient.updateUser).toHaveBeenCalledWith('sfId123', expect.any(Object));
        expect(mockChannel.ack).toHaveBeenCalled();
    });

    test('should process delete message and call deleteUser', async () => {
        xmlJsonTranslator.xmlToJson.mockResolvedValue({ UserMessage: { UUID: '123' } });
        const mockQuery = {
            run: jest.fn().mockResolvedValue([{ Id: 'sfId123' }])
        };
        mockSalesforceClient.sObject.mockReturnValue({
            select: () => ({
                where: () => ({
                    limit: () => mockQuery
                })
            })
        });
        mockSalesforceClient.deleteUser.mockResolvedValue();

        await startUserConsumer(mockChannel, mockSalesforceClient);

        const consumerCallback = mockChannel.consume.mock.calls[2][1]; // delete
        await consumerCallback(mockMsg('<UserMessage><UUID>123</UUID></UserMessage>'));

        expect(mockSalesforceClient.deleteUser).toHaveBeenCalledWith('sfId123');
        expect(mockChannel.ack).toHaveBeenCalled();
    });
});
