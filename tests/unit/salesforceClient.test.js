const SalesforceClient = require('../../salesforceClient');

// const sfClient = new SalesforceClient(
//     process.env.SALESFORCE_USERNAME,
//     process.env.SALESFORCE_PASSWORD,
//     process.env.SALESFORCE_TOKEN,
//     process.env.SALESFORCE_LOGIN_URL
// );

// Dummy test credentials:
const TEST_USERNAME = process.env.SALESFORCE_USERNAME;
const TEST_PASSWORD = process.env.SALESFORCE_PASSWORD;
const TEST_TOKEN = process.env.SALESFORCE_TOKEN;
const LOGIN_URL = process.env.SALESFORCE_LOGIN_URL;

describe('SalesforceClient (Echte integratietests)', () => {
    let client;

    beforeAll(async () => {
        client = new SalesforceClient(TEST_USERNAME, TEST_PASSWORD, TEST_TOKEN, LOGIN_URL);
        await client.login();
    });

    it('moet succesvol inloggen op Salesforce', () => {
        expect(client.conn).toBeDefined();
        expect(client.conn.accessToken).toBeDefined();
    });

    it('moet een nieuwe Contact aanmaken in Salesforce', async () => {
        const testContact = {
            FirstName: 'Mickle',
            LastName: 'Jacson',
            Email: 'mickle.jacson@gmail.com'
        };

        const result = await client.createUser(testContact);
        expect(result).toBeUndefined(); // omdat de functie geen waarde teruggeeft
    });

    it('moet een bestaande Contact bijwerken', async () => {
        const contacts = await client.query("SELECT Id FROM Contact WHERE Email = 'mickle.jacson@gmail.com' LIMIT 1");
        const contact = contacts.records[0];
        expect(contact).toBeDefined();

        await client.updateUser(contact.Id, { LastName: 'Bijgewerkt' });
    });

    it('moet een Contact verwijderen', async () => {
        const contacts = await client.query("SELECT Id FROM Contact WHERE Email = 'mickle.jacson@gmail.com' LIMIT 1");
        const contact = contacts.records[0];
        expect(contact).toBeDefined();

        await client.deleteUser(contact.Id);
    });
});
