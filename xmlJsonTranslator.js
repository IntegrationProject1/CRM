const xml2js = require('xml2js');
// Converteert XML naar JSON met opties om arrays te vermijden voor enkele elementen
async function xmlToJson(xml, options = { explicitArray: false }) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, options, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}
// Converteert JSON naar XML met aanpasbare opties
function jsonToXml(json, options = {}) {
    const builder = new xml2js.Builder(options);
    return builder.buildObject(json);
}
// Configuratie voor veldmappings per objecttype
const mappings = {
    User: {
        salesforceToXml: (payload) => ({
            event: {
                type: 'user',
                user: {
                    id: payload.Id,
                    firstName: payload.FirstName,
                    lastName: payload.LastName,
                    email: payload.Email,
                    customUuid: payload.External_Id__c, // Custom UUID veld
                },
            },
        }),
        xmlToSalesforce: (json) => ({
            Id: json.updateUser.id,
            Email: json.updateUser.email,
            External_Id__c: json.updateUser.customUuid, // Custom UUID veld
        }),
    },
    Contact: {
        salesforceToXml: (payload) => ({
            event: {
                type: 'contact',
                contact: {
                    id: payload.Id,
                    firstName: payload.FirstName,
                    lastName: payload.LastName,
                    email: payload.Email,
                    customUuid: payload.External_Id__c,
                },
            },
        }),
        xmlToSalesforce: (json) => ({
            Id: json.updateContact.id,
            Email: json.updateContact.email,
            External_Id__c: json.updateContact.customUuid,
        }),
    },
    Account: {
        salesforceToXml: (payload) => ({
            event: {
                type: 'account',
                account: {
                    id: payload.Id,
                    name: payload.Name,
                    customUuid: payload.External_Id__c,
                },
            },
        }),
        xmlToSalesforce: (json) => ({
            Id: json.updateAccount.id,
            Name: json.updateAccount.name,
            External_Id__c: json.updateAccount.customUuid,
        }),
    },
};
// Transformeert een Salesforce CDC-event (JSON) naar XML voor RabbitMQ
function transformSalesforceToXml(objectType, cdcEvent) {
    if (!mappings[objectType]) throw new Error(`Geen mapping gevonden voor objecttype: ${objectType}`);
    const { changeType, payload } = cdcEvent;
    const action = changeType.toLowerCase();
    const xmlObj = mappings[objectType].salesforceToXml(payload);
    xmlObj.event.type = action; // Overschrijf type met de actie (create, update, etc.)
    return jsonToXml(xmlObj);
}
// Transformeert een RabbitMQ XML-bericht naar Salesforce JSON voor updates
async function transformXmlToSalesforce(objectType, xmlData) {
    if (!mappings[objectType]) throw new Error(`Geen mapping gevonden voor objecttype: ${objectType}`);
    const json = await xmlToJson(xmlData);
    return mappings[objectType].xmlToSalesforce(json);
}
module.exports = {
    xmlToJson,
    jsonToXml,
    transformSalesforceToXml,
    transformXmlToSalesforce,
};

//voorbeeld gebruikk
// const cdcEvent = { changeType: "CREATE", payload: { Id: "003...", FirstName: "Jan", LastName: "Jansen", Email: "jan@example.com", External_Id__c: "uuid-123" } };
// const xml = transformSalesforceToXml("Contact", cdcEvent);

// const xml = `<updateAccount><id>001...</id><name>Bedrijf X</name><customUuid>uuid-456</customUuid></updateAccount>`;
// const json = await transformXmlToSalesforce("Account", xml);