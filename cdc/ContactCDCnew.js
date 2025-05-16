require('dotenv').config();
const { jsonToXml } = require("../utils/xmlJsonTranslator");
const validator = require("../utils/xmlValidator");
const hrtimeBase = process.hrtime.bigint();
const {user_logger} = require("../utils/logger");

/**
 * Generates an ISO 8601 timestamp with 6 digits for fractional seconds (microseconds).
 * Example: 2025-05-13T13:37:05.000000Z
 * Note: Actual precision may be lower than microseconds.
 * @returns {string} - ISO 8601 formatted timestamp with microseconds.
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
 * Handles the CREATE action for Salesforce CDC messages.
 * @param recordId - The Salesforce record ID.
 * @param cdcObjectData - The CDC object data.
 * @param sfClient - The Salesforce client instance.
 *  @returns {Promise<{
 *    JSONMsg: {
 *      UserMessage: {
 *        ActionType: string,
 *        UUID: string,
 *        TimeOfAction: string,
 *        EncryptedPassword: (string|*),
 *        FirstName: (string|*),
 *        LastName: (string|*),
 *        PhoneNumber: string,
 *        EmailAddress: string
 *      }
 *    },
 *    xsdPath: string
 *  }>} - The JSON message and XSD path.
 * */
async function handleCreateAction(recordId, cdcObjectData, sfClient) {
    const UUID = generateMicroDateTime().toString();
    await sfClient.updateUser(recordId, { UUID__c: UUID });
    user_logger.info('UUID succesvol bijgewerkt:', UUID);

    const JSONMsg = {
        UserMessage: {
            ActionType: 'CREATE',
            UUID: UUID,
            TimeOfAction: new Date().toISOString(),
            EncryptedPassword: cdcObjectData.Password__c || "",
            FirstName: cdcObjectData.Name?.FirstName || "",
            LastName: cdcObjectData.Name?.LastName || "",
            PhoneNumber: cdcObjectData.Phone || "",
            EmailAddress: cdcObjectData.Email || ""
        }
    };
    const xsdPath = './xsd/userXSD/UserCreate.xsd';
    return { JSONMsg, xsdPath };
}

/**
 * Handles the UPDATE action for Salesforce CDC messages.
 * @param recordId - The Salesforce record ID.
 * @param sfClient - The Salesforce client instance.
 * @returns {Promise<{
 *   JSONMsg: {
 *     UserMessage: {
 *       ActionType: string,
 *       UUID: (string|*),
 *       TimeOfAction: string,
 *       EncryptedPassword: (*|string),
 *       FirstName: string,
 *       LastName: string,
 *       PhoneNumber: string,
 *       EmailAddress: string
 *     }
 *   },
 *   xsdPath: string
 * }|null>} - The JSON message and XSD path.
 **/
async function handleUpdateAction(recordId, sfClient) {
    const updatedRecord = await sfClient.sObject('Contact').retrieve(recordId);
    if (!updatedRecord?.UUID__c) {
        user_logger.error(`Geen UUID gevonden voor record: ${recordId}`);
        return null;
    }

    const JSONMsg = {
        UserMessage: {
            ActionType: 'UPDATE',
            UUID: updatedRecord.UUID__c,
            TimeOfAction: new Date().toISOString(),
            EncryptedPassword: updatedRecord.Password__c || "",
            FirstName: updatedRecord.FirstName || "",
            LastName: updatedRecord.LastName || "",
            PhoneNumber: updatedRecord.Phone || "",
            EmailAddress: updatedRecord.Email || ""
        }
    };
    const xsdPath = './xsd/userXSD/UserUpdate.xsd';
    return { JSONMsg, xsdPath };
}

/**
 * Handles the DELETE action for Salesforce CDC messages.
 * @param recordId
 * @param sfClient
 * @returns {Promise<{
 *   JSONMsg: {
 *     UserMessage: {
 *       ActionType: string,
 *       UUID: (string|*),
 *       TimeOfAction: string
 *     }
 *   },
 *   xsdPath: string
 * }|null>} - The JSON message and XSD path.
 */
async function handleDeleteAction(recordId, sfClient) {
    const query = sfClient.sObject('Contact')
        .select('UUID__c')
        .where({ Id: recordId, IsDeleted: true })
        .limit(1)
        .scanAll(true);

    const resultDel = await query.run();
    const deletedRecord = resultDel[0];

    if (!deletedRecord?.UUID__c) {
        user_logger.error(`Geen UUID gevonden voor verwijderd record: ${recordId}`);
        return null;
    }

    const JSONMsg = {
        UserMessage: {
            ActionType: 'DELETE',
            UUID: deletedRecord.UUID__c,
            TimeOfAction: new Date().toISOString(),
        }
    };
    const xsdPath = './xsd/userXSD/UserDelete.xsd';
    return { JSONMsg, xsdPath };
}

/**
 * Publishes messages to multiple RabbitMQ exchanges.
 * @param RMQChannel - RabbitMQ channel instance.
 * @param action - The action type (CREATE, UPDATE, DELETE).
 * @param xmlMessage - The XML message to be published.
 * @returns {Promise<void[]>} - Array of promises for each published message.
 */
function publishToExchanges(RMQChannel, action, xmlMessage) {
    const exchangeName = 'user';
    const routingKeys = [
        `frontend.user.${action.toLowerCase()}`,
        `facturatie.user.${action.toLowerCase()}`,
        `kassa.user.${action.toLowerCase()}`
    ];

    return Promise.all(routingKeys.map(async (routingKey) => {
        user_logger.debug('Debugging exchangeName and routingKey:', exchangeName, routingKey);
        RMQChannel.publish(exchangeName, routingKey, Buffer.from(xmlMessage));
        user_logger.info('Bericht verstuurd naar:', exchangeName, routingKey);
    }));
}

/**
 * Handles Salesforce CDC messages for Contact objects.
 * @param message - The message received from Salesforce.
 * @param sfClient - The Salesforce client instance.
 * @param RMQChannel - RabbitMQ channel instance.
 * @returns {Promise<*>} - Promise that resolves when the message is processed.
 */
module.exports = async function ContactCDCHandler(message, sfClient, RMQChannel) {
    const { ChangeEventHeader, ...cdcObjectData } = message.payload;

    if (ChangeEventHeader.changeOrigin === "com/salesforce/api/rest/50.0") {
        user_logger.info("Salesforce API call gedetecteerd, actie overgeslagen.");
        return;
    }

    const action = ChangeEventHeader.changeType;
    user_logger.info('Salesforce CDC Contact Event ontvangen:', action, cdcObjectData);

    let recordId;
    if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
        recordId = ChangeEventHeader.recordIds?.[0];
        if (!recordId) return user_logger.error('Geen recordId gevonden.');
    }

    let JSONMsg, xsdPath;

    try {
        let result;
        switch (action) {
            case 'CREATE':
                result = await handleCreateAction(recordId, cdcObjectData, sfClient);
                break;
            case 'UPDATE':
                result = await handleUpdateAction(recordId, sfClient);
                break;
            case 'DELETE':
                result = await handleDeleteAction(recordId, sfClient);
                break;
            default:
                user_logger.warning(" Niet gehandelde actie:", action);
                return;
        }
        if (!result) return;
        JSONMsg = result.JSONMsg;
        xsdPath = result.xsdPath;

        const xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
        if (!validator.validateXml(xmlMessage, xsdPath)) {
            user_logger.error('XML validatie gefaald voor actie:', action);
            return;
        }

        const exchangeName = 'user';
        await RMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

        await publishToExchanges(RMQChannel, action, xmlMessage);

    } catch (error) {
        user_logger.error(`❌ Kritieke fout tijdens ${action} actie:`, error.message);
        if (error.response?.body) {
            user_logger.error('Salesforce API fout details:', error.response.body);
        }
    }
};