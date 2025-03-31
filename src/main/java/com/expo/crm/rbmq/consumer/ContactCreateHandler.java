package com.expo.crm.rbmq.consumer;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.ContactController;
import com.expo.crm.util.Converter;
import org.json.JSONObject;

public class ContactCreateHandler {
    private final ContactController contactController;

    public ContactCreateHandler(SalesForceClient client) {
        this.contactController = new ContactController(client);
    }

    public void handle(String xmlMessage) throws Exception {
        // Convert XML to JSON
        String json = Converter.xmlToJson(xmlMessage);

        // If Converter wraps the XML in a root element (e.g., "contact"), extract the inner object
        JSONObject jsonObject = new JSONObject(json);
        if (jsonObject.has("contact")) {
            json = jsonObject.getJSONObject("contact").toString();
        }

        // Create contact in Salesforce
        var response = contactController.create(json);
        if (response.statusCode() != 201) {
            throw new RuntimeException("Failed to create contact: " + response.body());
        }
        System.out.println("Contact created successfully: " + response.body());
    }
}