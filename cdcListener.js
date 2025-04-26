require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require("./salesforceClient");
const { jsonToXml, transformSalesforceToXml } = require("./xmlJsonTranslator");

async function startCDCListener(salesforceClient) {
  const cdcClient = salesforceClient.createCDCClient();
  let ignoreUpdate = false;

  cdcClient.subscribe('/data/ContactChangeEvent', async function (message) {
    const { ChangeEventHeader, ...objectData } = message.payload;
    const action = ChangeEventHeader.changeType;

    console.log('📥 Salesforce CDC Contact Event ontvangen:', action);

    // RecordId ophalen vanuit ChangeEventHeader
    let recordId;
    if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
      recordId = ChangeEventHeader.recordIds?.[0];
      if (!recordId) return console.error('❌ Geen recordId gevonden.');
    }

    let UUIDTimeStamp;
    let JSONMsg;

    switch (action) {
      case 'CREATE':
        // Een UUID genereren voor de nieuwe record en deze in Salesforce bijwerken
        UUIDTimeStamp = new Date().getTime();

        ignoreUpdate=true; // De volgende Update CDC negeren (vermijd dubbel bijwerken van UUID)
        try {
          await salesforceClient.updateUser(recordId, { UUID__c: UUIDTimeStamp });
          console.log("✅ UUID successvol bijgewerkt");
        } catch (err) {
          console.error("❌ Fout bij instellen UUID:", err.message);
          return;
        }

        JSONMsg = { // is nog niet compleet
          "UserMessage": {
            "ActionType": action,
            "UUID": new Date(UUIDTimeStamp).toISOString(),
            "TimeOfAction": new Date().toISOString(),
            ...objectData
          }
        };
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
            "PhoneNumber": objectData.Phone,
            "EmailAddress": objectData.Email
          }
        };
        break;

      case 'DELETE':
        // De UUID queryien van de record die verwijderd is (Speciale case -> recycle bin) (Dit werkt alleen als de Salesforce FLS read-only option is ingeschakeld voor de UUID)
        const query = salesforceClient.sObject('Contact')
            .select('UUID__c, Id')
            .where({Id: recordId, IsDeleted: true})
            .limit(1)
            .scanAll(true);
        const resultDel = await query.run();
        UUIDTimeStamp = resultDel[0]?.UUID__c || null;

        if (!UUIDTimeStamp) return console.error("❌ Geen UUID gevonden voor verwijderde record met Id:", recordId);

        JSONMsg = {
          "UserMessage": {
            "ActionType": action,
            "UUID": new Date(UUIDTimeStamp).toISOString(),
            "TimeOfAction": new Date().toISOString()
          }
        };
        break;

      default:
        console.warn("⚠️ Niet gehandelde actie:", action);
        return;
    }

    /*TODO
       1. Formateer DATA op basis van gevraagde XSD formaat
       2. Converteer naar XML
       3. Valideer XML op basis van XSD
       4. Verzend naar Queues met RabbitMQ
     */

    // INSER STAP 2 & 3 HIER

    const actionLower = action.toLowerCase();

    console.log('📤 Salesforce Converted Message:', JSON.stringify(JSONMsg, null, 2));

    const exchangeName = 'user';

    await rabbitMQChannel.assertExchange(exchangeName, 'topic', { durable: true });

    // Publiceer op alle relevante queues
    const targetBindings = [
      `frontend.user.${actionLower}`,
      `facturatie.user.${actionLower}`,
      `kassa.user.${actionLower}`
    ];

    for (const routingKey of targetBindings) {
      // Publish to the exchange with the appropriate routing key
      rabbitMQChannel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(JSONMsg)));
      console.log(`📤 Bericht verstuurd naar exchange "${exchangeName}" met routing key "${routingKey}"`);
    }
  });

  console.log('✅ Verbonden met Salesforce Streaming API');
}

// SalesForce client direct geconfigureerd om sneller te testen (word later verwijderd, en gestart vanuit index.js)
const sfClient = new SalesforceClient(
    process.env.SALESFORCE_USERNAME,
    process.env.SALESFORCE_PASSWORD,
    process.env.SALESFORCE_TOKEN,
    process.env.SALESFORCE_LOGIN_URL
);
(async () => {

  // RABBITMQ connection
  const amqpConn = await amqp.connect(`amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
  const channel = await amqpConn.createChannel();
  console.log("✅ Verbonden met RabbitMQ Kanaal");

  await sfClient.login(); // 🔐 OAuth-login via jsforce

  await startCDCListener(sfClient, channel);
})();

// module.exports = startCDCListener;