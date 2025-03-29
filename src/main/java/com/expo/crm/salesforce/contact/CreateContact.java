package com.expo.crm.salesforce.contact;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import com.expo.crm.EnvReader;

public class CreateContact {
    public static void createContact(String jsonObject) throws Exception {
        // Load environment variables
        String urlApi = "/services/data/v63.0/sobjects/Contact/";
        String salesforceUrl = EnvReader.get("SALESFORCE_URL");

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(salesforceUrl + urlApi))
                .POST(HttpRequest.BodyPublishers.ofString(jsonObject))
                .header("Authorization", "Bearer " + EnvReader.get("SALESFORCE_ACCESS_TOKEN"))
                .header("Content-Type", "application/json")
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.print(response.statusCode() + "\n");
        System.out.print(response.body() + "\n");
    }
}