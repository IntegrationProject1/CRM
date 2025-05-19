/**
 * @module AddressTranslator
 *
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
        Street: parts[4],
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
    const regex = /^(.+?)\s(\d+)(?:\s([a-zA-Z]+))?$/;
    const match = address.match(regex);

    if (!match) {
        throw new Error("Invalid address format");
    }

    return {
        street: match[1],
        houseNumber: match[2],
        busCode: match[3] || null
    };
}

// Example usage
// const address = 'belguim;flanders;3000;leuven;straat;1;b;';
// const json = {
//     State: 'province',
//     Street: 'straat a 20 b',
//     PostalCode: '3000',
//     Country: 'belguim',
//     City: 'leuven'
// };
//
// const newAddress = addressToJson(address);
// console.log("newAddress:", newAddress);
//
// const newJson = jsonToAddress(json);
// console.log("newJson:", newJson);

module.exports = {
    addressToJson,
    jsonToAddress
};