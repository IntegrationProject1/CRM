const libxmljs = require('libxmljs2');
const fs = require('fs');
const path = require('path');

/**
 * Module for validating XML against XSD schemas.
 * Provides functionality to ensure XML data conforms to specified XSD structures.
 * @module xmlValidator
 */

/**
 * Validates an XML string against an XSD schema.
 * @param {string} xmlString - The XML string to validate.
 * @param {string} xsdPath - Path to the XSD schema file.
 * @returns {boolean} True if the XML is valid, false otherwise.
 * @example
 * const xml = '<UserMessage>...</UserMessage>';
 * const isValid = validateXml(xml, './schema.xsd');
 */

function validateXml(xmlString, xsdPath) {
    try {
        if (!fs.existsSync(xsdPath)) {
            throw new Error(`XSD file not found at ${xsdPath}`);
        }
        const xsdContent = fs.readFileSync(path.resolve(xsdPath), 'utf-8');
        const xsdDoc = libxmljs.parseXml(xsdContent);
        const xmlDoc = libxmljs.parseXml(xmlString);

        const isValid = xmlDoc.validate(xsdDoc);
        if (!isValid) {
            console.error('❌ XML Validatiefouten:', xmlDoc.validationErrors);
        }
        return isValid;
    } catch (err) {
        console.error('❌ Fout bij valideren XML tegen XSD:', err.message);
        return false;
    }
}
module.exports = {
    validateXml
};