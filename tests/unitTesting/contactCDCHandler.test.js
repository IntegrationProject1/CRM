const contactCDCHandler = require('../../cdc/ContactCDCHandler');
const { jsonToXml } = require('../../utils/xmlJsonTranslator');
const validator = require('../../utils/xmlValidator');

jest.mock('../../utils/xmlJsonTranslator');
jest.mock('../../utils/xmlValidator');

describe('ContactCDCHandler', () => {
    const mockSFClient = {
        updateUser: jest.fn(),
        sObject: jest.fn()
    };

    const mockRMQChannel = {
        assertExchange: jest.fn(),
        publish: jest.fn()
    };

    const baseMessage = {
        payload: {
            ChangeEventHeader: {
                changeType: 'CREATE',
                changeOrigin: 'some/other/source',
                recordIds: ['abc123']
            },
            Name: { FirstName: 'John', LastName: 'Doe' },
            Email: 'john@example.com',
            Phone: '123456789'
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle CREATE action and publish messages', async () => {
        jsonToXml.mockReturnValue('<UserMessage></UserMessage>');
        validator.validateXml.mockReturnValue({ isValid: true });
        mockSFClient.updateUser.mockResolvedValue();

        await contactCDCHandler(baseMessage, mockSFClient, mockRMQChannel);

        expect(mockSFClient.updateUser).toHaveBeenCalledWith('abc123', expect.objectContaining({ UUID__c: expect.any(String) }));
        expect(mockRMQChannel.assertExchange).toHaveBeenCalledWith('user', 'topic', { durable: true });
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    test('should skip processing if API call origin detected', async () => {
        const apiMessage = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    changeOrigin: 'com/salesforce/api/rest/50.0'
                }
            }
        };

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await contactCDCHandler(apiMessage, mockSFClient, mockRMQChannel);

        expect(consoleSpy).toHaveBeenCalledWith('🚫 Salesforce API call gedetecteerd, actie overgeslagen.');
        expect(mockSFClient.updateUser).not.toHaveBeenCalled();
    });

    test('should log error if no recordId found', async () => {
        const faultyMessage = {
            payload: {
                ChangeEventHeader: {
                    changeType: 'CREATE',
                    changeOrigin: 'external',
                    recordIds: []
                }
            }
        };

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await contactCDCHandler(faultyMessage, mockSFClient, mockRMQChannel);

        expect(consoleSpy).toHaveBeenCalledWith('❌ Geen recordId gevonden.');
    });

    test('should handle UPDATE action and retrieve UUID', async () => {
        const updateMessage = {
            ...baseMessage,
            payload: {
                ...baseMessage.payload,
                ChangeEventHeader: {
                    ...baseMessage.payload.ChangeEventHeader,
                    changeType: 'UPDATE'
                }
            }
        };

        mockSFClient.sObject.mockReturnValue({
            retrieve: jest.fn().mockResolvedValue({
                UUID__c: 'uuid-123',
                Password__c: 'pass123',
                FirstName: 'John',
                LastName: 'Doe',
                Phone: '123456789',
                Email: 'john@example.com'
            })
        });
        jsonToXml.mockReturnValue('<UserMessage></UserMessage>');
        validator.validateXml.mockReturnValue({ isValid: true });

        await contactCDCHandler(updateMessage, mockSFClient, mockRMQChannel);

        expect(mockSFClient.sObject).toHaveBeenCalledWith('Contact');
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    test('should handle DELETE action and retrieve UUID', async () => {
        const deleteMessage = {
            ...baseMessage,
            payload: {
                ...baseMessage.payload,
                ChangeEventHeader: {
                    ...baseMessage.payload.ChangeEventHeader,
                    changeType: 'DELETE'
                }
            }
        };

        const mockQuery = {
            run: jest.fn().mockResolvedValue([{ UUID__c: 'uuid-456' }])
        };
        mockSFClient.sObject.mockReturnValue({
            select: () => ({
                where: () => ({
                    limit: () => ({
                        scanAll: () => mockQuery
                    })
                })
            })
        });
        jsonToXml.mockReturnValue('<UserMessage></UserMessage>');
        validator.validateXml.mockReturnValue({ isValid: true });

        await contactCDCHandler(deleteMessage, mockSFClient, mockRMQChannel);

        expect(mockSFClient.sObject).toHaveBeenCalledWith('Contact');
        expect(mockRMQChannel.publish).toHaveBeenCalledTimes(3);
    });

    test('should log error when XML validation fails', async () => {
        jsonToXml.mockReturnValue('<InvalidXml></InvalidXml>');
        validator.validateXml.mockReturnValue({ 
            isValid: false,
            errorType: 'error',
            errorCode: '400',
            errorMessage: 'XML validation failed',
            validationErrors: ['Invalid XML structure']
        });

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await contactCDCHandler(baseMessage, mockSFClient, mockRMQChannel);

        expect(consoleSpy).toHaveBeenCalledWith('❌ Kritieke fout tijdens CREATE actie:', expect.stringContaining('XML validatie gefaald'));
    });
});
