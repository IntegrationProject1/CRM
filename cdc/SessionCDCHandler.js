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
    const { ChangeEventHeader, ...cdcObject } = message.payload;

    if (ChangeEventHeader.changeOrigin.includes("com/salesforce/api/rest")) {
        console.log("🚫 Salesforce API call detected, skipping action.");
        return;
    }

    console.log("Captured Session Object: ", { header: ChangeEventHeader, changes: cdcObject });

    const action = ChangeEventHeader.changeType;
    const recordId = ChangeEventHeader.recordIds?.[0];
    if (!recordId && ['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
        return console.error('❌ No recordId found.');
    }

    let UUID, JSONMsg, xmlMessage, xsdPath;

    try {
        switch (action) {
            case 'CREATE':
                UUID = generateMicroDateTime();
                await sfClient.sObject('Session__c')
                    .update({ Id: recordId, UUID__c: UUID });
                console.log("✅ Session UUID updated:", UUID);

                JSONMsg = {
                    CreateSession: {
                        SessionUUID: UUID,
                        SessionName: cdcObject.Name,
                        Description: cdcObject.Description__c,
                        StartDateTime: cdcObject.SessionStart__c,
                        EndDateTime: cdcObject.SessionEnd__c,
                        Location: cdcObject.Location__c,
                        Instructor: cdcObject.Instructor__c,
                        Capacity: cdcObject.Capacity__c,
                        Status: cdcObject.Status__c,
                        RelatedEventUUID: cdcObject.Event__c,
                        RegisteredUsers: {
                            User: []
                        }
                    }
                };
                xsdPath = './xsd/sessionsXSD/CreateSession.xsd';
                break;

            case 'UPDATE':
                const updatedSession = await sfClient.sObject('Session__c')
                    .retrieve(recordId);

                JSONMsg = {
                    UpdateSession: {
                        SessionUUID: updatedSession.UUID__c,
                        ...(cdcObject.Name && { SessionName: cdcObject.Name }),
                        ...(cdcObject.Description__c && { Description: cdcObject.Description__c }),
                        ...(cdcObject.SessionStart__c && { StartDateTime: cdcObject.SessionStart__c }),
                        ...(cdcObject.SessionEnd__c && { EndDateTime: cdcObject.SessionEnd__c }),
                        ...(cdcObject.Location__c && { Location: cdcObject.Location__c }),
                        ...(cdcObject.Instructor__c && { Instructor: cdcObject.Instructor__c }),
                        ...(cdcObject.Capacity__c && { Capacity: cdcObject.Capacity__c }),
                        ...(cdcObject.Status__c && { Status: cdcObject.Status__c })
                    }
                };
                xsdPath = './xsd/sessionsXSD/UpdateSession.xsd';
                break;

            case 'DELETE':
                const deletedSession = await sfClient.sObject('Session__c')
                    .select('UUID__c')
                    .where({ Id: recordId, IsDeleted: true })
                    .first();

                JSONMsg = {
                    DeleteSession: {
                        ActionType: action,
                        SessionUUID: deletedSession.UUID__c,
                        TimeOfAction: new Date().toISOString()
                    }
                };
                xsdPath = './xsd/sessionsXSD/DeleteSession.xsd';
                break;

            default:
                console.warn("⚠️ Unhandled action:", action);
                return;
        }

        // Clean null values
        JSONMsg = JSON.parse(JSON.stringify(JSONMsg));

        xmlMessage = jsonToXml(JSONMsg);
        if (!validator.validateXml(xmlMessage, xsdPath)) {
            throw new Error(`XML validation failed for ${action}`);
        }

        const exchangeName = 'session';
        await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

        const routingKeys = [
            // `frontend.session.${action.toLowerCase()}`,
            // `kassa.session.${action.toLowerCase()}`,
            `planning.session.${action.toLowerCase()}`
        ];

        for (const routingKey of routingKeys) {
            RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
            console.log(`📤 Session message routed to ${exchangeName} (${routingKey})`);
        }

    } catch (error) {
        console.error(`❌ Session ${action} error:`, error.message);
        if (error.response?.body) {
            console.error('Salesforce error details:', error.response.body);
        }
    }
};