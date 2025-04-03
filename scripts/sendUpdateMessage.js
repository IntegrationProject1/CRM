const amqp = require("amqplib");

async function sendUpdate() {
  const xml = `<UserMessage>
    <ActionType>UPDATE</ActionType>
    <UUID>123456789</UUID>
    <TimeOfAction>2025-04-03T16:00:00Z</TimeOfAction>
    <PhoneNumber>+0000000000</PhoneNumber>
    <EmailAddress>updated.email@example.com</EmailAddress>
    <FirstName>John</FirstName>
    <LastName>Doe Updated</LastName>
  </UserMessage>`;

  const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
  const channel = await connection.createChannel();
  const queue = "crm_user_update";

  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(xml));
  console.log("📤 UPDATE bericht verzonden");
  await channel.close();
  await connection.close();
}

sendUpdate();
