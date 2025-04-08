const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

class SalesForceClient {
    constructor() {
        this.apiVersion = 'v59.0';
        this.authenticate();
    }

    async authenticate() {
        const clientId = process.env.SALESFORCE_CLIENT_ID;
        const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
        const username = process.env.SALESFORCE_USERNAME;
        const password = process.env.SALESFORCE_PASSWORD;
        const securityToken = process.env.SALESFORCE_TOKEN;

        const tokenUrl = 'https://login.salesforce.com/services/oauth2/token';
        const authPayload = new URLSearchParams({
            grant_type: 'password',
            client_id: clientId,
            client_secret: clientSecret,
            username: username,
            password: password + securityToken
        });

        try {
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: authPayload
            });

            const authJson = await response.json();

            if (!authJson.access_token || !authJson.instance_url) {
                throw new Error(`Authentication failed: ${JSON.stringify(authJson)}`);
            }

            this.accessToken = authJson.access_token;
            this.instanceUrl = authJson.instance_url;

        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }
}

module.exports = SalesForceClient;