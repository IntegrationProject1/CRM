const xml2js = require("xml2js");
const { handleUpdateUser } = require("../services/contactService");

async function userUpdateConsumer(channel) {
  await channel.consume("crm_user_update", async (msg) => {
    if (msg !== null) {
      const xml = msg.content.toString();

      xml2js.parseString(xml, { explicitArray: false }, async (err, result) => {
        if (err) {
          console.error("❌ XML parsing error (update):", err);
          return channel.nack(msg);
        }

        const userMessage = result.UserMessage;

        if (userMessage.ActionType === "UPDATE") {
          console.log("📥 UPDATE ontvangen:", userMessage);
          await handleUpdateUser(userMessage);
        }

        channel.ack(msg);
      });
    }
  });

  console.log("👂 Luistert op crm_user_update");
}

module.exports = userUpdateConsumer;

