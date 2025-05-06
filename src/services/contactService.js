const connectSalesforce = require("../config/salesforce");

async function sendLog(channel, type, uuid, status) {
  const logMessage = JSON.stringify({
    source: "CRM",
    type,
    uuid,
    status,
    timestamp: new Date().toISOString(),
  });
  await channel.assertQueue("crm_log", { durable: true });
  channel.sendToQueue("crm_log", Buffer.from(logMessage));
}

async function handleCreateUser(data, channel = null) {
  const conn = await connectSalesforce();

  let accountId = null;
  if (data.Business && data.Business.BusinessName) {
    const existing = await conn
      .sobject("Account")
      .find({ Name: data.Business.BusinessName })
      .limit(1);

    if (existing.length > 0) {
      accountId = existing[0].Id;
    } else {
      const account = await conn.sobject("Account").create({
        Name: data.Business.BusinessName,
        BillingStreet: data.Business.RealAddress,
        BillingCity: "N/A",
        BillingCountry: "N/A",
      });
      accountId = account.id;
    }
  }

  try {
    await conn.sobject("Contact").create({
      FirstName: data.FirstName,
      LastName: data.LastName,
      Email: data.EmailAddress,
      Phone: data.PhoneNumber,
      AccountId: accountId,
      UUID__c: parseInt(data.UUID),
    });

    console.log("✅ Contact succesvol aangemaakt:", data.FirstName, data.LastName);
    if (channel) await sendLog(channel, "CREATE", data.UUID, "SUCCESS");
  } catch (err) {
    console.error("❌ Fout bij CREATE:", err?.errorCode || err.message);
    if (channel) await sendLog(channel, "CREATE", data.UUID, err?.errorCode || "ERROR");
  }
}

async function handleUpdateUser(data, channel = null) {
  const conn = await connectSalesforce();

  const existing = await conn
    .sobject("Contact")
    .findOne({ UUID__c: parseInt(data.UUID) });

  if (!existing) {
    console.warn("⚠️ Contact met UUID niet gevonden:", data.UUID);
    if (channel) await sendLog(channel, "UPDATE", data.UUID, "NOT_FOUND");
    return;
  }

  try {
    await conn.sobject("Contact").update({
      Id: existing.Id,
      FirstName: data.FirstName,
      LastName: data.LastName,
      Email: data.EmailAddress,
      Phone: data.PhoneNumber,
    });

    console.log("✅ Contact succesvol geüpdatet:", data.FirstName);
    if (channel) await sendLog(channel, "UPDATE", data.UUID, "SUCCESS");
  } catch (err) {
    console.error("❌ Fout bij UPDATE:", err?.errorCode || err.message);
    if (channel) await sendLog(channel, "UPDATE", data.UUID, err?.errorCode || "ERROR");
  }
}

async function handleDeleteUser(data, channel = null) {
  const conn = await connectSalesforce();

  const existing = await conn
    .sobject("Contact")
    .findOne({ UUID__c: parseInt(data.UUID) });

  if (!existing) {
    console.warn("⚠️ Contact niet gevonden voor DELETE:", data.UUID);
    if (channel) await sendLog(channel, "DELETE", data.UUID, "NOT_FOUND");
    return;
  }

  try {
    await conn.sobject("Contact").destroy(existing.Id);
    console.log("🗑️ Contact succesvol verwijderd:", data.UUID);
    if (channel) await sendLog(channel, "DELETE", data.UUID, "SUCCESS");
  } catch (err) {
    console.error("❌ Fout bij DELETE:", err?.errorCode || err.message);
    if (channel) await sendLog(channel, "DELETE", data.UUID, err?.errorCode || "ERROR");
  }
}

module.exports = {
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
};
