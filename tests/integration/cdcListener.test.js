const { startCDCListener } = require('../../cdcListener');
const EventEmitter = require('events');

jest.mock('../../xmlValidator', () => ({
  validateXml: () => true
}));

jest.mock('../../xmlJsonTranslator', () => ({
  jsonToXml: () => '<xml>stub</xml>'
}));

class FakeCDCClient extends EventEmitter {
  subscribe(_channel, callback) {
    this.on('message', callback);
  }
}

let simulatedUUID = null;

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
    simulatedUUID = Date.now(); // unieke UUID
    cdcClient = mockSalesforceClient.createCDCClient();

    fakeChannel = {
      assertExchange: jest.fn(),
      publish: jest.fn()
    };
  });

  it('✅ verwerkt een CREATE CDC-event en roept RabbitMQ publish correct aan', async () => {
    await startCDCListener(mockSalesforceClient, fakeChannel, cdcClient); // geef cdcClient expliciet mee

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

    // ⏱️ Simuleer na de listener gestart is
    cdcClient.emit('message', fakeEvent);

    await new Promise(resolve => setTimeout(resolve, 500)); // verhoog timeout

    expect(fakeChannel.publish).toHaveBeenCalledTimes(3);
    expect(fakeChannel.publish).toHaveBeenCalledWith('user', 'frontend.user.create', expect.any(Buffer));
    expect(fakeChannel.publish).toHaveBeenCalledWith('user', 'facturatie.user.create', expect.any(Buffer));
    expect(fakeChannel.publish).toHaveBeenCalledWith('user', 'kassa.user.create', expect.any(Buffer));
  });
});
