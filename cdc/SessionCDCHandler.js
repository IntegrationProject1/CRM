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

module.exports = async function SessionCDCHandler(message, sfClient, RMQChannel) {
    const { ChangeEventHeader, ...cdcObjectData } = message.payload;

    if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
        console.log("🚫 Salesforce API call gedetecteerd, actie overgeslagen.");
        return;
    }

    const action = ChangeEventHeader.changeType;
    console.log('📥 Salesforce CDC Session Event ontvangen:', action, cdcObjectData);

    let recordId;
    if (["CREATE", "UPDATE", "DELETE"].includes(action)) {
        recordId = ChangeEventHeader.recordIds?.[0];
        if (!recordId) return console.error('❌ Geen recordId gevonden.');
    }

    let UUID;
    let JSONMsg;
    let xmlMessage;
    let xsdPath;

    try {
        switch (action) {
            case 'CREATE':
                UUID = generateMicroDateTime();
                await sfClient.updateSession(recordId, { UUID__c: UUID });
                console.log("✅ UUID succesvol bijgewerkt:", UUID);

                JSONMsg = {
                    CreateSession: {
                        UUID,
                        EventName: cdcObjectData.Event__r?.Name || "",
                        SessionName: cdcObjectData.Name || "",
                        Description: cdcObjectData.Description__c || "",
                        GuestSpeakers: cdcObjectData.GuestSpeakers__c
                            ? {
                                GuestSpeaker: cdcObjectData.GuestSpeakers__c.map(g => ({
                                    Name: g.Name,
                                    UUID: g.UUID
                                }))
                            }
                            : undefined,
                        Capacity: cdcObjectData.Capacity__c || 0,
                        StartDateTime: cdcObjectData.StartDateTime__c || new Date().toISOString(),
                        EndDateTime: cdcObjectData.EndDateTime__c || new Date().toISOString(),
                        Location: cdcObjectData.Location__c || "",
                        SessionType: cdcObjectData.Type__c || "",
                        RegisteredUsers: cdcObjectData.RegisteredUsers__c
                            ? {
                                User: cdcObjectData.RegisteredUsers__c.map(u => ({
                                    UUID: u.UUID,
                                    Name: u.Name
                                }))
                            }
                            : undefined
                    }
                };
                xsdPath = './xsd/sessionXSD/CreateSession.xsd';
                break;

            case 'UPDATE':
                const updatedSession = await sfClient.sObject('Session__c').retrieve(recordId);
                if (!updatedSession?.UUID__c) throw new Error(`Geen UUID voor session ${recordId}`);

                JSONMsg = {
                    UpdateSession: {
                        UUID: updatedSession.UUID__c,
                        FieldsToUpdate: {
                            Field: Object.entries(cdcObjectData)
                                .filter(([_, val]) => ['string', 'number', 'boolean'].includes(typeof val))
                                .map(([key, value]) => ({
                                    Name: key,
                                    NewValue: String(value)
                                }))
                        }
                    }
                };
                xsdPath = './xsd/sessionXSD/UpdateSession.xsd';
                break;

            case 'DELETE':
                const resultDel = await sfClient.sObject('Session__c')
                    .select('UUID__c')
                    .where({ Id: recordId, IsDeleted: true })
                    .limit(1)
                    .scanAll(true)
                    .run();

                const deletedSession = resultDel[0];
                if (!deletedSession?.UUID__c) throw new Error(`Geen UUID bij DELETE van ${recordId}`);

                JSONMsg = {
                    DeleteSession: {
                        UUID: deletedSession.UUID__c
                    }
                };
                xsdPath = './xsd/sessionXSD/DeleteSession.xsd';
                break;

            default:
                console.warn("⚠️ Niet ondersteunde actie:", action);
                return;
        }

        xmlMessage = jsonToXml(Object.values(JSONMsg)[0], { rootName: Object.keys(JSONMsg)[0] });
        if (!validator.validateXml(xmlMessage, xsdPath)) throw new Error(`XML validatie gefaald voor ${action}`);

        const exchangeName = 'session';
        await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });
        const routingKeys = [
            `frontend.session.${action.toLowerCase()}`,
            `facturatie.session.${action.toLowerCase()}`,
            `kassa.session.${action.toLowerCase()}`
        ];

        for (const routingKey of routingKeys) {
            RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
            console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
        }

    } catch (error) {
        console.error(`❌ Fout bij ${action}:`, error.message);
    }
};
