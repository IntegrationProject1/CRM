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

    // Verbeterde API call detectie
    if (ChangeEventHeader.changeOrigin.includes("com/salesforce/api/rest")) {
        console.log("🚫 Salesforce REST API call detected, skipping action.");
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
                // Update session met UUID
                await sfClient.sObject('Session__c')
                    .update({ Id: recordId, UUID__c: UUID });
                console.log("✅ Session UUID updated:", UUID);

                // Haal Event UUID op
                const eventResult = await sfClient.sObject("Event__c")
                    .select("UUID__c")
                    .where({ Id: cdcObject.Event__c })
                    .limit(1)
                    .run();
                const eventUUID = eventResult[0]?.UUID__c || "";

                // Haal gastspreker email op
                const guestSpeakerResult = await sfClient.sObject("Contact")
                    .select("Email")
                    .where({ Id: cdcObject.GuestSpeaker__c })
                    .limit(1)
                    .run();
                const guestSpeakerEmail = guestSpeakerResult[0]?.Email || "";

                // Haal deelnemers op
                const participants = await Promise.all(
                    (cdcObject.Session_Participant__c?.split(';') || []).map(async id => {
                        const userResult = await sfClient.sObject("User")
                            .select("Email")
                            .where({ Id: id.trim() })
                            .limit(1)
                            .run();
                        return { email: userResult[0]?.Email || "" };
                    })
                );

                JSONMsg = {
                    CreateSession: {
                        SessionUUID: UUID,
                        EventUUID: eventUUID,
                        SessionName: cdcObject.Name,
                        SessionDescription: cdcObject.Description__c,
                        GuestSpeakers: {
                            GuestSpeaker: [{
                                email: guestSpeakerEmail
                            }]
                        },
                        Capacity: cdcObject.Capacity__c,
                        StartDateTime: cdcObject.StartDateTime__c, // ✅ juiste volgorde
                        EndDateTime: cdcObject.EndDateTime__c,
                        SessionLocation: cdcObject.Location__c,
                        SessionType: cdcObject.SessionType__c,
                        RegisteredUsers: {
                            User: participants
                        }
                    }
                };
                xsdPath = './xsd/sessionXSD/CreateSession.xsd';
                break;

            case 'UPDATE':
                const updatedSession = await sfClient.sObject('Session__c')
                    .retrieve(recordId);

                // Haal Event UUID op
                const eventUUIDUpdate = updatedSession.Event__c
                    ? (await sfClient.sObject("Event__c")
                    .select("UUID__c")
                    .where({ Id: updatedSession.Event__c })
                    .limit(1)
                    .run())[0]?.UUID__c || ""
                    : "";

                // Haal GuestSpeaker email op
                const speakerEmailUpdate = updatedSession.GuestSpeaker__c
                    ? (await sfClient.sObject("Contact")
                    .select("Email")
                    .where({ Id: updatedSession.GuestSpeaker__c })
                    .limit(1)
                    .run())[0]?.Email || ""
                    : "";

            function convertToIsoZ(datetime) {
                if (!datetime) return "";
                const date = new Date(datetime);
                return date.toISOString();
            }


                JSONMsg = {
                    UpdateSession: {
                        SessionUUID: updatedSession.UUID__c,
                        EventUUID: eventUUIDUpdate,
                        SessionName: cdcObject.Name || updatedSession.Name || "",
                        SessionDescription: cdcObject.Description__c || updatedSession.Description__c || "",
                        GuestSpeakers: {
                            GuestSpeaker: [
                                { email: speakerEmailUpdate }
                            ]
                        },
                        Capacity: cdcObject.Capacity__c || updatedSession.Capacity__c || 0,
                        StartDateTime: convertToIsoZ(cdcObject.StartDateTime__c || updatedSession.StartDateTime__c),
                        EndDateTime: convertToIsoZ(cdcObject.EndDateTime__c || updatedSession.EndDateTime__c),
                        SessionLocation: cdcObject.Location__c || updatedSession.Location__c || "",
                        SessionType: cdcObject.SessionType__c || updatedSession.SessionType__c || "",
                        RegisteredUsers: {
                            User: [ { email: "placeholder@example.com" } ]
                        }
                    }
                };
                xsdPath = './xsd/sessionXSD/UpdateSession.xsd';
                break;


            case 'DELETE':
                const deletedSessionResult = await sfClient.sObject('Session__c')
                    .select("UUID__c")
                    .where({ Id: recordId })
                    .limit(1)
                    .scanAll(true) // belangrijk bij delete!
                    .run();

                const deletedUUID = deletedSessionResult[0]?.UUID__c;

                if (!deletedUUID) {
                    throw new Error("Session UUID niet gevonden");
                }

                JSONMsg = {
                    DeleteSession: {
                        ActionType: action,
                        SessionUUID: deletedUUID,
                        TimeOfAction: new Date().toISOString()
                    }
                };
                xsdPath = './xsd/sessionXSD/DeleteSession.xsd';
                break;


            default:
                console.warn("⚠️ Unhandled action:", action);
                return;
        }

        // Verwijder lege velden
        JSONMsg = JSON.parse(JSON.stringify(JSONMsg, (k, v) => v ?? undefined));

        xmlMessage = jsonToXml(JSONMsg);
        if (!validator.validateXml(xmlMessage, xsdPath)) {
            throw new Error(`XML validatie mislukt voor ${action}`);
        }

        const exchangeName = 'session';
        await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

        const routingKeys = [
            `planning.session.${action.toLowerCase()}`
            // `kassa.session.${action.toLowerCase()}`,
            // `frontend.session.${action.toLowerCase()}`
        ];

        for (const routingKey of routingKeys) {
            RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
            console.log(`📤 Bericht verstuurd naar ${exchangeName} (${routingKey})`);
        }

    } catch (error) {
        console.error(`❌ Fout tijdens ${action} actie:`, error.message);
        if (error.response?.body) {
            console.error('Salesforce foutdetails:', error.response.body);
        }
    }
};