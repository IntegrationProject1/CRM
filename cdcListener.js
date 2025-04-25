require('dotenv').config();

// const amqp = require('amqplib');
const SalesforceClient = require("./salesforceClient");

async function startCDCListener(salesforceClient) {
  // RABBITMQ connection
  // const amqpConn = await amqp.connect(`amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
  // const channel = await amqpConn.createChannel();
  // console.log("✅ Verbonden met RabbitMQ Kanaal");

  // Luister op de standaard CDC kanaal voor Contact
  const cdcClient = salesforceClient.createCDCClient();

  cdcClient.subscribe('/data/ContactChangeEvent', async function (message) {  // Listen to Contact event

    // Onderscheid Object data & Header data
    const {ChangeEventHeader, ...objectData} = message.payload;

    // RecordId ophalen
    const recordId = ChangeEventHeader.recordIds && ChangeEventHeader.recordIds.length > 0
        ? ChangeEventHeader.recordIds[0]
        : null;
    if (recordId) {
      objectData.Id = recordId;
    } else {
      console.error('❌ Geen recordId gevonden in ChangeEventHeader');
      return;
    }
    let ObjectUUID;

    // Action ophalen (e.g. CREATE, UPDATE, DELETE)
    const action = message.payload.ChangeEventHeader.changeType;

    switch (action) {
      case 'CREATE':

        // Een UUID genereren voor de nieuwe record en deze in Salesforce bijwerken
        let timestamp = new Date().getTime();
        try {
          await salesforceClient.updateUser(recordId, { UUID__c: timestamp });
          console.log("✅ UUID successvol bijgewerkt");
        } catch (err) {
          console.error("❌ Fout bij instellen UUID:", err.message);
          return;
        }
        ObjectUUID = timestamp;
        break;

      case 'UPDATE':

        const result = await sfClient.sObject('Contact').retrieve(recordId, ['Id', 'UUID__c']);
        if (!result.UUID__c) {
          console.error("❌ Geen resultaat gevonden voor recordId:", recordId);
          return;
        }
        ObjectUUID = result.UUID__c;

        break;
      case 'DELETE':
        if (!ObjectUUID) {
          console.error("❌ Geen UUID gevonden voor recordId:", recordId);
          return;
        }
        ObjectUUID = objectData.Id;
        break;
    }

    /*TODO
       1. Formateer DATA
       2. Converteer naar XML
       3. Valideer XML op basis van XSD
       4. Verzend naar Queues met RabbitMQ
     */
    console.log('📥Salesforce CDC Event ontvangen:', {action, objectData});
    console.log("✅ UUID succesvol opgehaald: ", ObjectUUID);
  });

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
