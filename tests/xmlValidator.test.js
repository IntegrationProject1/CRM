const path = require('path');
const fs = require('fs');
const { validateXml } = require('../xmlValidator');

// Testdata: correcte XML + XSD
const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<user>
  <name>Lars</name>
  <email>lars@example.com</email>
</user>`;

const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<user>
  <fullname>Lars</fullname>
  <email>lars@example.com</email>
</user>`;

const xsdContent = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="user">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:element name="email" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;


// Schrijf tijdelijk testbestand weg
const xsdPath = path.join(__dirname, 'temp-test.xsd');
fs.writeFileSync(xsdPath, xsdContent, 'utf-8');

afterAll(() => {
  fs.unlinkSync(xsdPath); // opruimen
});

describe('validateXml', () => {
  it('✅ valideert correcte XML tegen XSD', () => {
    const result = validateXml(validXml, xsdPath);
    expect(result).toBe(true);
  });

  it('❌ geeft false bij ongeldige XML (andere elementnaam)', () => {
    const result = validateXml(invalidXml, xsdPath);
    expect(result).toBe(false);
  });
});
