/**
 * Traslator module for XML and JSON formats.
 * @module xmlJsonTranslator
 * @file utils/xmlJsonTranslator.js
 * @description Provides functions to convert XML to JSON and vice versa.
 * @requires xml2js - A library for parsing XML and building XML from JSON.
 */

const xml2js = require('xml2js');

/**
 * Converts XML to JSON.
 * @param {string} xml - The XML string to convert.
 * @param {Object} [options={ explicitArray: false }] - xml2js options, e.g., array handling.
 * @returns {Promise<Object>} JSON representation of the XML.
 * @example
 * const xml = '<user><id>123</id></user>';
 * xmlToJson(xml).then(json => console.log(json));
 */

async function xmlToJson(xml, options = { explicitArray: false }) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, options, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}
/**
 * Converts JSON to XML.
 * @param {Object} json - The JSON object to convert.
 * @param {Object} [options={}] - xml2js.Builder options, e.g., XML formatting.
 * @returns {string} XML string generated from JSON.
 * @example
 * const json = { user: { id: '123' } };
 * const xml = jsonToXml(json);
 */

function jsonToXml(json, options = {}) {
    const builder = new xml2js.Builder(options);
    return builder.buildObject(json);
}
module.exports = {
    xmlToJson,
    jsonToXml,
};
