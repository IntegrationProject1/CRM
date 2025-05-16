# CRM Microservice

## Description
The CRM Microservice is responsible for managing customer relationship data by integrating with RabbitMQ and Salesforce. It includes features like CDC (Change Data Capture) listeners, user consumers, and a heartbeat publisher.

## Features
- RabbitMQ integration for message handling.
- Salesforce integration for CRM operations.
- CDC listeners for real-time updates.
- Heartbeat publisher for service monitoring.

## Installation

1. Clone the repository:
   ```bash
   git clone "https://github.com/IntegrationProject1/CRM.git"
   cd CRM
    ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
    Create a `.env` file in the root directory and add the following variables:
    ```env
   # ─── Salesforce Configuration ────────────────────────────────────────────────
    SALESFORCE_CLIENT_ID=your_salesforce_client_id
    SALESFORCE_CLIENT_SECRET=your_salesforce_client_secret
    SALESFORCE_USERNAME=your_salesforce_username
    SALESFORCE_PASSWORD=your_salesforce_password
    SALESFORCE_TOKEN=your_salesforce_token
    SALESFORCE_LOGIN_URL=https://login.salesforce.com
    SALESFORCE_URL=your_salesforce_instance_url
    SALESFORCE_ACCESS_TOKEN=your_salesforce_access_token
    
    # ─── RabbitMQ Configuration ──────────────────────────────────────────────────
    RABBITMQ_HOST=your_rabbitmq_host
    RABBITMQ_PORT=your_rabbitmq_port
    RABBITMQ_USERNAME=your_rabbitmq_username
    RABBITMQ_PASSWORD=your_rabbitmq_password
    
    # ─── RabbitMQ Exchanges and Queues ───────────────────────────────────────────
    RABBITMQ_EXCHANGE_HEARTBEAT=your_heartbeat_exchange
    RABBITMQ_EXCHANGE_CRUD=your_crud_exchange
    RABBITMQ_ROUTING_KEY_HEARTBEAT=your_heartbeat_routing_key
    RABBITMQ_QUEUE_HEARTBEAT=your_heartbeat_queue
    
    # ─── RabbitMQ Queues ──────────────────────────────────────────────────────
    LOG_LEVEL=debug
    GENERAL_LOG_FILE=logs/general.log
    HEARTBEAT_LOG_FILE=logs/heartbeat.log
    USER_LOG_FILE=logs/user.log
    EVENT_LOG_FILE=logs/event.log
    SESSION_LOG_FILE=logs/session.log
    LOGGER_LOG_FILE=logs/logger.log
    ```
## Usage
1. start the CRM microservice:
   ```bash
   npm start
   ```
   or
    ```bash
    node index.js
    ```
2. run the tests:
   ```bash
    npm test
    ```
3. Generate the documentation:
   ```bash
   jsdoc -c jsdoc.json
   ```
4. Access the documentation:
   Open `docs/index.html` in your web browser.

## Project Structure
- `index.js` - Entry point for the microservice.
- `package.json` - Contains project metadata and dependencies.
- `package-lock.json` - Contains the exact versions of dependencies.
- `.env` - Environment variables for configuration.
- `.gitignore` - Specifies files to ignore in version control.
- `jsdoc.json` - Configuration for JSDoc documentation generation.
- `docker-compose.yml` - Docker Compose file for container orchestration.
- `docker-compose.rabbitmq.yml` - Docker Compose file for RabbitMQ setup. (if you don't have RabbitMQ running)
- `dockerfile` - Dockerfile for building the microservice image.
- `README.md` - Project documentation.
- `.github/` - Contains GitHub Actions workflows.
- `docs/` - Contains generated documentation.
- `logs/` - Contains log files.
- `tests/` - Contains unit and integration tests.
- `cdc/` - Contains Change Data Capture (CDC) listeners.
- `consumers/` - Contains consumers for RabbitMQ.
- `publishers/` - Contains publishers for RabbitMQ.
- `utils/` - Contains utility functions and helpers.
- `xsd/` - Contains XML Schema Definitions (XSD) for data validation.

# authors:
- [Lars]()
- [Jurgen]()
- [Mateo]()
- [Antoine]()
- [Karim]()
- [Aiden]()