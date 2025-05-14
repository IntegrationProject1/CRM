/**
 * Logger module for CRM Service
 */


require('dotenv').config();
const pino = require('pino');


/**
 * Creates transport for the logger.
 * (this mean where the logs are written to)
 * @param {string} logFilePath - Path to the log file.
 * @param {string} level - Log level (e.g., 'info', 'error').
 * @return {Object} Pino transport object.
 */
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
            //
            {
                target: 'pino-pretty',
                options: {
                    destination: 1,
                }
            },
        ]
    });
}

/**
 * Creates a logger instance.
 * (this mean the logger itself)
 * @param {string} name - Name of the logger.
 * @param {string} level - Log level (e.g., 'info', 'error').
 * @param {string} logFilePath - Path to the log file.
 * @return {Object} Pino logger instance.
 */
function createLogger(name, level = 'info', logFilePath) {
    return pino({
        name: name,
        level: level.toLowerCase(), // Normalize level to lowercase
        // mixin() {
        //     return { service: 'CRM_Service' };
        // },
        // replace parts of password with asterisks and remove sensitive data
        redact: {
            paths: ['password', 'token'],
            censor: '*****',
        },
        timestamp: pino.stdTimeFunctions.isoTime,
    }, createTransport(logFilePath, level));
}

/**
 * Wraps the logger with a status code.
 * (this means that the logger can log with a status code but is not required)
 * @param {Object} logger - Pino logger instance.
 * @return {Object} Wrapped logger instance.
 */
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

/**
 * Logger for general service events.
 * (e.g., startup, shutdown)
 * @type {Object}
 * @example
 * general_logger.info('Service started');
 * @example
 * general_logger.info('Service error', "200");
 */
const general_logger = wrapLoggerWithStatusCode(
    createLogger('general', process.env.LOG_LEVEL, process.env.GENERAL_LOG_FILE)
);
/**
 * Logger for heartbeat messages.
 * (e.g., heartbeat messages)
 * @type {Object}
 * @example
 * heartbeat_logger.info('Heartbeat message');
 * @example
 * heartbeat_logger.error('Heartbeat error', "500");
 */
const heartbeat_logger = wrapLoggerWithStatusCode(
    createLogger('heartbeat', process.env.LOG_LEVEL, process.env.HEARTBEAT_LOG_FILE)
);
/**
 * Logger for user-related events.
 * (e.g., user creation, update, deletion)
 * @type {Object}
 * @example
 * user_logger.info('User created');
 * @example
 * user_logger.error('User error', "500");
 */
const user_logger = wrapLoggerWithStatusCode(
    createLogger('user', process.env.LOG_LEVEL, process.env.USER_LOG_FILE)
);
/**
 * Logger for event-related events.
 * (e.g., event creation, update, deletion)
 * @type {Object}
 * @example
 * event_logger.info('Event created');
 * @example
 * event_logger.error('Event error', "500");
 */
const event_logger = wrapLoggerWithStatusCode(
    createLogger('event', process.env.LOG_LEVEL, process.env.EVENT_LOG_FILE)
);
/**
 * Logger for session-related events.
 * (e.g., session creation, update, deletion)
 * @type {Object}
 * @example
 * session_logger.info('Session created');
 * @example
 * session_logger.error('Session error', "500");
 */
const session_logger = wrapLoggerWithStatusCode(
    createLogger('session', process.env.LOG_LEVEL, process.env.SESSION_LOG_FILE)
);
/**
 * Logger for other objects.
 * (e.g., other objects)
 * @type {Object}
 * @example
 * logger_logger.info('Other object created');
 * @example
 * logger_logger.error('Other object error', "500");
 */
const logger_logger = wrapLoggerWithStatusCode(
    createLogger('logger', process.env.LOG_LEVEL, process.env.LOGGER_LOG_FILE)
);
// general_logger.info('Logger initialized', "200");
//
// general_logger.error('Logger error', "500");
module.exports = {
    general_logger,
    heartbeat_logger,
    user_logger,
    event_logger,
    session_logger,
    logger_logger
};