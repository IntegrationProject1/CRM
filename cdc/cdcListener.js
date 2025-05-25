/**
 * Salesforce CDC Listener
 * @module cdcListener
 * @file cdc/cdcListener.js
 */

const ContactCDCHandler = require('./ContactCDCHandler'); // ✅ importeer de handler

let subscription; // 🔁 globale verwijzing voor stop()

/**
 * Start de Salesforce CDC Listener
 * @param {Object} sfClient - Ingelogde SalesforceClient instantie
 * @param {Object} channel - RabbitMQ kanaal
 * @returns {Promise<void>} - Een belofte die wordt vervuld wanneer de listener is gestart
 */
async function startCDCListener(sfClient, channel) {
  try {
    const topic = sfClient.streaming.topic("/data/ContactChangeEvent");

    subscription = topic.subscribe((message) => {
      console.log("📡 CDC event ontvangen:", message);
      ContactCDCHandler(message, sfClient, channel);
    });

    console.log("✅ CDC Listener actief op /data/ContactChangeEvent");
  } catch (err) {
    console.error("❌ Fout bij starten van CDC Listener:", err.message);
    throw err;
  }
}

/**
 * Stop de actieve CDC listener (bijv. na een test)
 */
async function stopCDCListener() {
  if (subscription) {
    await subscription.cancel();
    console.log("🛑 CDC Listener gestopt");
  }
}

module.exports = { startCDCListener, stopCDCListener };
