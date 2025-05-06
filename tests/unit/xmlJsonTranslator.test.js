const {
    xmlToJson,
    jsonToXml,
    transformSalesforceToXml,
    transformXmlToSalesforce
} = require('../../xmlJsonTranslator');

describe('xmlJsonTranslator', () => {
    it('moet XML correct naar JSON vertalen', async () => {
        const xml = `
      <UserMessage>
        <FirstName>John</FirstName>
        <LastName>Doe</LastName>
      </UserMessage>
    `;

        const json = await xmlToJson(xml);
        expect(json.UserMessage.FirstName).toBe("John");
        expect(json.UserMessage.LastName).toBe("Doe");
    });

    it('moet JSON correct naar XML vertalen', () => {
        const json = {
            UserMessage: {
                FirstName: "Will",
                LastName: "Smith"
            }
        };

        const xml = jsonToXml(json);
        expect(xml).toContain('<FirstName>Will</FirstName>');
        expect(xml).toContain('<LastName>Smith</LastName>');
        // expect(xml).toBe(`<UserMessage>
        //                     <FirstName>Will</FirstName>
        //                     <LastName>Smith</LastName>
        //                    </UserMessage>`.trim());
    });

    it('moet Salesforce CDC-gebeurtenis transformeren naar XML voor "User"', () => {
        const sample = {
            changeType: 'CREATE',
            payload: {
                Id: '001',
                FirstName: 'John',
                LastName: 'Smith',
                Email: 'john@example.com',
                External_Id__c: 'abc-123'
            }
        };
        const xml = transformSalesforceToXml('User', sample);
        expect(xml).toContain('<firstName>John</firstName>');
        expect(xml).toContain('<type>create</type>');
    });

    it('XML moet terug worden getransformeerd zijn naar Salesforce JSON voor "User"', async () => {
        const xml = `
      <updateUser>
        <id>001</id>
        <email>john@example.com</email>
        <customUuid>abc-123</customUuid>
      </updateUser>
    `;
        const json = await transformXmlToSalesforce('User', xml);
        expect(json.Email).toBe('john@example.com');
        expect(json.External_Id__c).toBe('abc-123');
    });
});
