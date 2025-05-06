const amqp = require("amqplib");

async function sendTest() {
  const xml = `<UserMessage>
    <ActionType>CREATE</ActionType>
    <UUID>123456789</UUID>
    <TimeOfAction>2025-04-02T12:00:00Z</TimeOfAction>
    <FirstName>John</FirstName>
    <LastName>Doe</LastName>
    <PhoneNumber>+1234567890</PhoneNumber>
    <EmailAddress>john.doe@example.com</EmailAddress>
    <Business>
        <BusinessName>Example Corp</BusinessName>
        <BusinessEmail>contact@example.com</BusinessEmail>
        <RealAddress>Straat 123</RealAddress>
        <BTWNumber>BE0123456789</BTWNumber>
        <FacturationAddress>Facturatie 1</FacturationAddress>
    </Business>
  </UserMessage>`;

  const connection = await amqp.connect("amqp://admin:admin@localhost:5672");
  const channel = await connection.createChannel();
  const queue = "crm_user_create";

  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(xml));
  console.log("📤 Bericht verzonden naar crm_user_create");
  await channel.close();
  await connection.close();
}

sendTest();
