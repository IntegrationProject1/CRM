package com.expo.crm.salesforce.controller;

import com.expo.crm.salesforce.SalesForceClient;

import java.net.http.HttpResponse;

public class UserController {

    private final SalesForceClient client;

    public UserController(SalesForceClient client) {
        this.client = client;
    }

    public HttpResponse create(String jsonObject) throws Exception {
        return client.executeRequest("/sobjects/User", "POST", jsonObject);
    }

    public HttpResponse get(String userId) throws Exception {
        return client.executeRequest("/sobjects/User/" + userId, "GET", null);
    }

    public HttpResponse update(String userId, String jsonObject) throws Exception {
        return client.executeRequest("/sobjects/User/" + userId, "PATCH", jsonObject);
    }

    public HttpResponse delete(String userId) throws Exception {
        return client.executeRequest("/sobjects/User/" + userId, "DELETE", null);
    }
}
