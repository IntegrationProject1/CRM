import com.expo.crm.util.Converter;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class ConverterTest {

    @Test
    public void testXmlToJson() throws Exception {
        String xml = "<root><name>John</name><age>30</age></root>";
        String expectedJson =
        """
        {"root": {
            "name": "John",
            "age": 30
        }}""";
        String actualJson = Converter.xmlToJson(xml);
        assertEquals(expectedJson, actualJson);
    }

    @Test
    public void testJsonToXml() throws Exception {
        String json = "{ \"root\": { \"name\": \"John\", \"age\": 30 } }";
        String expectedXml =
                """
                <?xml version="1.0" encoding="UTF-8" standalone="no"?>
                <root>
                    <name>John</name>
                    <age>30</age>
                </root>
                """;
        String actualXml = Converter.jsonToXml(json);
        assertEquals(expectedXml.replace("\r\n", "\n"), actualXml.replace("\r\n", "\n"));
    }
}