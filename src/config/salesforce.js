const jsforce = require("jsforce");
require("dotenv").config();

async function connectSalesforce() {
  const conn = new jsforce.Connection({ loginUrl: process.env.SALESFORCE_LOGIN_URL });
  await conn.login(
    process.env.SALESFORCE_USERNAME,
    process.env.SALESFORCE_PASSWORD + process.env.SALESFORCE_TOKEN
  );
  console.log("✅ Verbonden met Salesforce");
  return conn;
}

module.exports = connectSalesforce;
