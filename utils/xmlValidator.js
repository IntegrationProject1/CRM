/**
 * Validates an XML string against an XSD schema.
 * @module xmlValidator
 * @file utils/xmlValidator.js
 * @description Provides a function to validate XML strings against XSD schemas.
 * @requires libxmljs - A library for parsing and validating XML documents.
 * @requires fs - Node.js file system module for reading files.
 * @requires path - Node.js path module for resolving file paths.
 * @requires general_logger - A logger for general application logging.
 */

const libxmljs = require('libxmljs2');
const fs = require('fs');
const path = require('path');
const {general_logger} = require("./logger");

/**
 * Validates an XML string against an XSD schema.
 * @param {string} xmlString - The XML string to validate.
 * @param {string} xsdPath - Path to the XSD schema file.
 * @returns {Object} Object with isValid flag and error details if validation fails.
 * @example
 * const xml = '<UserMessage>...</UserMessage>';
 * const result = validateXml(xml, './schema.xsd');
 * if (result.isValid) {
 *   // XML is valid
 * } else {
 *   // Handle validation error
 *   console.error(result.errorType, result.errorMessage);
 * }
 */
function validateXml(xmlString, xsdPath) {
    try {
        const xsdContent = fs.readFileSync(path.resolve(xsdPath), 'utf-8');
        const xsdDoc = libxmljs.parseXml(xsdContent);
        const xmlDoc = libxmljs.parseXml(xmlString);

        const isValid = xmlDoc.validate(xsdDoc);
        if (!isValid) {
            general_logger.error('Validation error of the xml:', xmlDoc.validationErrors);
            return {
                isValid: false,
                errorType: "error",
                errorCode: "400",
                errorMessage: "XML validation failed",
                validationErrors: xmlDoc.validationErrors
            };
        }
        return { isValid: true };
    } catch (err) {
        general_logger.error("Error validating XML against XSD:", err.message);
        return {
            isValid: false,
            errorType: "error",
            errorCode: "500",
            errorMessage: "XML validation error",
            error: err.message
        };
    }
}

module.exports = {
    validateXml
};
