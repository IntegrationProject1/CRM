require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const hrtimeBase = process.hrtime.bigint();

function generateMicroDateTime() {
    const diffNs = process.hrtime.bigint() - hrtimeBase;
    const micros = Number((diffNs / 1000n) % 1000000n);
    const timestamp = Date.now() * 1000 + micros;
    const millis = Math.floor(timestamp / 1000);
    const now = new Date(millis);
    const micros2 = timestamp % 1000;
    return now.toISOString().replace('Z', micros2.toString().padStart(3, '0') + 'Z');
}

module.exports = async function SessionParticipateCDCHandler(message, sfClient, RMQChannel) {
    const { ChangeEventHeader, ...cdcObjectData } = message.payload;

    if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
        console.log("🚫 Salesforce API call gedetecteerd, actie overgeslagen.");
        return;
    }

    const action = ChangeEventHeader.changeType;
    console.log('\uD83D\uDCE5 Salesforce CDC SessionParticipate Event ontvangen:', action, cdcObjectData);

    let recordId;
    if (["CREATE", "UPDATE", "DELETE"].includes(action)) {
        recordId = ChangeEventHeader.recordIds?.[0];
        if (!recordId) return console.error('\u274C Geen recordId gevonden.');
    }

    let UUID;
    let JSONMsg;
    let xmlMessage;
    let xsdPath;

    try {
        switch (action) {
            case 'CREATE':
                UUID = generateMicroDateTime();
                await sfClient.updateSessionParticipation(recordId, { UUID__c: UUID });
                console.log("\u2705 UUID succesvol bijgewerkt:", UUID);

                JSONMsg = {
                    CreateSessionParticipate: {
                        UUID,
                        UserUUID: cdcObjectData.User__r?.UUID__c || "",
                        UserName: cdcObjectData.User__r?.Name || "",
                        SessionUUID: cdcObjectData.Session__r?.UUID__c || "",
                        SessionName: cdcObjectData.Session__r?.Name || ""
                    }
                };
                xsdPath = './xsd/sessionXSD/CreateSessionParticipate.xsd';
                break;

            case 'UPDATE':
                const updated = await sfClient.sObject('SessionParticipate__c').retrieve(recordId);
                if (!updated?.UUID__c) throw new Error(`Geen UUID voor session participation ${recordId}`);

                JSONMsg = {
                    UpdateSessionParticipate: {
                        UUID: updated.UUID__c,
                        FieldsToUpdate: {
                            Field: Object.entries(cdcObjectData).map(([key, value]) => ({
                                Name: key,
                                NewValue: String(value)
                            }))
                        }
                    }
                };
                xsdPath = './xsd/sessionXSD/UpdateSessionParticipate.xsd';
                break;

            case 'DELETE':
                const resultDel = await sfClient.sObject('SessionParticipate__c')
                    .select('UUID__c')
                    .where({ Id: recordId, IsDeleted: true })
                    .limit(1)
                    .scanAll(true)
                    .run();

                const deleted = resultDel[0];
                if (!deleted?.UUID__c) throw new Error(`Geen UUID bij DELETE van ${recordId}`);

                JSONMsg = {
                    DeleteSessionParticipate: {
                        UUID: deleted.UUID__c
                    }
                };
                xsdPath = './xsd/sessionXSD/DeleteSessionParticipate.xsd';
                break;

            default:
                console.warn("⚠️ Niet ondersteunde actie:", action);
                return;
        }

        xmlMessage = jsonToXml(Object.values(JSONMsg)[0], { rootName: Object.keys(JSONMsg)[0] });
        if (!validator.validateXml(xmlMessage, xsdPath)) throw new Error(`XML validatie gefaald voor ${action}`);

        const exchangeName = 'session'; // zelfde als bij Session
        await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });
        const routingKeys = [
            `frontend.sessionparticipate.${action.toLowerCase()}`,
            `facturatie.sessionparticipate.${action.toLowerCase()}`,
            `kassa.sessionparticipate.${action.toLowerCase()}`
        ];

        for (const routingKey of routingKeys) {
            RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
            console.log(`\uD83D\uDCE4 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
        }

    } catch (error) {
        console.error(`\u274C Fout bij ${action}:`, error.message);
    }
};
