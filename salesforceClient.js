/**
 * @module SalesforceClient
 * @description Beheert de verbinding met Salesforce en biedt methoden voor CRUD-operaties op Salesforce-objecten.
 */

const jsforce = require('jsforce');

class SalesforceClient {
   /**
    * Maakt een nieuwe SalesforceClient aan.
    * @param {string} username - De gebruikersnaam voor Salesforce.
    * @param {string} password - Het wachtwoord voor Salesforce.
    * @param {string} token - De beveiligingstoken voor Salesforce.
    * @param {string} loginUrl - De login-URL voor Salesforce.
    */
   constructor(username, password, token, loginUrl) {
      this.username = username;
      this.password = password;
      this.token = token;
      this.loginUrl = loginUrl;
      this.conn = null;
   }

   /**
    * Logt in bij Salesforce en initialiseert de verbinding.
    * @returns {Promise<void>} - Een belofte die wordt vervuld na succesvolle login.
    */
   async login() {
      this.conn = new jsforce.Connection({loginUrl: this.loginUrl});
      await this.conn.login(this.username, this.password + this.token);
         this.streaming = this.conn.streaming; // nodig voor CDC voor e2e
      console.log('✅ Ingelogd bij Salesforce via jsforce');
   }

   /**
    * Maakt een Streaming API-client voor het luisteren naar Salesforce CDC-events.
    * @returns {Object} - De Streaming API-client.
    */
   createCDCClient() {
      return this.conn.streaming.createClient();
   }

   // ----------- USER (Contact) CRUD ------------

   async createUser(data) {
      const result = await this.conn.sobject('Contact').create(data);
      console.log('[CREATE] Salesforce:', result);
        return result; // ✅ BELANGRIJK!

   }

   async updateUser(id, data) {
      const result = await this.conn.sobject('Contact').update({Id: id, ...data});
      console.log('[UPDATE] Salesforce:', result);
   }

   async deleteUser(id) {
      const result = await this.conn.sobject('Contact').destroy(id);
      console.log('[DELETE] Salesforce:', result);
      // ----------- EVENT (Event__c) CRUD ------------
   }
   async createEvent(data) {
      const result = await this.conn.sobject('Event__c').create(data);
      console.log('[CREATE] Salesforce Event:', result);
      return result;
   }

   async updateEvent(id, data) {
      const result = await this.conn.sobject('Event__c').update({Id: id, ...data});
      console.log('[UPDATE] Salesforce Event:', result);
      return result;
   }

   async deleteEvent(id) {
      const result = await this.conn.sobject('Event__c').destroy(id);
      console.log('[DELETE] Salesforce Event:', result);
      return result;
   }

   /**
    * Retourneert een sObject-referentie voor een specifiek Salesforce-objecttype.
    * @param {string} sObjectName - De naam van het Salesforce-objecttype.
    * @returns {Object} - De sObject-referentie.
    */
   sObject(sObjectName) {
      return this.conn.sobject(sObjectName);
   }

   /**
    * Voert een SOQL-query uit in Salesforce.
    * @param {string} query - De SOQL-querystring.
    * @returns {Promise<Object>} - Het resultaat van de query.
    */
   async query(query) {
      const result = await this.conn.query(query);
      console.log('[QUERY] Salesforce:', result);
      return result;
   }
}

module.exports = SalesforceClient;
