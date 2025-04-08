const SalesForceClient = require('./connect');
const fetch = require('node-fetch');
const jest = require('jest-mock');


jest.mock('node-fetch');

describe('SalesForceClient', () => {
    beforeEach(() => {
        process.env.SALESFORCE_CLIENT_ID = '3MVG9k02hQhyUgQCUM7vsBnASLVAsKMWKio1zDb0WPAguLyeUpgku4KX1AZvop87M0dxb5hMW7ez8UjaiNJal';
        process.env.SALESFORCE_CLIENT_SECRET = '451EA70FF4E8199DCAB8085D94706578418C836ED57F3B7C3AB69FD45315E0E6';
        process.env.SALESFORCE_USERNAME = 'ehbintegrationproject2025@maildrop.cc';
        process.env.SALESFORCE_PASSWORD = 'T1M@stor';
        process.env.SALESFORCE_TOKEN = 'DL7VsRVdFUYH9Mn38x1IRhxMw';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should authenticate successfully', async () => {
        const mockResponse = {
            access_token: 'test_access_token',
            instance_url: 'https://test.salesforce.com'
        };

        fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue(mockResponse)
        });

        const client = new SalesForceClient();
        await client.authenticate();

        expect(client.accessToken).toBe(mockResponse.access_token);
        expect(client.instanceUrl).toBe(mockResponse.instance_url);
    });

    it('should throw an error if authentication fails', async () => {
        fetch.mockResolvedValue({
            json: jest.fn().mockResolvedValue({})
        });

        const client = new SalesForceClient();

        await expect(client.authenticate()).rejects.toThrow('Authentication failed');
    });
});