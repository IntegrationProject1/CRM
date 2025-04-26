module.exports = async function deleteEventConsumer(channel, exchange) {
    const queue = 'event_delete_queue';

    // Zorg ervoor dat de wachtrij bestaat
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, queue);
    console.log(`🔔 Luisteren naar berichten voor eventverwijdering op wachtrij "${queue}"…`);

    // Verwerk binnenkomende berichten
    await channel.consume(queue, async (msg) => {
        if (!msg) return;

        const payload = msg.content.toString();

        // Controleer of het bericht XML is
        if (payload.trim().startsWith('<')) {
            console.log("🔕 [DeleteEventConsumer] Ontvangen XML — verwerken van eventverwijdering.");

            const xml2js = require('xml2js');
            const parser = new xml2js.Parser();

            try {
                // Parseer de XML
                const result = await parser.parseStringPromise(payload);
                const deleteEvent = result.DeleteEvent;

                // Haal de UUID uit de XML voor verwijdering
                const eventUUID = deleteEvent.UUID[0];
                console.log("📥 [DeleteEventConsumer] Event UUID voor verwijdering:", eventUUID);

                // Verwerk de eventverwijdering (bijvoorbeeld verwijderen uit de database)

                channel.ack(msg);  // Bevestig dat het bericht is verwerkt
                console.log("✅ Event succesvol verwijderd.");
            } catch (err) {
                console.error("❌ Fout bij het parseren van XML:", err.message);
                channel.nack(msg, false, false);  // Markeer het bericht als niet verwerkt
            }
        } else {
            console.log("🔕 [DeleteEventConsumer] Bericht is geen XML, wordt overgeslagen.");
            channel.ack(msg);
        }
    });
};
