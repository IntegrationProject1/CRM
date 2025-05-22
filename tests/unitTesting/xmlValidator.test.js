const fs = require('fs');
const path = require('path');

jest.mock('libxmljs2', () => ({
    parseXml: jest.fn(() => ({
        validate: jest.fn().mockReturnValue(true),
        validationErrors: []
    }))
}));

const { validateXml } = require('../../utils/xmlValidator');

jest.mock('fs');

describe('xmlValidator', () => {
    const mockXsdPath = path.join(__dirname, '../../xsd/testXSD.xsd');
    const validXml = `<User><Name>Test</Name></User>`;
    const invalidXml = `<User><Name>Test</User>`; // Closing tag mismatch

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should return true for valid XML', () => {
        fs.readFileSync.mockReturnValue('<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"></xsd:schema>');

        const result = validateXml(validXml, mockXsdPath);
        expect(result).toBe(true);
    });

    test('should return false for invalid XML', () => {
        fs.readFileSync.mockReturnValue('<dummyXSD></dummyXSD>');

        const libxmljsMock = require('libxmljs2').parseXml;

        libxmljsMock
            .mockReturnValueOnce({}) // Mock voor xsdDoc
            .mockReturnValueOnce({
                validate: jest.fn().mockReturnValue(false),
                validationErrors: ['Invalid XML structure']
            });

        const result = validateXml(invalidXml, mockXsdPath);
        expect(result).toBe(false);
    });

    test('should return false if fs.readFileSync throws error', () => {
        fs.readFileSync.mockImplementation(() => { throw new Error('File not found'); });

        const result = validateXml(validXml, 'nonexistent.xsd');
        expect(result).toBe(false);
    });
});
