const jsforce = require('jsforce');

class SalesforceClient {
  constructor(username, password, token, loginUrl) {
    this.username = username;
    this.password = password;
    this.token = token;
    this.loginUrl = loginUrl;
    this.conn = null;
  }

  async login() {
    this.conn = new jsforce.Connection({ loginUrl: this.loginUrl });
    await this.conn.login(this.username, this.password + this.token);
    console.log('✅ Ingelogd bij Salesforce via jsforce');
  }

  async createUser(data) {
    const result = await this.conn.sobject('Contact').create(data);
    console.log('[CREATE] Salesforce:', result);
  }

  async updateUser(id, data) {
    const result = await this.conn.sobject('Contact').update({ Id: id, ...data });
    console.log('[UPDATE] Salesforce:', result);
  }

  async deleteUser(id) {
    const result = await this.conn.sobject('Contact').destroy(id);
    console.log('[DELETE] Salesforce:', result);
  }
}

module.exports = SalesforceClient;
