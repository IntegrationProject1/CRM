
# CRM Microservice - Salesforce Integratie

Deze microservice verzorgt de communicatie tussen het centrale platform en Salesforce via RabbitMQ en de Salesforce REST API (JSforce).

## Functionaliteit

- Create, Update en Delete van gebruikers (Contact-object in Salesforce)
- Input via XML-berichten over RabbitMQ
- Logging van iedere actie naar een aparte `crm_log` queue
- Mapping naar Salesforce via `jsforce`
- Afhandeling van fouten (bijv. duplicate gebruikers, niet gevonden UUID’s)

## Mappenstructuur

- `/src/config` - RabbitMQ en Salesforce configuratie
- `/src/consumers` - Message receivers per actie (create, update, delete)
- `/src/services` - Businesslogica (contactService)
- `/scripts` - Testberichten versturen
- `.env` - Gevoelige configuratie (Salesforce credentials, RabbitMQ login)

## .env structuur

```env
# Salesforce
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
SALESFORCE_USERNAME=...
SALESFORCE_PASSWORD=...
SALESFORCE_TOKEN=...
SALESFORCE_LOGIN_URL=https://login.salesforce.com
SALESFORCE_URL=https://ehb6-dev-ed.develop.my.salesforce.com

# RabbitMQ
RABBITMQ_HOST=...
RABBITMQ_PORT=...
RABBITMQ_USERNAME=...
RABBITMQ_PASSWORD=...
RABBITMQ_EXCHANGE=heartbeat
```

## Project draaien

```bash
npm install
node src/index.js
```

## Testen

Gebruik een van de volgende scripts:

```bash
node scripts/sendCreateMessage.js
node scripts/sendUpdateMessage.js
node scripts/sendDeleteMessage.js
```

## Logging

Elke actie (CREATE, UPDATE, DELETE) stuurt een logbericht naar `crm_log` met status `SUCCESS`, `ERROR` of `NOT_FOUND`.

## Change Data Capture (CDC)

De structuur is voorbereid om CDC toe te voegen. Er wordt geluisterd naar `/data/ContactChangeEvent`, vanwaaruit toekomstige berichten kunnen worden gegenereerd richting andere queues.

>>>>>>> java_to_jsforce
