const { sendLog, sendMessage} = require('../../publisher/logger');
const { validateXml } = require('../../utils/xmlValidator');
const { logger_logger } = require('../../utils/logger');

jest.mock('../../utils/xmlValidator');
jest.mock('../../utils/logger', () => ({
    logger_logger: {
        info: jest.fn(),
        error: jest.fn()
    }
}));

describe('logger.js - sendMessage', () => {
    const mockChannel = {
        assertExchange: jest.fn(),
        publish: jest.fn()
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should publish log message when XML is valid', async () => {
        validateXml.mockReturnValue(true);

        await sendMessage('info', '200', 'Test message');

        expect(mockChannel.assertExchange).toHaveBeenCalledWith('log_monitoring', 'direct', { durable: true });
        expect(validateXml).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('logger.xsd'));
        expect(mockChannel.publish).toHaveBeenCalled();
        expect(logger_logger.info).toHaveBeenCalledWith('Sending message', mockChannel, 'log_monitoring', 'CRM_Service', 'info');
    });

    test('should not publish if XML is invalid', async () => {
        validateXml.mockReturnValue(false);

        await sendMessage('info', '200', 'Invalid XML');

        expect(mockChannel.publish).not.toHaveBeenCalled();
        expect(logger_logger.error).toHaveBeenCalledWith('The XML is not valid against the XSD. Message NOT sent.');
    });
});
