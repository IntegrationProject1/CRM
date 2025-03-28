package com.expo.crm.salesforce.contact;

import com.expo.crm.EnvReader;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateContact {

    public static String updateContactById(String contactId, String jsonInput) {
        try {
            // Stap 1: Auth ophalen via .env
            String clientId = EnvReader.get("SALESFORCE_CLIENT_ID");
            String clientSecret = EnvReader.get("SALESFORCE_CLIENT_SECRET");
            String username = EnvReader.get("SALESFORCE_USERNAME");
            String password = EnvReader.get("SALESFORCE_PASSWORD");
            String token = EnvReader.get("SALESFORCE_TOKEN");
            String loginUrl = EnvReader.get("SALESFORCE_LOGIN_URL");

            // Auth call
            URL authUrl = new URL(loginUrl + "/services/oauth2/token");
            String body = "grant_type=password"
                    + "&client_id=" + clientId
                    + "&client_secret=" + clientSecret
                    + "&username=" + username
                    + "&password=" + password + token;

            HttpURLConnection authConn = (HttpURLConnection) authUrl.openConnection();
            authConn.setRequestMethod("POST");
            authConn.setDoOutput(true);
            authConn.getOutputStream().write(body.getBytes());

            BufferedReader reader = new BufferedReader(new InputStreamReader(authConn.getInputStream()));
            StringBuilder authResponse = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                authResponse.append(line);
            }

            JSONObject authJson = new JSONObject(authResponse.toString());
            String accessToken = authJson.getString("access_token");
            String instanceUrl = authJson.getString("instance_url");

            System.out.println("Token OK");
            System.out.println("Instance URL: " + instanceUrl);

            // Stap 2: PATCH request sturen naar Contact/{id}
            URL url = new URL(instanceUrl + "/services/data/v58.0/sobjects/Contact/" + contactId);
            HttpURLConnection sfConn = (HttpURLConnection) url.openConnection();

            // Hier zetten we PATCH correct (werkt met Salesforce)
            sfConn.setRequestMethod("PATCH");
            sfConn.setRequestProperty("Authorization", "Bearer " + accessToken);
            sfConn.setRequestProperty("Content-Type", "application/json");
            sfConn.setDoOutput(true);

            OutputStream os = sfConn.getOutputStream();
            os.write(jsonInput.getBytes());
            os.flush();
            os.close();

            // Normaal heeft PATCH geen body terug, maar we checken op 204
            int responseCode = sfConn.getResponseCode();
            if (responseCode == 204) {
                return "✅ Contact succesvol geüpdatet!";
            } else {
                BufferedReader sfReader = new BufferedReader(new InputStreamReader(sfConn.getErrorStream()));
                StringBuilder sfResponse = new StringBuilder();
                while ((line = sfReader.readLine()) != null) {
                    sfResponse.append(line);
                }
                return "<error>" + sfResponse + "</error>";
            }

        } catch (Exception e) {
            return "<error>" + e.getMessage() + "</error>";
        }
    }
}
