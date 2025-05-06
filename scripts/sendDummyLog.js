const amqp = require("amqplib");

async function sendDummyLog() {
  const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
  const channel = await connection.createChannel();
  const logMessage = {
    source: "CRM",
    type: "TEST",
    uuid: "000",
    status: "TEST_SUCCESS",
    timestamp: new Date().toISOString(),
  };

  await channel.assertQueue("crm_log", { durable: true });
  channel.sendToQueue("crm_log", Buffer.from(JSON.stringify(logMessage)));

  console.log("🧪 Testlog verzonden naar crm_log");
  await channel.close();
  await connection.close();
}

sendDummyLog();
