const libxmljs = require('libxmljs2');
const fs = require('fs');
const path = require('path');

// Valideer XML-string tegen een XSD-bestand
function validateXml(xmlString, xsdPath) {
    try {
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
// moet gebruiken
// npm install libxmljs2 dus that it