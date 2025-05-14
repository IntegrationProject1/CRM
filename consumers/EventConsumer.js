/**
 * @module EventConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het aanmaken, bijwerken en verwijderen van events in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");

/**
 * Start de EventConsumer om berichten van RabbitMQ-queues te verwerken.
 * @param {Object} channel - Het RabbitMQ-kanaal voor het consumeren van berichten.
 * @param {Object} salesforceClient - De Salesforce-client voor interactie met Salesforce.
 * @returns {Promise<void>} - Een belofte die wordt vervuld wanneer de consumer is gestart.
 */
module.exports = async function StartEventConsumer(channel, salesforceClient) {

    const queues = ["create", "update", "delete"];

    for (const action of queues) {
        await channel.assertQueue(`crm_event_${action}`, {durable: true});

        await channel.consume(`crm_event_${action}`, async (msg) => {
            if (!msg) return;

            const content = msg.content.toString();
            console.log(`📥 [${action}EventConsumer] Ontvangen`);

            // convert XML to JSON
            let jsonConv;
            try {
                jsonConv = await xmlJsonTranslator.xmlToJson(content);
            } catch (e) {
                channel.nack(msg, false, false);
                console.error('❌ Ongeldig XML formaat:', content);
                return;
            }

            if (!jsonConv.CreateEvent) {
                channel.nack(msg, false, false);
                console.error("❌ Ongeldig formaat:", jsonConv);
                return;
            }
            const objectData = jsonConv.CreateEvent;

            let SalesforceObjId;
            if (['update', 'delete'].includes(action)) {
                // retrieve Salesforce ID from UUID
                const query = salesforceClient.sObject("Event__c")
                    .select("Id")
                    .where({ UUID__c: objectData.UUID })
                    .limit(1);

                let result;
                try {
                    result = await query.run();
                } catch (err) {
                    channel.nack(msg, false, false);
                    console.error("❌ Fout bij ophalen Salesforce Event ID:", err.message);
                    return;
                }

                if (!result || result.length === 0) {
                    channel.nack(msg, false, false);
                    console.error("❌ Geen Salesforce Event ID gevonden voor UUID:", objectData.UUID);
                    return;
                }
                SalesforceObjId = result[0].Id;
            }

            if (!objectData.UUID) {
                channel.nack(msg, false, false);
                console.error("❌ UUID ontbreekt in het bericht");
                return;
            }

            let JSONMsg;

            switch (action) {
                case "create":
                    try {
                        JSONMsg = {
                            "UUID__c": objectData.UUID,
                            "Name": objectData.Name || "",
                            "Description__c": objectData.Description || "",
                            "StartDateTime__c": objectData.StartDateTime || "",
                            "EndDateTime__c": objectData.EndDateTime || "",
                            "Location__c": objectData.Location || "",
                            "Organiser__c": objectData.Organiser || "",
                            "Capacity__c": objectData.Capacity || 0,
                            "EventType__c": objectData.EventType || "",
                            // Add registered users logic if needed
                        };

                        await salesforceClient.createEvent(JSONMsg);
                        console.log("✅ Event aangemaakt in Salesforce");
                    } catch (err) {
                        channel.nack(msg, false, false);
                        console.error("❌ Fout bij create:", err.message);
                        return;
                    }
                    break;

                case "update":
                    try {
                        JSONMsg = {
                            "Name": objectData.Name || "",
                            "Description__c": objectData.Description || "",
                            "StartDateTime__c": objectData.StartDateTime || "",
                            "EndDateTime__c": objectData.EndDateTime || "",
                            "Location__c": objectData.Location || "",
                            "Organiser__c": objectData.Organiser || "",
                            "Capacity__c": objectData.Capacity || 0,
                            "EventType__c": objectData.EventType || "",
                        };

                        await salesforceClient.updateEvent(SalesforceObjId, JSONMsg);
                        console.log("✅ Event geüpdatet in Salesforce");
                    } catch (err) {
                        channel.nack(msg, false, false);
                        console.error("❌ Fout bij update:", err.message);
                        return;
                    }
                    break;

                case "delete":
                    try {
                        await salesforceClient.deleteEvent(SalesforceObjId);
                        console.log("✅ Event verwijderd uit Salesforce");
                    } catch (err) {
                        channel.nack(msg, false, false);
                        console.error("❌ Fout bij delete:", err.message);
                        return;
                    }
                    break;

                default:
                    channel.nack(msg, false, false);
                    console.error(`❌ Ongeldige queue: ${action}`);
                    return;
            }

            await channel.ack(msg);
        });

        console.log(`🔔 Listening for messages on queue "crm_event_${action}"…`);
    }
};
