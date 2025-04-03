const xml2js = require("xml2js");
const { handleCreateUser } = require("../services/contactService");

async function userConsumer(channel) {
  await channel.consume("crm_user_create", async (msg) => {
    if (msg !== null) {
      const xml = msg.content.toString();

      xml2js.parseString(xml, { explicitArray: false }, async (err, result) => {
        if (err) {
          console.error("❌ XML parsing error:", err);
          return channel.nack(msg);
        }

        const userMessage = result.UserMessage;

        if (userMessage.ActionType === "CREATE") {
          console.log("📥 CREATE ontvangen:", userMessage);
          await handleCreateUser(userMessage); // Salesforce-opslag
        }

        channel.ack(msg);
      });
    }
  });

  console.log("👂 Luistert op crm_user_create");
}

module.exports = userConsumer;
