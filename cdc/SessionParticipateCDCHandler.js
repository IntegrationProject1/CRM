const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");

module.exports = async function SessionParticipantCDCHandler(message, sfClient, RMQChannel) {
    const { ChangeEventHeader, ...cdcObject } = message.payload;

    if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
        console.log("🚫 Salesforce API call detected, skipping action.");
        return;
    }

    console.log("Captured Session Participant Object:", { header: ChangeEventHeader, changes: cdcObject });
    const action = ChangeEventHeader.changeType;

    let recordId;
    let sessionUUID;
    let eventUUID;
    let sessionRecord;

    if (['CREATE', 'DELETE'].includes(action)) {
        recordId = ChangeEventHeader.recordIds?.[0];
        if (!recordId) return console.error('❌ No recordId found.');
    }

    if (action === 'UPDATE') return console.warn("❌ Update action not supported for Session_Participant__c.");

    let sessionIdQuery;

    // Query sessionId in case of deletion
    if (action === 'DELETE') {
        try {
            const query = await sfClient.sObject('Session_Participant__c')
                .select('Session__c, Session_UUID__c')
                .where({ Id: recordId, IsDeleted: true })
                .limit(1)
                .scanAll(true)
                .run();

            sessionIdQuery = query[0]?.Session__c;
            sessionUUID = query[0]?.Session_UUID__c;

            // Retrieve Session details to get Event UUID
            sessionRecord = await sfClient.sObject('Session__c')
                .select('Event__r.UUID__c')
                .retrieve(sessionIdQuery);

            eventUUID = sessionRecord.Event__r?.UUID__c;
            if (!eventUUID) {
                throw new Error("No associated Event UUID found");
            }

        } catch (e) {
            return console.error("❌ Error retrieving deleted participant session:", e.message);
        }
    }

    // Get sessionId from CDC data or deletion query
    const sessionId = cdcObject.Session__c || sessionIdQuery;
    if (!sessionId) {
        return console.error("❌ No Session ID found for action " + action);
    }

    // Handle CREATE/UNDELETE actions
    if (action === 'CREATE') {
        try {
            sessionRecord = await sfClient.sObject('Session__c')
                .select('UUID__c, Event__r.UUID__c')
                .retrieve(sessionId);

            sessionUUID = sessionRecord.UUID__c;
            eventUUID = sessionRecord.Event__r?.UUID__c;

            if (!sessionUUID || !eventUUID) {
                return console.error(`❌ Missing UUIDs for Session (${sessionId})`);
            }

            // Retrieve Contact email
            const contactRecord = await sfClient.sObject('Contact')
                .retrieve(cdcObject.Contact__c);

            if (!contactRecord.Email) {
                throw new Error("Contact has no email");
            }

            // Update participant with UUIDs and email
            await sfClient.sObject("Session_Participant__c")
                .update({
                    Id: recordId,
                    Session_UUID__c: sessionUUID,
                    ParticipantEmail__c: contactRecord.Email,
                    Name: contactRecord.LastName || "-"
                });

        } catch (e) {
            return console.error("❌ Error processing CREATE:", e.message);
        }
    } else if (action === 'UNDELETE') {
        try {
            sessionRecord = await sfClient.sObject('Session__c')
                .select('UUID__c, Event__r.UUID__c')
                .retrieve(cdcObject.Session__c);

            sessionUUID = sessionRecord.UUID__c;
            eventUUID = sessionRecord.Event__r?.UUID__c;

        } catch (e) {
            return console.error("❌ Error retrieving session for UNDELETE");
        }
    }

    if (!sessionUUID || !eventUUID) {
        return console.error("❌ Missing critical UUIDs for processing");
    }

    // Build JSON message
    const jsonParticipants = await getSessionParticipants(sessionId);
    const JSONMsg = {
        UpdateSession: {
            SessionUUID: sessionUUID,
            EventUUID: eventUUID,
            RegisteredUsers: {
                User: jsonParticipants.map(p => ({ email: p.User.email }))
            }
        }
    };

    // Validate and send XML
    const xmlMessage = jsonToXml(JSONMsg);
    const xsdPath = './xsd/eventsXSD/UpdateSession.xsd'; // Adjusted XSD

    try {
        if (!validator.validateXml(xmlMessage, xsdPath)) {
            throw new Error("XML validation failed");
        }
    } catch (e) {
        return console.error("❌ XML validation error:", e.message);
    }

    // Publish to RabbitMQ
    const exchangeName = 'event';
    await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

    const routingKeys = [
        `frontend.event.update`,
        `kassa.event.update`,
        `planning.event.update`
    ];

    for (const routingKey of routingKeys) {
        RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
        console.log(`📤 Sent to ${exchangeName} (${routingKey})`);
    }

    async function getSessionParticipants(sessionId) {
        try {
            const participants = await sfClient.sObject('Session_Participant__c')
                .select('ParticipantEmail__c')
                .where({ Session__c: sessionId })
                .run();

            return participants.map(p => ({
                User: { email: p.ParticipantEmail__c }
            }));

        } catch (error) {
            console.error("❌ Failed to fetch participants:", error);
            throw error;
        }
    }
};