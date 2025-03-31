import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import org.junit.jupiter.api.Test;

import java.io.File;

import com.expo.crm.util.ValidatorXSD;

public class ValidatorXSDTest {

    @Test
    public void testValidXML() {
        File xmlFile = new File("src/test/resources/valid.xml");
        File xsdFile = new File("src/test/resources/schema.xsd");
        boolean isValid = ValidatorXSD.validateXMLSchema(xmlFile, xsdFile);
        assertTrue(isValid, "The XML file should be valid against the XSD schema.");
    }

    @Test
    public void testInvalidXML() {
        File xmlFile = new File("src/test/resources/invalid.xml");
        File xsdFile = new File("src/test/resources/schema.xsd");
        boolean isValid = ValidatorXSD.validateXMLSchema(xmlFile, xsdFile);
        assertFalse(isValid, "The XML file should be invalid against the XSD schema.");
    }
}