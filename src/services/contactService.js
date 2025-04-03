const connectSalesforce = require("../config/salesforce");

async function handleCreateUser(data) {
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

  await conn.sobject("Contact").create({
    FirstName: data.FirstName,
    LastName: data.LastName,
    Email: data.EmailAddress,
    Phone: data.PhoneNumber,
    AccountId: accountId,
    UUID__c: parseInt(data.UUID),
  });

  console.log("✅ Contact succesvol aangemaakt:", data.FirstName, data.LastName);
}

async function handleUpdateUser(data) {
  const conn = await connectSalesforce();

  const existing = await conn
    .sobject("Contact")
    .findOne({ UUID__c: parseInt(data.UUID) });

  if (!existing) {
    console.warn("⚠️ Contact met UUID niet gevonden:", data.UUID);
    return;
  }

  await conn.sobject("Contact").update({
    Id: existing.Id,
    FirstName: data.FirstName,
    LastName: data.LastName,
    Email: data.EmailAddress,
    Phone: data.PhoneNumber,
  });

  console.log("✅ Contact succesvol geüpdatet:", data.FirstName);
}

async function handleDeleteUser(data) {
  const conn = await connectSalesforce();

  const existing = await conn
    .sobject("Contact")
    .findOne({ UUID__c: parseInt(data.UUID) });

  if (!existing) {
    console.warn("⚠️ Contact niet gevonden voor DELETE:", data.UUID);
    return;
  }

  await conn.sobject("Contact").destroy(existing.Id);
  console.log("🗑️ Contact succesvol verwijderd:", data.UUID);
}

module.exports = {
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
};

