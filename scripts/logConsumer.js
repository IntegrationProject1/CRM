const amqp = require("amqplib");

async function consumeLogs() {
  const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
  const channel = await connection.createChannel();

  await channel.assertQueue("crm_log", { durable: true });

  console.log("📥 Log-consumer gestart. Wachten op berichten...\n");

  channel.consume("crm_log", (msg) => {
    const content = msg.content.toString();
    console.log("📘 Logbericht ontvangen:", content);
    channel.ack(msg);
  });
}

consumeLogs();
