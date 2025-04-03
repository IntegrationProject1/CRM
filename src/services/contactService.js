const connectSalesforce = require("../config/salesforce");

async function handleCreateUser(data) {
  const conn = await connectSalesforce();

  // Check of Account bestaat (bedrijfsnaam)
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

  // Maak Contact aan
  await conn.sobject("Contact").create({
    FirstName: data.FirstName,
    LastName: data.LastName,
    Email: data.EmailAddress,
    Phone: data.PhoneNumber,
    AccountId: accountId,
    UUID__c: data.UUID // aan te maken als custom veld
  });

  console.log("✅ Contact succesvol aangemaakt:", data.FirstName, data.LastName);
}

module.exports = { handleCreateUser };
