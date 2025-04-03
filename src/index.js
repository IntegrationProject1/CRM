const connectSalesforce = require("./config/salesforce");
const connectRabbitMQ = require("./config/rabbitmq");
const userConsumer = require("./consumers/userConsumer");

(async () => {
  try {
    const sfConn = await connectSalesforce();
    const rmqChannel = await connectRabbitMQ();

    await userConsumer(rmqChannel); // 🔥 start de listener

    console.log("🚀 CRM microservice draait!");
  } catch (err) {
    console.error("❌ Fout bij opstarten:", err);
  }
})();
