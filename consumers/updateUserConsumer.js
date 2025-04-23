module.exports = async function updateUserConsumer(channel, salesforceClient, exchange) {
  const queue = 'crm_user_update';

  await channel.assertQueue(queue, { durable: true });
  await channel.bindQueue(queue, exchange, queue);
  console.log(`🔔 Listening for messages on queue "${queue}"…`);

  await channel.consume(queue, async (msg) => {
    if (!msg) return;

    const payload = msg.content.toString();

    if (payload.trim().startsWith('<')) {
      console.log("🔕 [UpdateUserConsumer] Ontvangen XML — wordt overgeslagen");
      return channel.ack(msg);
    }

    let data;
    try {
      data = JSON.parse(payload);
    } catch (e) {
      console.error('❌ JSON parse error:', e.message);
      return channel.nack(msg, false, false);
    }

    console.log("📥 [UpdateUserConsumer] Ontvangen:", data);

    try {
      await salesforceClient.updateUser(data.id, {
        FirstName: data.FirstName,
        LastName: data.LastName,
        // Voeg hier meer velden toe indien nodig
      });
      channel.ack(msg);
      console.log("✅ Gebruiker geüpdatet in Salesforce");
    } catch (err) {
      console.error("❌ Fout bij update:", err.message);
      channel.nack(msg, false, false);
    }
  });
};
