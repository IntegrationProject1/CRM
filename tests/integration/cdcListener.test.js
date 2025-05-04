const { startCDCListener } = require('../../cdcListener');
const EventEmitter = require('events');

jest.mock('../../xmlValidator', () => ({
  validateXml: () => true
}));

jest.mock('../../xmlJsonTranslator', () => ({
  jsonToXml: () => '<xml>stub</xml>'
}));

// Fake CDC client
class FakeCDCClient extends EventEmitter {
  subscribe(channel, callback) {
    this.on('message', callback);
  }
}

// Simuleer opslag
let simulatedUUID = null;

// Mocked Salesforce Client
const mockUpdateUser = jest.fn().mockImplementation((_id, body) => {
  simulatedUUID = body.UUID__c;
  return Promise.resolve();
});

const mockSalesforceClient = {
  createCDCClient: () => new FakeCDCClient(),
  updateUser: mockUpdateUser,
  sObject: () => ({
    retrieve: () => Promise.resolve({ UUID__c: simulatedUUID })
  })
};

describe('CDC Listener Integration Test', () => {
  let cdcClient;
  let fakeChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    simulatedUUID = Date.now(); // elke test unieke UUID
    cdcClient = mockSalesforceClient.createCDCClient();

    fakeChannel = {
      assertExchange: jest.fn(),
      publish: jest.fn()
    };
  });

  it('✅ verwerkt een CREATE CDC-event en roept RabbitMQ publish correct aan', async () => {
    await startCDCListener(mockSalesforceClient, fakeChannel);

    const fakeEvent = {
      payload: {
        ChangeEventHeader: {
          changeType: 'CREATE',
          recordIds: ['001XYZ123']
        },
        FirstName: 'Jane',
        LastName: 'Doe',
        Email: 'jane.doe@example.com',
        Phone: '123456789'
      }
    };

    cdcClient.emit('message', fakeEvent);

    await new Promise(resolve => setTimeout(resolve, 300)); // lang genoeg voor async flow

    expect(fakeChannel.publish).toHaveBeenCalledTimes(3);
    expect(fakeChannel.publish).toHaveBeenCalledWith(
      'user',
      'frontend.user.create',
      expect.any(Buffer)
    );
    expect(fakeChannel.publish).toHaveBeenCalledWith(
      'user',
      'facturatie.user.create',
      expect.any(Buffer)
    );
    expect(fakeChannel.publish).toHaveBeenCalledWith(
      'user',
      'kassa.user.create',
      expect.any(Buffer)
    );
  });
});
