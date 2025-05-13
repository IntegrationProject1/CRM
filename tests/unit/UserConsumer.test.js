require('dotenv').config();
const amqp = require('amqplib');
const SalesforceClient = require('../../salesforceClient');
const StartUserConsumer = require('../../consumers/UserConsumer');
const xmlJsonTranslator = require("../../utils/xmlJsonTranslator");

// die gaat unieke en correcte UUID formateren.
function generateCustomUUID() {
    const now = new Date();
    const iso = now.toISOString().replace('Z', ''); // Remove the 'Z'
    const [date] = iso.split('.');
    const microseconds = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `${date}.${microseconds}`;
    //return String(Date.now());
}
describe('UserConsumer', () => {
    let connection, channel, sfClient;

    beforeAll(async () => {
        connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();
        await channel.assertQueue('crm_user_create');
        await channel.assertQueue('crm_user_update');
        await channel.assertQueue('crm_user_delete');

        await channel.purgeQueue('crm_user_update');
        //await channel.purgeQueue('crm_user_create');
        await channel.purgeQueue('crm_user_delete');

        sfClient = new SalesforceClient(
            process.env.SALESFORCE_USERNAME,
            process.env.SALESFORCE_PASSWORD,
            process.env.SALESFORCE_TOKEN,
            process.env.SALESFORCE_LOGIN_URL
        );
        await sfClient.login();

        await StartUserConsumer(channel, sfClient);
    });

    // let testUUID = '2024-01-01T00:00:00.000000';
    // const testUUID = new Date().toISOString();
    // const UUIDTimeStamp = new Date(testUUID).getTime();

    let testUUID;
    let UUIDTimeStamp;

    beforeEach(async () => {
        //testUUID = new Date().toISOString();
        testUUID = generateCustomUUID();
        // testUUID = '2024-01-01T00:00:00.000000';
        // UUIDTimeStamp = new Date(testUUID).getTime();
        console.log(testUUID)
    });

    it('moet een "create" message verwerken', async () => {
        const testXml = `
      <UserMessage>
        <UUID>${testUUID}</UUID>
        <EncryptedPassword>testing123</EncryptedPassword>
        <TimeOfAction>${testUUID}</TimeOfAction>
        <FirstName>Student</FirstName>
        <LastName>EHB</LastName>
        <PhoneNumber>+1234567890</PhoneNumber>
        <EmailAddress>student.ehb@voorbeeld.com</EmailAddress>
      </UserMessage>
    `;
        channel.sendToQueue('crm_user_create', Buffer.from(testXml));
        await new Promise(resolve => setTimeout(resolve, 4000));

        const results = await sfClient
            .sObject('Contact')
            .select('Id, UUID__c, Phone, Email')
            .where({ UUID__c: String(UUIDTimeStamp) })
            //.where({ UUID__c: testUUID })
            .execute();

        console.log(results);

        // expect(result.records.length).toBe(1);
        expect(results.length).toBe(1);
        //expect(results[0].UUID__c).toBe(String(testUUID));
        expect(results[0].Phone).toBe('+1234567890');
        expect(results[0].Email).toBe('student.ehb@voorbeeld.com');
    });

    it('moet een "update" message verwerken', async () => {
    //
    //     const createXml = `
    //       <UserMessage>
    //         <UUID>${testUUID}</UUID>
    //         <EncryptedPassword>initial</EncryptedPassword>
    //         <TimeOfAction>${testUUID}</TimeOfAction>
    //         <FirstName>Initial</FirstName>
    //         <LastName>User</LastName>
    //         <PhoneNumber>0000000000</PhoneNumber>
    //         <EmailAddress>initial@example.com</EmailAddress>
    //       </UserMessage>
    //     `;
    //
    //     channel.sendToQueue('crm_user_create', Buffer.from(createXml));
    //     await new Promise(resolve => setTimeout(resolve, 4000));

        const updateXml = `
            <UserMessage>
              <UUID>${testUUID}</UUID>
              <EncryptedPassword>updated123</EncryptedPassword>
              <TimeOfAction>${testUUID}</TimeOfAction>
              <FirstName>MarkoU</FirstName>
              <LastName>Paulo</LastName>
              <PhoneNumber>0987654321</PhoneNumber>
              <EmailAddress>markou.paulo@hotmail.com</EmailAddress>
            </UserMessage>
        `;

        channel.sendToQueue('crm_user_update', Buffer.from(updateXml));
        await new Promise(resolve => setTimeout(resolve, 4000));

        const results = await sfClient
            .sObject('Contact')
            .select('Id, UUID__c, FirstName, LastName, Email, Phone')
            // .where({ UUID__c: testUUID })
            .where({ UUID__c: UUIDTimeStamp })
            .execute();

        expect(results.length).toBe(1);
        expect(results[0].FirstName).toBe('MarkoU');
        expect(results[0].Email).toBe('markou.paulo@hotmail.com');
        expect(results[0].Phone).toBe('0987654321');
    });

    it('moet een "delete" message verwerken', async () => {
        const testXml = `
    <UserMessage>
        <UUID>${testUUID}</UUID>
        <TimeOfAction>${testUUID}</TimeOfAction>
    </UserMessage>
  `;

        channel.sendToQueue('crm_user_delete', Buffer.from(testXml));
        await new Promise(resolve => setTimeout(resolve, 4000));

        const results = await sfClient
            .sObject('Contact')
            .select('Id, UUID__c')
            .where({ UUID__c: String(UUIDTimeStamp) })
            // .where({ UUID__c: `${UUIDTimeStamp}` })
            .execute();

        expect(results.length).toBe(0);
    });


    afterAll(async () => {
        await channel.close();
        await connection.close();
    });
});
