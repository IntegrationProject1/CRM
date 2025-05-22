const jsforce = require('jsforce');
const SalesforceClient = require('../../salesforceClient');

// Mock jsforce.Connection
jest.mock('jsforce', () => {
    const mockConn = {
        login: jest.fn(),
        sobject: jest.fn(),
        streaming: {
            createClient: jest.fn()
        },
        query: jest.fn()
    };
    return {
        Connection: jest.fn(() => mockConn)
    };
});

describe('SalesforceClient', () => {
    let client;
    let mockConn;

    beforeEach(() => {
        jest.clearAllMocks();
        client = new SalesforceClient('user', 'pass', 'token', 'loginUrl');
        mockConn = new jsforce.Connection();
    });

    test('login() should initialize connection and call login', async () => {
        await client.login();
        expect(jsforce.Connection).toHaveBeenCalledWith({ loginUrl: 'loginUrl' });
        expect(mockConn.login).toHaveBeenCalledWith('user', 'passtoken');
    });

    test('createUser() should call sobject.create', async () => {
        const mockCreate = jest.fn();
        mockConn.sobject.mockReturnValue({ create: mockCreate });

        await client.login(); // sets client.conn
        await client.createUser({ Name: 'Test User' });

        expect(mockConn.sobject).toHaveBeenCalledWith('Contact');
        expect(mockCreate).toHaveBeenCalledWith({ Name: 'Test User' });
    });

    test('updateUser() should call sobject.update', async () => {
        const mockUpdate = jest.fn();
        mockConn.sobject.mockReturnValue({ update: mockUpdate });

        await client.login();
        await client.updateUser('123', { Name: 'Updated User' });

        expect(mockConn.sobject).toHaveBeenCalledWith('Contact');
        expect(mockUpdate).toHaveBeenCalledWith({ Id: '123', Name: 'Updated User' });
    });

    test('deleteUser() should call sobject.destroy', async () => {
        const mockDestroy = jest.fn();
        mockConn.sobject.mockReturnValue({ destroy: mockDestroy });

        await client.login();
        await client.deleteUser('123');

        expect(mockConn.sobject).toHaveBeenCalledWith('Contact');
        expect(mockDestroy).toHaveBeenCalledWith('123');
    });

test('sObject() should return sobject reference', async () => {
    const mockSObjectRef = { find: jest.fn() };
    mockConn.sobject.mockReturnValue(mockSObjectRef);

    await client.login();
    const result = client.sObject('Account');

    expect(mockConn.sobject).toHaveBeenCalledWith('Account');
    expect(result).toBe(mockSObjectRef);
});

    test('query() should call conn.query and return result', async () => {
        const mockQueryResult = { records: [{ Id: '001' }] };
        mockConn.query.mockResolvedValue(mockQueryResult);

        await client.login();
        const result = await client.query('SELECT Id FROM Contact');

        expect(mockConn.query).toHaveBeenCalledWith('SELECT Id FROM Contact');
        expect(result).toBe(mockQueryResult);
    });
});
