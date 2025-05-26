/**
 * Salesforce CDC Listener
 * @module cdcListener
 * @file cdc/cdcListener.js
 * @description Listens to Salesforce Change Data Capture (CDC) events and processes them using the appropriate handlers.
 * @requires ContactCDCHandler - A handler for processing Contact CDC events.
 */

const ContactCDCHandler = require('./ContactCDCHandler'); // ✅ importeer de handler

let subscription; // 🔁 globale verwijzing voor stop()<

/**
 * Start the Salesforce CDC Listener.
 * @param {Object} sfClient - Logged-in SalesforceClient instance.
 * @param {Object} channel - RabbitMQ channel.
 * @returns {Promise<void>} - A promise that resolves when the listener has started.
 * @example
 * startCDCListener(sfClient, channel)
 *  .then(() => console.log("CDC Listener started"))
 *  .catch(err => console.error("Error starting CDC Listener:", err));
 */
async function startCDCListener(sfClient, channel) {
  try {
    const topic = sfClient.streaming.topic("/data/ContactChangeEvent");

    subscription = topic.subscribe((message) => {
      console.log("CDC event received:", message);
      ContactCDCHandler(message, sfClient, channel);
    });

    console.log("CDC Listener active on /data/ContactChangeEven");
  } catch (err) {
    console.error("Error starting CDC Listener:", err.message);
    throw err;
  }
}

/**
 * Stop the active CDC listener (e.g., after a test).
 * @returns {Promise<void>} - A promise that resolves when the listener has stopped.
 * @example
 * stopCDCListener()
 *  .then(() => console.log("CDC Listener stopped"))
 *  .catch(err => console.error("Error stopping CDC Listener:", err));
 */
async function stopCDCListener() {
  if (subscription) {
    await subscription.cancel();
    console.log("CDC Listener stopped");
  }
}

module.exports = { startCDCListener, stopCDCListener };
