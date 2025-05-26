/**
 * Validates an XML string against an XSD schema.
 * @module xmlValidator
 * @file utils/xmlValidator.js
 * @description Provides a function to validate XML strings against XSD schemas.
 * @requires libxmljs - A library for parsing and validating XML documents.
 * @requires fs - Node.js file system module for reading files.
 * @requires path - Node.js path module for resolving file paths.
 * @requires general_logger - A logger for general application logging.
 * @requires sendMessage - A function to send messages to a message queue or logging service.
 */

const libxmljs = require('libxmljs2');
const fs = require('fs');
const path = require('path');
const {general_logger} = require("./logger");
const {sendMessage} = require("../publisher/logger");

/**
 * Validates an XML string against an XSD schema.
 * @param {string} xmlString - The XML string to validate.
 * @param {string} xsdPath - Path to the XSD schema file.
 * @returns {boolean} True if the XML is valid, false otherwise.
 * @example
 * const xml = '<UserMessage>...</UserMessage>';
 * const isValid = validateXml(xml, './schema.xsd');
 */
async function validateXml(xmlString, xsdPath) {
    try {
        const xsdContent = fs.readFileSync(path.resolve(xsdPath), 'utf-8');
        const xsdDoc = libxmljs.parseXml(xsdContent);
        const xmlDoc = libxmljs.parseXml(xmlString);

        const isValid = xmlDoc.validate(xsdDoc);
        if (!isValid) {
            general_logger.error('Validation error of the xml:', xmlDoc.validationErrors);
            await sendMessage("error", "400", "XML validation failed");
        }
        return isValid;
    } catch (err) {
        general_logger.error("Error validating XML against XSD:", err.message);
        await sendMessage("error", "500", "XML validation error");
        return false;
    }
}

module.exports = {
    validateXml
};