/**
 * @module SessionParticipateConsumer
 * @description Beheert de verwerking van berichten uit RabbitMQ-queues voor het registreren en deregistreren van gebruikers bij sessies in Salesforce.
 */

const xmlJsonTranslator = require("../utils/xmlJsonTranslator");

/**
 * Start de SessionParticipateConsumer om berichten van RabbitMQ-queues te verwerken.
 * @param {Object} channel - Het RabbitMQ-kanaal voor het consumeren van berichten.
 * @param {Object} salesforceClient - De Salesforce-client voor interactie met Salesforce.
 * @returns {Promise<void>} - Een belofte die wordt vervuld wanneer de consumer is gestart.
 */
module.exports = async function StartSessionParticipateConsumer(channel, salesforceClient) {

    const queues = ["participate", "leave"];

    for (const action of queues) {
        await channel.assertQueue(`crm_session_${action}`, { durable: true });

        await channel.consume(`crm_session_${action}`, async (msg) => {
            if (!msg) return;

            const content = msg.content.toString();
            console.log(`📥 [${action}SessionParticipateConsumer] Ontvangen`);

            // convert XML to JSON
            let jsonConv;
            try {
                jsonConv = await xmlJsonTranslator.xmlToJson(content);
            } catch (e) {
                channel.nack(msg, false, false);
                console.error('❌ Ongeldig XML formaat:', content);
                return;
            }

            if (!jsonConv.ParticipationMessage) {
                channel.nack(msg, false, false);
                console.error("❌ Ongeldig formaat:", jsonConv);
                return;
            }

            const objectData = jsonConv.ParticipationMessage;

            if (!objectData.UUID || !objectData.UserUUID) {
                channel.nack(msg, false, false);
                console.error("❌ UUID of UserUUID ontbreekt in het bericht");
                return;
            }

            let JSONMsg;

            switch (action) {
                case "participate":
                    try {
                        JSONMsg = {
                            // Pas aan naar juiste custom object & veldnamen in Salesforce ⬇️ // CMD
                            "SessionUUID__c": objectData.UUID,
                            "UserUUID__c": objectData.UserUUID,
                            "UserName__c": objectData.UserName || ""
                        };

                        await salesforceClient.createSessionParticipation(JSONMsg); // CMD
                        console.log("✅ Deelname geregistreerd in Salesforce");
                    } catch (err) {
                        channel.nack(msg, false, false);
                        console.error("❌ Fout bij participate:", err.message);
                        return;
                    }
                    break;

                case "leave":
                    try {
                        await salesforceClient.deleteSessionParticipation(objectData.UUID, objectData.UserUUID); // CMD
                        console.log("✅ Deelname verwijderd uit Salesforce");
                    } catch (err) {
                        channel.nack(msg, false, false);
                        console.error("❌ Fout bij leave:", err.message);
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

        console.log(`🔔 Listening for messages on queue "crm_session_${action}"…`);
    }
};