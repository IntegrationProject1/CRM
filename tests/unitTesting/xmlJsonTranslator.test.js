const xml2js = require('xml2js');
const { xmlToJson, jsonToXml } = require('../../utils/xmlJsonTranslator');

// Mock parseString en Builder
jest.mock('xml2js');

describe('xmlJsonTranslator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('xmlToJson', () => {
        test('should convert valid XML to JSON', async () => {
            const mockXml = '<user><id>123</id></user>';
            const mockJson = { user: { id: '123' } };

            xml2js.parseString.mockImplementation((xml, options, callback) => {
                callback(null, mockJson);
            });

            const result = await xmlToJson(mockXml);
            expect(result).toEqual(mockJson);
            expect(xml2js.parseString).toHaveBeenCalledWith(
                mockXml,
                { explicitArray: false },
                expect.any(Function)
            );
        });

        test('should reject if XML is invalid', async () => {
            const mockXml = '<invalid></xml>';

            xml2js.parseString.mockImplementation((xml, options, callback) => {
                callback(new Error('Invalid XML'), null);
            });

            await expect(xmlToJson(mockXml)).rejects.toThrow('Invalid XML');
            expect(xml2js.parseString).toHaveBeenCalledWith(
                mockXml,
                { explicitArray: false },
                expect.any(Function)
            );
        });
    });

    describe('jsonToXml', () => {
        test('should convert JSON to XML string', () => {
            const mockJson = { user: { id: '123' } };
            const mockXmlString = '<user><id>123</id></user>';

            const mockBuildObject = jest.fn().mockReturnValue(mockXmlString);
            xml2js.Builder.mockImplementation(() => ({
                buildObject: mockBuildObject
            }));

            const result = jsonToXml(mockJson);
            expect(result).toBe(mockXmlString);
            expect(xml2js.Builder).toHaveBeenCalledWith({});
            expect(mockBuildObject).toHaveBeenCalledWith(mockJson);
        });
    });
});
