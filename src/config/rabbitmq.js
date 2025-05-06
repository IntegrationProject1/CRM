const amqp = require("amqplib");
require("dotenv").config();

async function connectRabbitMQ() {
  const connStr = `amqp://${process.env.RABBITMQ_USERNAME}:${process.env.RABBITMQ_PASSWORD}@${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`;
  const connection = await amqp.connect(connStr);
  const channel = await connection.createChannel();

  console.log("✅ Verbonden met RabbitMQ");
  
  await channel.assertQueue("crm_user_create", { durable: true });
  await channel.assertQueue("crm_user_update", { durable: true });
  await channel.assertQueue("crm_user_delete", { durable: true });
  await channel.assertQueue("crm_user_session_register", { durable: true });

  return channel;
}

module.exports = connectRabbitMQ;
