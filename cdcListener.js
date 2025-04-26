require('dotenv').config();
// const amqp = require('amqplib');

const SalesforceClient = require("./salesforceClient");
const {jsonToXml} = require("./xmlJsonTranslator");

async function startCDCListener(salesforceClient) {

  // Luister op de standaard CDC kanaal voor Contact
  const cdcClient = salesforceClient.createCDCClient();
  let ignoreUpdate = false; // Flag om UPDATE events te negeren na UUID toewijzing

  cdcClient.subscribe('/data/ContactChangeEvent', async function (message) {  // Listen to Contact event

    // Onderscheid Object data & Header data
    const {ChangeEventHeader, ...objectData} = message.payload;

    // Action ophalen (e.g. CREATE, UPDATE, DELETE)
    const action = message.payload.ChangeEventHeader.changeType;

    console.log('📥Salesforce CDC Contact Event ontvangen: ', action);

    // RecordId ophalen vanuit ChangeEventHeader
    let recordId;
    if (action === 'CREATE' || action === 'UPDATE' || action === 'DELETE') {
      recordId = ChangeEventHeader.recordIds && ChangeEventHeader.recordIds.length > 0
          ? ChangeEventHeader.recordIds[0]
          : null;

      if (!recordId) return console.error('❌ Geen recordId gevonden in ChangeEventHeader')
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
        }
        break;

      case 'UPDATE':
        if (ignoreUpdate) {
          ignoreUpdate = false;
          console.log("🔕 [CDC] UPDATE event genegeerd na UUID update");
          return;
        }

        const resultUpd = await salesforceClient.sObject('Contact').retrieve(recordId);
        if (!resultUpd.UUID__c) {
          console.error("❌ Geen resultaat gevonden voor UUID van recordId:", recordId);
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
        }
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
        }
        break;

      default:
        return console.warn("⚠️Niet gehandelde actie gedetecteerd:", action);
    }

    /*TODO
       1. Formateer DATA op basis van gevraagde XSD formaat
       2. Converteer naar XML
       3. Valideer XML op basis van XSD
       4. Verzend naar Queues met RabbitMQ
     */

    console.log('📤 Salesforce Converted Message:', JSON.stringify(JSONMsg, null, 2));
  });

  // RABBITMQ connection
  // const amqpConn = await amqp.connect(`amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
  // const channel = await amqpConn.createChannel();
  // console.log("✅ Verbonden met RabbitMQ Kanaal");

  //   const { changeType, payload } = message;
  //   const action = changeType.toLowerCase(); // create | update | delete
  //   const routingKey = `crm_user_${action}`;
  //
  //   const formattedMessage = {
  //     uuid: payload.Id, // evt. External_Id__c
  //     source: "salesforce",
  //     action: action,
  //     payload: {
  //       FirstName: payload.FirstName,
  //       LastName: payload.LastName,
  //       Email: payload.Email
  //     }
  //   };
  //
  //   // Publiceer op alle relevante queues
  //   const targetQueues = [
  //     `frontend_user_${action}`,
  //     `facturatie_user_${action}`,
  //     `kassa_user_${action}`
  //   ];
  //
  //   for (const q of targetQueues) {
  //     // await channel.assertQueue(q, { durable: true });
  //     // channel.sendToQueue(q, Buffer.from(JSON.stringify(formattedMessage)));
  //     console.log(`📤 Bericht verstuurd naar ${q}`);
  //   }
  // });

  // subscription.on('error', (err) => {
  //   console.error('❌ CDC Listener Error:', err);
  // });

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

  await sfClient.login(); // 🔐 OAuth-login via jsforce

  await startCDCListener(sfClient);
})();

// module.exports = startCDCListener;