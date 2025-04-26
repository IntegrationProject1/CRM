module.exports = async function updateEventConsumer(channel, exchange) {
    const queue = 'event_update_queue';

    // Zorg ervoor dat de wachtrij bestaat
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, queue);
    console.log(`🔔 Luisteren naar berichten voor eventupdate op wachtrij "${queue}"…`);

    // Verwerk binnenkomende berichten
    await channel.consume(queue, async (msg) => {
        if (!msg) return;

        const payload = msg.content.toString();

        // Controleer of het bericht XML is
        if (payload.trim().startsWith('<')) {
            console.log("🔕 [UpdateEventConsumer] Ontvangen XML — verwerken van eventupdate.");

            const xml2js = require('xml2js');
            const parser = new xml2js.Parser();

            try {
                // Parseer de XML
                const result = await parser.parseStringPromise(payload);
                const updateEvent = result.UpdateEvent;

                // Haal de gegevens uit de XML
                const eventData = {
                    UUID: updateEvent.UUID[0],
                    FieldsToUpdate: updateEvent.FieldsToUpdate[0].Field.map(field => ({
                        Name: field.Name[0],
                        NewValue: field.NewValue[0]
                    }))
                };

                console.log("📥 [UpdateEventConsumer] Verwerkte update eventgegevens:", eventData);

                // Verwerk de eventupdate (bijvoorbeeld updaten in de database)

                channel.ack(msg);  // Bevestig dat het bericht is verwerkt
                console.log("✅ Event succesvol geüpdatet.");
            } catch (err) {
                console.error("❌ Fout bij het parseren van XML:", err.message);
                channel.nack(msg, false, false);  // Markeer het bericht als niet verwerkt
            }
        } else {
            console.log("🔕 [UpdateEventConsumer] Bericht is geen XML, wordt overgeslagen.");
            channel.ack(msg);
        }
    });
};
