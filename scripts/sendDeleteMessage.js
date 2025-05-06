const amqp = require("amqplib");

async function sendDelete() {
  const xml = `<UserMessage>
    <ActionType>DELETE</ActionType>
    <UUID>123456789</UUID>
    <TimeOfAction>2025-04-03T17:00:00Z</TimeOfAction>
  </UserMessage>`;

  const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
  const channel = await connection.createChannel();
  const queue = "crm_user_delete";

  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(xml));
  console.log("📤 DELETE bericht verzonden");
  await channel.close();
  await connection.close();
}

sendDelete();
