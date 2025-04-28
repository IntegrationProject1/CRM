require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require("./salesforceClient");
const { jsonToXml } = require("./xmlJsonTranslator");
const validator = require("./xmlValidator");

// Helper for xs:dateTime
function fixDateTime(dt) {
    if (!dt) return '';
    if (dt.endsWith('+0000')) return dt.replace('+0000', 'Z');
    return dt.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

async function startEventHandlerCDC(salesforceClient, rabbitMQChannel) {
    const cdcClient = salesforceClient.createCDCClient();
    let ignoreUpdate = false;

    cdcClient.subscribe('/data/EventChangeEvent', async function (message) {
        const { ChangeEventHeader, ...eventData } = message.payload;
        const action = ChangeEventHeader.changeType;

        console.log('📥 Salesforce CDC Event ontvangen:', action);

        let recordId;
        if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
            recordId = ChangeEventHeader.recordIds?.[0];
            if (!recordId) return console.error('❌ Geen recordId gevonden.');
        }

        let eventIDValue, eventRecord, payload, xmlMessage, xsdPath, rootName;

        try {
            switch (action) {
                case 'CREATE':
                    eventIDValue = new Date().toISOString();
                    ignoreUpdate = true;
                    await salesforceClient.updateEvent(recordId, { EventID__c: eventIDValue });
                    console.log(`✅ EventID__c ${eventIDValue} succesvol bijgewerkt op Event ${recordId}`);
                    eventRecord = await salesforceClient.getEvent(recordId);

                    // Build payload in XSD order
                    payload = {
                        UUID: eventIDValue,
                        Name: eventRecord?.Subject || eventData.Subject || "",
                        Description: eventRecord?.Description || eventData.Description || "",
                        StartDateTime: fixDateTime(eventRecord?.StartDateTime || eventData.StartDateTime || ""),
                        EndDateTime: fixDateTime(eventRecord?.EndDateTime || eventData.EndDateTime || ""),
                        Location: eventRecord?.Location || eventData.Location || "",
                        Organiser: eventRecord?.Organiser || eventData.Organiser || ""
                    };
                    // Only include Capacity if > 0
                    const capacityValueCreate = eventRecord?.Capacity || eventData.Capacity;
                    if (capacityValueCreate > 0) payload.Capacity = capacityValueCreate;
                    payload.EventType = eventRecord?.EventType || eventData.EventType || "";
                    // Only include RegisteredUsers if present
                    const usersCreate = eventRecord?.RegisteredUsers || eventData.RegisteredUsers;
                    if (usersCreate && Array.isArray(usersCreate) && usersCreate.length > 0) {
                        payload.RegisteredUsers = { User: usersCreate };
                    }
                    rootName = "CreateEvent";
                    xsdPath = './xsd/eventsXSD/CreateEvent.xsd';
                    break;

                case 'UPDATE':
                    if (ignoreUpdate) {
                        ignoreUpdate = false;
                        console.log("🔕 [CDC] UPDATE event genegeerd na EventID__c update");
                        return;
                    }
                    eventRecord = await salesforceClient.getEvent(recordId);
                    if (!eventRecord || !eventRecord.EventID__c) {
                        console.error("❌ EventID__c niet gevonden voor recordId:", recordId);
                        return;
                    }
                    eventIDValue = eventRecord.EventID__c;

                    // Prepare fields as array of { Name, NewValue }
                    const fieldsToUpdateArray = [];

                function addField(name, value) {
                    if (value !== undefined && value !== null) {
                        fieldsToUpdateArray.push({
                            Name: name,
                            NewValue: String(value)
                        });
                    }
                }

                    addField("Name", eventRecord?.Subject || eventData.Subject);
                    addField("Description", eventRecord?.Description || eventData.Description);
                    addField("StartDateTime", fixDateTime(eventRecord?.StartDateTime || eventData.StartDateTime));
                    addField("EndDateTime", fixDateTime(eventRecord?.EndDateTime || eventData.EndDateTime));
                    addField("Location", eventRecord?.Location || eventData.Location);
                    addField("Organiser", eventRecord?.Organiser || eventData.Organiser);

                    const capacityValueUpdate = eventRecord?.Capacity || eventData.Capacity;
                    if (capacityValueUpdate > 0) {
                        addField("Capacity", capacityValueUpdate);
                    }

                    addField("EventType", eventRecord?.EventType || eventData.EventType);

                    const usersUpdate = eventRecord?.RegisteredUsers || eventData.RegisteredUsers;
                    if (usersUpdate && Array.isArray(usersUpdate) && usersUpdate.length > 0) {
                        // You may need to serialize users as string or handle differently depending on your XSD
                        addField("RegisteredUsers", JSON.stringify(usersUpdate));
                    }

                    payload = {
                        UUID: fixDateTime(eventIDValue),
                        FieldsToUpdate: {
                            Field: fieldsToUpdateArray
                        }
                    };
                    rootName = "UpdateEvent";
                    xsdPath = './xsd/eventsXSD/UpdateEvent.xsd';
                    break;


                case 'DELETE':
                    // Use the jsforce sObject query pattern for deleted Events
                    const query = salesforceClient.sObject('Event')
                        .select('EventID__c')
                        .where({ Id: recordId, IsDeleted: true })
                        .limit(1)
                        .scanAll(true);

                    const resultDel = await query.run();
                    const eventDel = resultDel[0];

                    if (!eventDel?.EventID__c) {
                        console.error("❌ EventID__c niet gevonden voor verwijderde record:", recordId);
                        return;
                    }

                    eventIDValue = eventDel.EventID__c;
                    payload = {
                        UUID: eventIDValue
                    };

                    rootName = "DeleteEvent";
                    xsdPath = './xsd/eventsXSD/DeleteEvent.xsd';
                    break;

            }

            // Build message and XML
            const JSONMsg = { [rootName]: payload };
            xmlMessage = jsonToXml(JSONMsg[rootName], { rootName });

            if (!validator.validateXml(xmlMessage, xsdPath)) {
                console.error(`❌ XML ${action} niet geldig tegen XSD`);
                return;
            }

            // Publish to RabbitMQ
            const exchangeName = 'event';
            await rabbitMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

            const targetBindings = [
                `frontend.event.${action.toLowerCase()}`
            ];

            for (const routingKey of targetBindings) {
                rabbitMQChannel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(JSONMsg)));
                console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
            }
        } catch (error) {
            console.error(`❌ Fout tijdens verwerken ${action} event:`, error.message);
        }
    });

    console.log('✅ Verbonden met Salesforce Streaming API voor EventChangeEvent');
}

// Instantieer Salesforce Client + RabbitMQ Connection
const sfClient = new SalesforceClient(
    process.env.SALESFORCE_USERNAME,
    process.env.SALESFORCE_PASSWORD,
    process.env.SALESFORCE_TOKEN,
    process.env.SALESFORCE_LOGIN_URL
);

(async () => {
    const amqpConn = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await amqpConn.createChannel();
    console.log("✅ Verbonden met RabbitMQ Kanaal");

    await sfClient.login();
    await startEventHandlerCDC(sfClient, channel);
})();
