const path = require('path');
const startHeartbeat = require('../../publisher/heartbeat');
const { validateXml } = require('../../utils/xmlValidator');

// Mocks
jest.mock('../../utils/xmlValidator');

describe('startHeartbeat', () => {
    const mockChannel = {
        assertExchange: jest.fn().mockResolvedValue(),
        publish: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // Mock timers voor setInterval
    });

    afterEach(() => {
        jest.useRealTimers(); // Zet timers terug normaal
    });

    test('should publish heartbeat if XML is valid', async () => {
        validateXml.mockReturnValue({ isValid: true });

        await startHeartbeat(mockChannel, 'heartbeatExchange', 'heartbeat.key', 'CRM_Service');

        // Simuleer setInterval trigger
        jest.runOnlyPendingTimers();

        const expectedXml = `
            <Heartbeat>
              <ServiceName>CRM_Service</ServiceName>
            </Heartbeat>`.trim();

        const expectedXsdPath = path.join(__dirname, '../../xsd/heartbeatXSD/heartbeat.xsd');

        expect(validateXml).toHaveBeenCalledWith(expectedXml, expectedXsdPath);
        expect(mockChannel.publish).toHaveBeenCalledWith(
            'heartbeatExchange',
            'heartbeat.key',
            Buffer.from(expectedXml)
        );
    });

    test('should not publish heartbeat if XML is invalid', async () => {
        validateXml.mockReturnValue({ 
            isValid: false,
            errorType: 'error',
            errorCode: '400',
            errorMessage: 'XML validation failed',
            validationErrors: ['Invalid XML structure']
        });

        await startHeartbeat(mockChannel, 'heartbeatExchange', 'heartbeat.key', 'CRM_Service');

        // Simuleer setInterval trigger
        jest.runOnlyPendingTimers();

        const expectedXml = `
            <Heartbeat>
              <ServiceName>CRM_Service</ServiceName>
            </Heartbeat>`.trim();

        const expectedXsdPath = path.join(__dirname, '../../xsd/heartbeatXSD/heartbeat.xsd');

        expect(validateXml).toHaveBeenCalledWith(expectedXml, expectedXsdPath);
        expect(mockChannel.publish).not.toHaveBeenCalled();
    });
});
