package com.expo.crm.util;

import org.json.JSONObject;
import org.json.XML;
import java.io.StringReader;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.w3c.dom.Document;
import org.xml.sax.InputSource;

public class Converter {
    // Convert XML to JSON
    public static String xmlToJson(String xml) throws Exception {
        JSONObject jsonObject = XML.toJSONObject(xml);
        return jsonObject.toString(4); // Pretty print with an indentation of 4 spaces
    }

    // Convert JSON to XML
    public static String jsonToXml(String json) throws Exception {
        JSONObject jsonObject = new JSONObject(json);
        String xml = XML.toString(jsonObject);
        return formatXml(xml);
    }

    // Helper method to format XML (this make with copilot)
    private static String formatXml(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document document = builder.parse(new InputSource(new StringReader(xml)));

        // Use a transformer for pretty print
        TransformerFactory tf = TransformerFactory.newInstance();
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "4");

        java.io.StringWriter writer = new java.io.StringWriter();
        transformer.transform(new DOMSource(document), new StreamResult(writer));
        return writer.getBuffer().toString();
    }
}