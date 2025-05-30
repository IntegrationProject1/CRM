/**
 * translates address strings to JSON objects and vice versa.
 * @module AddressTranslator
 * @file utils/addressTranslator.js
 * @description Provides functions to convert address strings to JSON objects and vice versa.
 */

/**
 * Converts an address string to a JSON object.
 * @param {string} address - The address string in the format: "country;state;postalCode;city;street;houseNumber;busCode;".
 * @returns {{State: string, Street: string, PostalCode: string, Country: string, City: string}} A JSON object representing the address.
 * @example
 * const address = 'belguim;flanders;3000;leuven;straat;1;b;';
 * const json = addressToJson(address);
 */
function addressToJson(address) {
    const parts = address.slice(0, -1).split(';');
    return {
        State: parts[1],
        Street: parts[4] + ' ' + (parts[5] || '') + (parts[6] ? ' ' + parts[6] : ''),
        PostalCode: parts[2],
        Country: parts[0],
        City: parts[3]
    };
}

/**
 * Converts a JSON object to an address string.
 * @param {{State: string, Street: string, PostalCode: string, Country: string, City: string}} data - The JSON object representing the address.
 * @returns {string} The address string in the format: "country;state;postalCode;city;street;houseNumber;busCode;".
 * @example
 * const json = {
 *    State: 'province',
 *    Street: 'straat a 20 b',
 *    PostalCode: '3000',
 *    Country: 'belguim',
 *    City: 'leuven'
 *    };
 *  const address = jsonToAddress(json);
 */
function jsonToAddress(data) {
    const { street, houseNumber, busCode } = parseStreet(data.Street);
    return `${data.Country};${data.State};${data.PostalCode};${data.City};${street};${houseNumber};${busCode || ''};`;
}

/**
 * Parses a street address into its components.
 * @param {string} address - The street address in the format: "streetName houseNumber [busCode]".
 * @returns {{street: string, houseNumber: string, busCode: string|null}} An object containing the street name, house number, and optional bus code.
 * @throws {Error} If the address format is invalid.
 * @example
 * const address = 'straat a 20 b';
 * const parsed = parseStreet(address);
 */
function parseStreet(address) {
    if (!address) return { street: '', houseNumber: '', busCode: null };

    // Verbeterde regex voor straat, huisnummer en buscode
    const regex = /^\s*([^0-9]+?)\s*(\d+)?\s*([a-zA-Z]*)?\s*$/;
    const match = address.match(regex);

    return {
        street: (match?.[1] || '').trim(),
        houseNumber: (match?.[2] || '').trim(),
        busCode: (match?.[3] || '').trim() || null
    };
}

module.exports = {
    addressToJson,
    jsonToAddress
};