require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require("./salesforceClient");
const { jsonToXml } = require("./xmlJsonTranslator");
const validator = require("./xmlValidator");

async function startCDCListener(salesforceClient, rabbitMQChannel) {
  const cdcClient = salesforceClient.createCDCClient();
  let ignoreUpdate = false;

  cdcClient.subscribe('/data/ContactChangeEvent', async function (message) {
    const { ChangeEventHeader, ...objectData } = message.payload;
    const action = ChangeEventHeader.changeType;

    console.log('📥 Salesforce CDC Contact Event ontvangen:', action);

    let recordId;
    if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) return console.error('❌ Geen recordId gevonden.');
    }

    let UUIDTimeStamp;
    let JSONMsg;
    let xmlMessage;
    let xsdPath;

    switch (action) {
      case 'CREATE':
        UUIDTimeStamp = new Date().getTime();
        ignoreUpdate = true;

        try {
          await salesforceClient.updateUser(recordId, { UUID__c: UUIDTimeStamp });
          console.log("✅ UUID succesvol bijgewerkt");
        } catch (err) {
          console.error("❌ Fout bij instellen UUID:", err.message);
          return;
        }

        JSONMsg = {
          "UserMessage": {
            "ActionType": action,
            "UUID": new Date(UUIDTimeStamp).toISOString(),
            "TimeOfAction": new Date().toISOString(),
            "EncryptedPassword": "", // verplicht veld volgens ons XSD stuctuur
            "FirstName": objectData.FirstName || "",
            "LastName": objectData.LastName || "",
            "PhoneNumber": objectData.Phone || "",
            "EmailAddress": objectData.Email || ""
          }
        };

        xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' });
        xsdPath = './xsd/user_accountXSD/UserMessage.xsd';

        if (!validator.validateXml(xmlMessage, xsdPath)) {
          console.error('❌ XML Create niet geldig tegen XSD');
          return;
        }
        break;

      case 'UPDATE':
        if (ignoreUpdate) {
          ignoreUpdate = false;
          console.log("🔕 [CDC] UPDATE event genegeerd na UUID update");
          return;
        }

        const resultUpd = await salesforceClient.sObject('Contact').retrieve(recordId);
        if (!resultUpd?.UUID__c) {
          console.error("❌ Geen UUID gevonden voor recordId:", recordId);
          return;
        }

        UUIDTimeStamp = resultUpd.UUID__c;

        JSONMsg = {
          "UserMessage": {
            "ActionType": action,
            "UUID": new Date(UUIDTimeStamp).toISOString(),
            "TimeOfAction": new Date().toISOString(),
            "EncryptedPassword": "", // VERPLICHT veld toevoegen!
            "PhoneNumber": objectData.Phone || "",
            "EmailAddress": objectData.Email || ""
          }
        };

        xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' }); // hier moet gechecked worden
        xsdPath = './xsd/user_accountXSD/UserMessage.xsd';// hier moet gechecked worden

        if (!validator.validateXml(xmlMessage, xsdPath)) {
          console.error('❌ XML Update niet geldig tegen XSD');
          return;
        }
        break;

      case 'DELETE':
        const query = salesforceClient.sObject('Contact')
            .select('UUID__c, Id')
            .where({ Id: recordId, IsDeleted: true })
            .limit(1)
            .scanAll(true);

        const resultDel = await query.run();
        UUIDTimeStamp = resultDel[0]?.UUID__c || null;

        if (!UUIDTimeStamp) {
          console.error("❌ Geen UUID gevonden voor verwijderde record:", recordId);
          return;
        }

        JSONMsg = {
          "UserMessage": {
            "ActionType": action,
            "UUID": new Date(UUIDTimeStamp).toISOString(),
            "TimeOfAction": new Date().toISOString(),
            "EncryptedPassword": ""
            // Bij DELETE geen extra data nodig, maar EncryptedPassword MOET aanwezig zijn
          }
        };

        xmlMessage = jsonToXml(JSONMsg.UserMessage, { rootName: 'UserMessage' }); // hier moet gechecked worden
        xsdPath = './xsd/user_accountXSD/UserMessage.xsd';


        if (!validator.validateXml(xmlMessage, xsdPath)) {
          console.error('❌ XML Delete niet geldig tegen XSD');
          return;
        }
        break;

      default:
        console.warn("⚠️ Niet gehandelde actie:", action);
        return;
    }

    const actionLower = action.toLowerCase();

    console.log('📤 Salesforce Converted Message:', JSON.stringify(JSONMsg, null, 2));

    const exchangeName = 'user';

    await rabbitMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

    const targetBindings = [
      `frontend.user.${actionLower}`,
      `facturatie.user.${actionLower}`,
      `kassa.user.${actionLower}`
    ];

    for (const routingKey of targetBindings) {
      rabbitMQChannel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(JSONMsg)));
      console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
    }
  });

  console.log('✅ Verbonden met Salesforce Streaming API');
}

// Instantieer Salesforce Client + RabbitMQ Connection
const sfClient = new SalesforceClient(
    process.env.SALESFORCE_USERNAME,
    process.env.SALESFORCE_PASSWORD,
    process.env.SALESFORCE_TOKEN,
    process.env.SALESFORCE_LOGIN_URL
);

(async () => {
  const amqpConn = await amqp.connect(`amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
  const channel = await amqpConn.createChannel();
  console.log("✅ Verbonden met RabbitMQ Kanaal");

  await sfClient.login();
  await startCDCListener(sfClient, channel);
})();


