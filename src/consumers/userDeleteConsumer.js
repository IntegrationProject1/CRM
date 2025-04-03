const xml2jsDel = require("xml2js");
const { handleDeleteUser } = require("../services/contactService");

async function userDeleteConsumer(channel) {
  await channel.consume("crm_user_delete", async (msg) => {
    if (msg !== null) {
      const xml = msg.content.toString();

      xml2jsDel.parseString(xml, { explicitArray: false }, async (err, result) => {
        if (err) {
          console.error("❌ XML parsing error (delete):", err);
          return channel.nack(msg);
        }

        const userMessage = result.UserMessage;

        if (userMessage.ActionType === "DELETE") {
          console.log("📥 DELETE ontvangen:", userMessage);
          await handleDeleteUser(userMessage, channel); // 👈 channel meegeven
        }

        channel.ack(msg);
      });
    }
  });

  console.log("👂 Luistert op crm_user_delete");
}

module.exports = userDeleteConsumer;
