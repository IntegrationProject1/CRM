module.exports = async function deleteUserConsumer(channel, salesforceClient, exchange) {
  const queue = 'crm_user_delete';

  await channel.assertQueue(queue, { durable: true });
  await channel.bindQueue(queue, exchange, queue);
  console.log(`🔔 Listening for messages on queue "${queue}"…`);

  await channel.consume(queue, async (msg) => {
    if (!msg) return;

    const payload = msg.content.toString();

    // ⛔️ Skip XML (heartbeat)
    if (payload.trim().startsWith('<')) {
      console.log("🔕 [DeleteUserConsumer] Ontvangen XML — wordt overgeslagen");
      return channel.ack(msg);
    }

    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) {
      console.error('❌ JSON parse error:', e.message);
      return channel.nack(msg, false, false);
    }

    console.log("📥 [DeleteUserConsumer] Ontvangen:", data);

    try {
      await salesforceClient.deleteUser(data.id);
      channel.ack(msg);
      console.log("✅ Gebruiker verwijderd uit Salesforce");
    } catch (err) {
      console.error("❌ Fout bij delete:", err.message);
      channel.nack(msg, false, false);
    }
  });
};
