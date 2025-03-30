package com.expo.crm.salesforce.controller;

import com.expo.crm.salesforce.SalesForceClient;

import java.net.http.HttpResponse;

public class ContactController {

    private final SalesForceClient client;

    public ContactController(SalesForceClient client) {
        this.client = client;
    }

    public HttpResponse create(String jsonObject) throws Exception {
        return client.executeRequest("/sobjects/Contact", "POST", jsonObject);
    }

    public HttpResponse get(String contactId) throws Exception {
        return client.executeRequest("/sobjects/Contact/" + contactId, "GET", null);
    }

    public HttpResponse update(String contactId, String jsonObject) throws Exception {
        return client.executeRequest("/sobjects/Contact/" + contactId, "PATCH", jsonObject);
    }

    public HttpResponse delete(String contactId) throws Exception {
        return client.executeRequest("/sobjects/Contact/" + contactId, "DELETE", null);
    }
}
