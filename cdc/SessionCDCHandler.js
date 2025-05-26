/**
 * Session CDC Handler
 * @module SessionCDCHandler
 * @file cdc/SessionCDCHandler.js
 * @description Handles Salesforce Change Data Capture (CDC) messages for Session objects and publishes updates to RabbitMQ.
 * @requires dotenv - Loads environment variables from a `.env` file.
 * @requires jsonToXml - A utility for converting JSON objects to XML format.
 * @requires validator - A module for validating XML against an XSD schema.
 * @requires session_logger - A logger for logging events in the SessionCDCHandler.
 * @requires sendMessage - A function to send messages to the RabbitMQ queue.
 * @requires hrtimeBase - A base time for generating microsecond precision timestamps.
 */

require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const {session_logger} = require("../utils/logger");
const {sendMessage} = require("../publisher/logger");
const hrtimeBase = process.hrtime.bigint();

/**
 * Generates the current ISO 8601 timestamp with microsecond precision.
 * @returns {string} - The generated timestamp.
 * @example
 * const timestamp = generateMicroDateTime();
 * console.log(timestamp); // "2023-10-05T12:34:56.789123Z"
 */
function generateMicroDateTime() {
    const diffNs = process.hrtime.bigint() - hrtimeBase;
    const micros = Number((diffNs / 1000n) % 1000000n);
    const timestamp = Date.now() * 1000 + micros;
    const millis = Math.floor(timestamp / 1000);
    const now = new Date(millis);
    const micros2 = timestamp % 1000;
    return now.toISOString().replace('Z', micros2.toString().padStart(3, '0') + 'Z');
}
/**
 * Processes Salesforce CDC messages for Session objects and publishes updates to RabbitMQ.
 * @param {Object} message - The Salesforce CDC message.
 * @param {Object} sfClient - The Salesforce client for interacting with Salesforce.
 * @param {Object} RMQChannel - The RabbitMQ channel for publishing messages.
 * @returns {Promise<void>} - A promise that resolves when the message is processed.
 * @example
 * SessionCDCHandler(message, sfClient, RMQChannel)
 *  .then(() => console.log("Session processed successfully"))
 *  .catch(err => console.error("Error processing session:", err));
 */
module.exports = async function SessionCDCHandler(message, sfClient, RMQChannel) {
    const { ChangeEventHeader, ...cdcObject } = message.payload;

    // Verbeterde API call detectie
    if (ChangeEventHeader.changeOrigin.includes("com/salesforce/api/rest")) {
        session_logger.debug("Salesforce REST API call detected, skipping action.");
        return;
    }

    console.log("Captured Session Object: ", { header: ChangeEventHeader, changes: cdcObject });
    session_logger.info("Captured Session Object: ", { header: ChangeEventHeader, changes: cdcObject });
    await sendMessage("INFO","200", `Captured Session Object ${JSON.stringify({header: ChangeEventHeader, changes: cdcObject})}` );

    const action = ChangeEventHeader.changeType;
    const recordId = ChangeEventHeader.recordIds?.[0];
    if (!recordId && ['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
        session_logger.error('No recordId found for action:', action);
        await sendMessage("error","400", 'No recordId found for action: ' + action);
        return;
    }

    let UUID, JSONMsg, xmlMessage, xsdPath;

    try {
        switch (action) {
            case 'CREATE':
                UUID = generateMicroDateTime();
                // Update session met UUID
                await sfClient.sObject('Session__c')
                    .update({ Id: recordId, UUID__c: UUID });
                session_logger.info("Session UUID updated:", UUID);
                await sendMessage("INFO","200", "Session UUID updated" );

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
                session_logger.warn("Unhandled action:", action);
                await sendMessage("warn","400", "Unhandled action: " + action);
                return;
        }

        // Verwijder lege velden
        JSONMsg = JSON.parse(JSON.stringify(JSONMsg, (k, v) => v ?? undefined));

        xmlMessage = jsonToXml(JSONMsg);
        const validationResult = validator.validateXml(xmlMessage, xsdPath);
        if (!validationResult.isValid) {
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
            session_logger.info(`message send to ${exchangeName} (${routingKey})`);
            await sendMessage("INFO","200", `Message sent to ${exchangeName} (${routingKey})`);
        }

    } catch (error) {
        session_logger.error(`Error during ${action} action:`, error.message);
        await sendMessage("error","500", `Error during ${action} action: ${error.message}`);
        if (error.response?.body) {
            session_logger.error('Salesforce error details:', error.response.body);
            await sendMessage("error","500", `Salesforce error details: ${JSON.stringify(error.response.body)}`);
        }
    }
};
