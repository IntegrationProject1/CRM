const SalesforceClient = require("./salesforceClient");
const { jsonToXml } = require("./xmlJsonTranslator");
const validator = require("./xmlValidator");

module.exports = {
    startEventCDCListener: async function(salesforceClient, rabbitMQChannel) {
        const cdcClient = salesforceClient.createCDCClient();
        const exchangeName = 'events'; // SAME EXCHANGE FOR BOTH

        // === EventChangeEvent Handler ===
        cdcClient.subscribe('/data/EventChangeEvent', async function (message) {
            const { ChangeEventHeader, ...objectData } = message.payload;
            const action = ChangeEventHeader.changeType;

            console.log('📥 Salesforce CDC Event Event ontvangen:', action);

            let recordId;
            if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
                recordId = ChangeEventHeader.recordIds?.[0];
                if (!recordId) return console.error('❌ Geen recordId gevonden.');
            }

            let UUIDTimeStamp;
            let JSONMsg;
            let xmlMessage;
            let xsdPath;

            // Wanneer nodig, registreerde gebruikers (EventRelations) ophalen
            const registeredUsers = action !== 'DELETE' ? await getRegisteredUsers(salesforceClient, recordId) : [];

            switch (action) {
                case 'CREATE':
                    UUIDTimeStamp = new Date().getTime();

                    try {
                        // UUID instellen op Event record
                        await salesforceClient.sObject('Event').update({
                            Id: recordId,
                            UUID__c: UUIDTimeStamp
                        });
                        console.log("✅ UUID succesvol bijgewerkt op Event");
                    } catch (err) {
                        console.error("❌ Fout bij instellen UUID:", err.message);
                        return;
                    }

                    // Event details ophalen
                    const eventData = await salesforceClient.sObject('Event').retrieve(recordId);

                    JSONMsg = {
                        "CreateEvent": {
                            "UUID": new Date(UUIDTimeStamp).toISOString(),
                            "Name": eventData.Subject || "",
                            "Description": eventData.Description || "",
                            "StartDateTime": eventData.StartDateTime || new Date().toISOString(),
                            "EndDateTime": eventData.EndDateTime || new Date().toISOString(),
                            "Location": eventData.Location || "",
                            "Organisator": eventData.OwnerId || "",
                            "Capacity": parseInt(eventData.MaxAttendees || 1),
                            "EventType": eventData.Type || "Standard",
                            "RegisteredUsers": {
                                "User": registeredUsers
                            }
                        }
                    };

                    xmlMessage = jsonToXml(JSONMsg.CreateEvent, { rootName: 'CreateEvent' });
                    xsdPath = './xsd/eventsXSD/CreateEvent.xsd';
                    break;

                case 'UPDATE':
                    const eventToUpdate = await salesforceClient.sObject('Event').retrieve(recordId);
                    UUIDTimeStamp = eventToUpdate.UUID__c;

                    if (!UUIDTimeStamp) {
                        console.error("❌ Geen UUID gevonden voor Event:", recordId);
                        return;
                    }

                    // Gewijzigde velden bepalen
                    const changedFields = [];
                    for (const field in objectData) {
                        changedFields.push({
                            "Name": field,
                            "NewValue": String(objectData[field] || "")
                        });
                    }

                    JSONMsg = {
                        "UpdateEvent": {
                            "UUID": new Date(UUIDTimeStamp).toISOString(),
                            "FieldsToUpdate": {
                                "Field": changedFields
                            }
                        }
                    };

                    xmlMessage = jsonToXml(JSONMsg.UpdateEvent, { rootName: 'UpdateEvent' });
                    xsdPath = './xsd/eventsXSD/UpdateEvent.xsd';
                    break;

                case 'DELETE':
                    const deletedEvent = await salesforceClient.sObject('Event')
                        .select('UUID__c')
                        .where({ Id: recordId, IsDeleted: true })
                        .limit(1)
                        .scanAll(true)
                        .run();

                    UUIDTimeStamp = deletedEvent[0]?.UUID__c;

                    if (!UUIDTimeStamp) {
                        console.error("❌ Geen UUID gevonden voor Event:", recordId);
                        return;
                    }

                    JSONMsg = {
                        "DeleteEvent": {
                            "UUID": UUIDTimeStamp
                        }
                    };

                    xmlMessage = jsonToXml(JSONMsg.DeleteEvent, { rootName: 'DeleteEvent' });
                    xsdPath = './xsd/eventsXSD/DeleteEvent.xsd';
                    break;

                default:
                    console.warn("⚠️ Niet gehandelde actie:", action);
                    return;
            }

            if (!validator.validateXml(xmlMessage, xsdPath)) {
                console.error(`❌ XML ${action} niet geldig tegen XSD`);
                return;
            }

            const actionLower = action.toLowerCase();
            console.log('📤 Salesforce Converted Event Message:', JSON.stringify(JSONMsg, null, 2));

            await rabbitMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

            const targetBindings = [
                `frontend.event.${actionLower}`,
                `facturatie.event.${actionLower}`,
                `kassa.event.${actionLower}`
            ];

            for (const routingKey of targetBindings) {
                rabbitMQChannel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(JSONMsg)));
                console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
            }
        });

        // === EventRelationChangeEvent Handler ===
        cdcClient.subscribe('/data/EventRelationChangeEvent', async function (message) {
            const { ChangeEventHeader, ...objectData } = message.payload;
            const action = ChangeEventHeader.changeType;

            console.log('📥 Salesforce CDC EventRelation Event ontvangen:', action);

            let recordId;
            if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
                recordId = ChangeEventHeader.recordIds?.[0];
                if (!recordId) return console.error('❌ Geen recordId gevonden.');
            }

            let JSONMsg;
            let xmlMessage;
            let xsdPath;

            switch (action) {
                case 'CREATE':
                case 'UPDATE':
                    // EventRelation details ophalen
                    const relationData = await salesforceClient.sObject('EventRelation').retrieve(recordId);

                    JSONMsg = {
                        "EventRelationMessage": {
                            "ActionType": action,
                            "EventId": relationData.EventId || "",
                            "RelationId": relationData.RelationId || "",
                            "RelationType": relationData.RelationType || ""
                        }
                    };

                    xmlMessage = jsonToXml(JSONMsg.EventRelationMessage, { rootName: 'EventRelationMessage' });
                    xsdPath = './xsd/eventRelationXSD/EventRelationMessage.xsd';
                    break;

                case 'DELETE':
                    JSONMsg = {
                        "EventRelationMessage": {
                            "ActionType": action,
                            "EventRelationId": recordId || ""
                        }
                    };

                    xmlMessage = jsonToXml(JSONMsg.EventRelationMessage, { rootName: 'EventRelationMessage' });
                    xsdPath = './xsd/eventRelationXSD/EventRelationMessage.xsd';
                    break;

                default:
                    console.warn("⚠️ Niet gehandelde actie:", action);
                    return;
            }

            if (!validator.validateXml(xmlMessage, xsdPath)) {
                console.error(`❌ XML ${action} niet geldig tegen XSD`);
                return;
            }

            const actionLower = action.toLowerCase();
            console.log('📤 Salesforce Converted EventRelation Message:', JSON.stringify(JSONMsg, null, 2));

            await rabbitMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

            const targetBindings = [
                `frontend.event.${actionLower}`,
                `facturatie.event.${actionLower}`,
                `kassa.event.${actionLower}`
            ];

            for (const routingKey of targetBindings) {
                rabbitMQChannel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(JSONMsg)));
                console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
            }
        });
        console.log('✅ Verbonden met Salesforce Streaming API (Events)');
    }
};

// Helper functie om geregistreerde gebruikers op te halen
async function getRegisteredUsers(salesforceClient, eventId) {
    try {
        // EventRelation records ophalen
        const relations = await salesforceClient.query(`
            SELECT Id, RelationId, Relation.Name, Relation.Type
            FROM EventRelation
            WHERE EventId = '${eventId}'
        `);

        // Vertaal naar het verwachte formaat volgens XSD
        return relations.records.map(relation => ({
            "UUID": relation.RelationId,
            "Name": relation.Relation.Name || "Onbekend"
        }));
    } catch (error) {
        console.error("❌ Fout bij ophalen EventRelations:", error.message);
        return [];
    }
}
