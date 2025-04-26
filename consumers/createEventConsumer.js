module.exports = async function createEventConsumer(channel, exchange) {
    const queue = 'event_create_queue';

    // Zorg ervoor dat de wachtrij bestaat
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, queue);
    console.log(`🔔 Luisteren naar berichten voor eventcreatie op wachtrij "${queue}"…`);

    // Verwerk binnenkomende berichten
    await channel.consume(queue, async (msg) => {
        if (!msg) return;

        const payload = msg.content.toString();

        // Controleer of het bericht XML is
        if (payload.trim().startsWith('<')) {
            console.log("🔕 [CreateEventConsumer] Ontvangen XML — verwerken van eventcreatie.");

            const xml2js = require('xml2js');
            const parser = new xml2js.Parser();

            try {
                // Parseer de XML
                const result = await parser.parseStringPromise(payload);
                const event = result.Event;

                // Haal gegevens uit de XML
                const eventData = {
                    UUID: event.UUID[0],
                    Name: event.Name[0],
                    Description: event.Description[0],
                    StartDateTime: event.StartDateTime[0],
                    EndDateTime: event.EndDateTime[0],
                    Location: event.Location[0],
                    Organisator: event.Organisator[0],
                    Capacity: parseInt(event.Capacity[0], 10),
                    EventType: event.EventType[0],
                    RegisteredUsers: event.RegisteredUsers?.[0]?.User?.map(user => ({
                        UUID: user.UUID[0],
                        Name: user.Name[0]
                    })) || [],
                };

                console.log("📥 [CreateEventConsumer] Verwerkte eventgegevens:", eventData);

                // Verwerk de eventdata (bijvoorbeeld opslaan in een database)

                channel.ack(msg);  // Bevestig dat het bericht is verwerkt
                console.log("✅ Event succesvol aangemaakt.");
            } catch (err) {
                console.error("❌ Fout bij het parseren van XML:", err.message);
                channel.nack(msg, false, false);  // Markeer het bericht als niet verwerkt
            }
        } else {
            console.log("🔕 [CreateEventConsumer] Bericht is geen XML, wordt overgeslagen.");
            channel.ack(msg);
        }
    });
};
