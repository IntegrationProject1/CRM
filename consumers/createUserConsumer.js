module.exports = async function createUserConsumer(channel, salesforceClient, exchange) {
  const queue = 'crm_user_create';

  await channel.assertQueue(queue, { durable: true });
  await channel.bindQueue(queue, exchange, queue);
  console.log(`🔔 Listening for messages on queue "${queue}"…`);

  await channel.consume(queue, async (msg) => {
    if (!msg) return;

    const payload = msg.content.toString();

    // 🔒 Skip XML messages (like Heartbeats)
    if (payload.trim().startsWith('<')) {
      console.log("🔕 [CreateUserConsumer] Ontvangen XML — wordt overgeslagen");
      return channel.ack(msg);
    }

    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) {
      console.error('❌ JSON parse error:', e.message);
      return channel.nack(msg, false, false);
    }

    console.log("📥 [CreateUserConsumer] Ontvangen:", data);

    try {
      await salesforceClient.createUser(data);
      channel.ack(msg);
      console.log("✅ Gebruiker aangemaakt in Salesforce");
    } catch (err) {
      console.error("❌ Fout bij create:", err.message);
      channel.nack(msg, false, false);
    }
  });
};
