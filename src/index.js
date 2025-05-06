const connectSalesforce = require("./config/salesforce");
const connectRabbitMQ = require("./config/rabbitmq");
const userConsumer = require("./consumers/userConsumer");
const userUpdateConsumer = require("./consumers/userUpdateConsumer");
const userDeleteConsumer = require("./consumers/userDeleteConsumer");

(async () => {
  try {
    const sfConn = await connectSalesforce();
    const rmqChannel = await connectRabbitMQ();

    await userConsumer(rmqChannel);
    await userUpdateConsumer(rmqChannel);
    await userDeleteConsumer(rmqChannel);

    console.log("🚀 CRM microservice draait!");
  } catch (err) {
    console.error("❌ Fout bij opstarten:", err);
  }
})();
