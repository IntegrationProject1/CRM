require('dotenv').config();

const pino = require('pino');

function createTransport(logFilePath, level) {
    return pino.transport({
        targets: [
            {
                target: 'pino-pretty',
                level: level,
                options: {
                    destination: logFilePath,
                    mkdir: true,
                    colorize: false,
                },
            },
            {
                target: 'pino-pretty',
                options: {
                    destination: 1,
                }
            },
        ]
    });
}

function createLogger(name, level, logFilePath) {
    return pino({
        name: name,
        level: level.toLowerCase(), // Normalize level to lowercase
        mixin() {
            return { service: 'CRM_Service' };
        },
        timestamp: pino.stdTimeFunctions.isoTime,
    }, createTransport(logFilePath, level));
}

function wrapLoggerWithStatusCode(logger) {
    const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
    levels.forEach(level => {
        const originalMethod = logger[level];
        logger[level] = (message, statusCode) => {
            if (statusCode) {
                logger.child({ statusCode })[level](message);
            } else {
                originalMethod.call(logger, message);
            }
        };
    });
    return logger;
}

console.log(`Log Level: ${process.env.LOG_LEVEL}`);
console.log(`Log File: ${process.env.GENERAL_LOG_FILE}`);

const general_logger = wrapLoggerWithStatusCode(
    createLogger('general', process.env.LOG_LEVEL, process.env.GENERAL_LOG_FILE)
);
const heartbeat_logger = wrapLoggerWithStatusCode(
    createLogger('heartbeat', process.env.LOG_LEVEL, process.env.HEARTBEAT_LOG_FILE)
);
const user_logger = wrapLoggerWithStatusCode(
    createLogger('user', process.env.LOG_LEVEL, process.env.USER_LOG_FILE)
);
const event_logger = wrapLoggerWithStatusCode(
    createLogger('event', process.env.LOG_LEVEL, process.env.EVENT_LOG_FILE)
);
const session_logger = wrapLoggerWithStatusCode(
    createLogger('session', process.env.LOG_LEVEL, process.env.SESSION_LOG_FILE)
);

module.exports = {
    general_logger,
    heartbeat_logger,
    user_logger,
    event_logger,
    session_logger
};