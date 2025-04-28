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
    this.conn = new jsforce.Connection({loginUrl: this.loginUrl});
    await this.conn.login(this.username, this.password + this.token);
    console.log('✅ Ingelogd bij Salesforce via jsforce');
  }

  createCDCClient() {
    return this.conn.streaming.createClient();
  }

  async createUser(data) {
    const result = await this.conn.sobject('Contact').create(data);
    console.log('[CREATE] Salesforce:', result);
  }

  async updateUser(id, data) {
    const result = await this.conn.sobject('Contact').update({Id: id, ...data});
    console.log('[UPDATE] Salesforce:', result);
  }

  async deleteUser(id) {
    const result = await this.conn.sobject('Contact').destroy(id);
    console.log('[DELETE] Salesforce:', result);
  }

  sObject(sObjectName) {
    return this.conn.sobject(sObjectName);
  }

  async query(query) {
    const result = await this.conn.query(query);
    console.log('[QUERY] Salesforce:', result);
    return result;
  }

// EVENT CRUD OPERATIONS


// Retrieve an Event by Id
  async getEvent(id) {
    const result = await this.conn.sobject('Event').retrieve(id);
    return result;
  }

// Update an Event by Id
  async updateEvent(id, data) {
    const result = await this.conn.sobject('Event').update({ Id: id, ...data });
    return result;
  }

// Retrieve a deleted Event by Id (use query, not queryAll)
  async getDeletedEvent(id) {
    const result = await this.conn.query(
        `SELECT EventID__c, Subject, StartDateTime, EndDateTime FROM Event WHERE Id = '${id}' AND IsDeleted = true`
    );
    return result.records[0];
  }



}

module.exports = SalesforceClient;
