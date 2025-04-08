package com.expo.crm.salesforce;

import org.json.JSONObject;
import com.expo.crm.util.EnvReader;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class SalesForceClient {
    private final HttpClient client;
    private final String apiVersion;
    private String accessToken;
    private String instanceUrl;

    public SalesForceClient() {
        this.client = HttpClient.newHttpClient();
        this.apiVersion = "v59.0";
        authenticate();
    }

    private void authenticate() {
        EnvReader dotenv = new EnvReader();

        String clientId = dotenv.get("SALESFORCE_CLIENT_ID");
        String clientSecret = dotenv.get("SALESFORCE_CLIENT_SECRET");
        String username = dotenv.get("SALESFORCE_USERNAME");
        String password = dotenv.get("SALESFORCE_PASSWORD");
        String securityToken = dotenv.get("SALESFORCE_TOKEN");

        String tokenUrl = "https://login.salesforce.com/services/oauth2/token";
        String authPayload = "grant_type=password"
                + "&client_id=" + clientId
                + "&client_secret=" + clientSecret
                + "&username=" + username
                + "&password=" + password + securityToken;

        HttpRequest authRequest = HttpRequest.newBuilder()
                .uri(URI.create(tokenUrl))
                .POST(HttpRequest.BodyPublishers.ofString(authPayload))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .build();

        try {
            HttpResponse<String> authResponse = client.send(authRequest, HttpResponse.BodyHandlers.ofString());
            JSONObject authJson = new JSONObject(authResponse.body());

            if (!authJson.has("access_token") || !authJson.has("instance_url")) {
                throw new RuntimeException("Authentication failed: " + authJson);
            }

            this.accessToken = authJson.getString("access_token");
            this.instanceUrl = authJson.getString("instance_url");

        } catch (Exception e) {
            throw new RuntimeException("Authentication failed", e);
        }
    }

//     public HttpResponse<String> executeRequest(String endpoint, String method, String body) throws Exception {
//         HttpRequest.Builder builder = HttpRequest.newBuilder()
//                 .uri(URI.create(instanceUrl + "/services/data/" + apiVersion + endpoint))
//                 .header("Authorization", "Bearer " + accessToken)
//                 .header("Content-Type", "application/json");
//
//         System.out.println(instanceUrl + "/services/data/" + apiVersion + endpoint);
//
//         // Stuur request met Body afhankelijk van de methode (GET, POST, PATCH)
//         if ("POST".equals(method) || "PATCH".equals(method)) {
//             builder.method(method, HttpRequest.BodyPublishers.ofString(body));
//         } else {
//             builder.method(method, HttpRequest.BodyPublishers.noBody());
//         }
//         return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}