const {
    xmlToJson,
    jsonToXml,
    transformSalesforceToXml,
    transformXmlToSalesforce
} = require('../../xmlJsonTranslator');

describe('xmlJsonTranslator', () => {
    it('should translate XML to JSON correctly', async () => {
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

    it('should translate JSON to XML correctly', () => {
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

    it('should transform Salesforce CDC event to XML for "User"', () => {
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

    it('should transform XML back to Salesforce JSON for "User"', async () => {
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
