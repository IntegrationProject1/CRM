package com.expo.crm.salesforce.controller;

import com.expo.crm.salesforce.SalesForceClient;

import java.net.http.HttpResponse;

public class AccountController {

    private final SalesForceClient client;

    public AccountController(SalesForceClient client) {
        this.client = client;
    }

    public HttpResponse create(String jsonObject) throws Exception {
        return client.executeRequest("/sobjects/Account", "POST", jsonObject);
    }

    public HttpResponse get(String accountId) throws Exception {
        return client.executeRequest("/sobjects/Account/" + accountId, "GET", null);
    }

    public HttpResponse update(String accountId, String jsonObject) throws Exception {
        return client.executeRequest("/sobjects/Account/" + accountId, "PATCH", jsonObject);
    }

    public HttpResponse delete(String accountId) throws Exception {
        return client.executeRequest("/sobjects/Account/" + accountId, "DELETE", null);
    }
}
