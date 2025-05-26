/**
 * Session Participant CDC Handler
 * @module SessionParticipantCDCHandler
 * @file cdc/SessionParticipantCDCHandler.js
 * @description Handles Salesforce Change Data Capture (CDC) messages for Session Participant objects and publishes updates to RabbitMQ.
 * @requires xmlJsonTranslator - A module for converting JSON to XML.
 * @requires validator - A module for validating XML against an XSD schema.
 * @requires session_logger - A logger for logging events in the SessionParticipantCDCHandler.
 * @requires sendMessage - A function to send messages to the RabbitMQ queue.
 */

const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const {session_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");

module.exports = async function SessionParticipantCDCHandler(message, sfClient, RMQChannel) {
    const { ChangeEventHeader, ...cdcObject } = message.payload;

    if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
        session_logger.debug("Salesforce API call detected, skipping action.");
        return;
    }

    session_logger.info('Captured Session Participant Object:', { header: ChangeEventHeader, changes: cdcObject });
    await sendMessage("info", "200", `Captured Session Participant Object: ${JSON.stringify({ header: ChangeEventHeader, changes: cdcObject })}`);
    const action = ChangeEventHeader.changeType;

    let recordId;
    let sessionUUID;
    let eventUUID;
    let sessionRecord;

    if (['CREATE', 'DELETE'].includes(action)) {
        recordId = ChangeEventHeader.recordIds?.[0];
        if (!recordId) {
            session_logger.error('No recordId found for action:', action);
            await sendMessage("error", "400", 'No recordId found for action: ' + action);
            return;
        }
    }

    if (action === 'UPDATE') {
        session_logger.warn("Update action not supported for Session_Participant__c.");
        await sendMessage("warn", "400", "Update action not supported for Session_Participant__c.");
        return;
    }

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
            session_logger.error("Error retrieving deleted participant session:", e.message);
            await sendMessage("error", "500", `Error retrieving deleted participant session: ${e.message}`);
            return;
        }
    }

    // Get sessionId from CDC data or deletion query
    const sessionId = cdcObject.Session__c || sessionIdQuery;
    if (!sessionId) {
        session_logger.error("No Session ID found in the CDC object for action " + action);
        await sendMessage("error", "400", "No Session ID found in the CDC object for action " + action);
        return;
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
                session_logger.error(`Missing UUIDs for Session (${sessionId})`);
                await sendMessage("error", "400", `Missing UUIDs for Session (${sessionId})`);
                return;
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
            session_logger.error("Error processing CREATE action:", e.message);
            await sendMessage("error", "500", `Error processing CREATE action: ${e.message}`);
            return;
        }
    } else if (action === 'UNDELETE') {
        try {
            sessionRecord = await sfClient.sObject('Session__c')
                .select('UUID__c, Event__r.UUID__c')
                .retrieve(cdcObject.Session__c);

            sessionUUID = sessionRecord.UUID__c;
            eventUUID = sessionRecord.Event__r?.UUID__c;

        } catch (e) {
            session_logger.error("Error retrieving session for UNDELETE:", e.message);
            await sendMessage("error", "500", `Error retrieving session for UNDELETE: ${e.message}`);
            return;
        }
    }

    if (!sessionUUID || !eventUUID) {
        session_logger.error("Missing critical UUIDs for processing");
        await sendMessage("error", "400", "Missing critical UUIDs for processing");
        return;
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
        const validationResult = validator.validateXml(xmlMessage, xsdPath);
        if (!validationResult.isValid) {
            throw new Error("XML validation failed");
        }
    } catch (e) {
        session_logger.error("XML validation error:", e.message);
        await sendMessage("error", "400", `XML validation error: ${e.message}`);
        return;
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
        session_logger.info(`Sent to ${exchangeName} (${routingKey})`);
        await sendMessage("info", "200", `Sent to ${exchangeName} (${routingKey})`);
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
            session_logger.error("❌ Failed to fetch participants:", error.message);
            await sendMessage("error", "500", `Failed to fetch participants: ${error.message}`);
            throw error;
        }
    }
};
