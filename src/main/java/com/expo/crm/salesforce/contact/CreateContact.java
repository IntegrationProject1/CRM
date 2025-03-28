package com.expo.crm.salesforce.contact;

import com.expo.crm.EnvReader;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class CreateContact {

    public static String createFromJson(String jsonInput) {
        try {
            String clientId = EnvReader.get("SALESFORCE_CLIENT_ID");
            String clientSecret = EnvReader.get("SALESFORCE_CLIENT_SECRET");
            String username = EnvReader.get("SALESFORCE_USERNAME");
            String password = EnvReader.get("SALESFORCE_PASSWORD");
            String token = EnvReader.get("SALESFORCE_TOKEN");
            String loginUrl = EnvReader.get("SALESFORCE_LOGIN_URL");

            // STEP 1: Token ophalen
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


            String accessToken = extract(authResponse.toString(), "\"access_token\":\"", "\"");
            String instanceUrl = EnvReader.get("SALESFORCE_INSTANCE_URL");

            System.out.println("Token OK");
            System.out.println("Instance URL: " + instanceUrl);

            // STEP 2: Contact aanmaken
            URL sfUrl = new URL(instanceUrl + "/services/data/v58.0/sobjects/Contact");
            HttpURLConnection sfConn = (HttpURLConnection) sfUrl.openConnection();
            sfConn.setRequestMethod("POST");
            sfConn.setRequestProperty("Authorization", "Bearer " + accessToken);
            sfConn.setRequestProperty("Content-Type", "application/json");
            sfConn.setDoOutput(true);

            OutputStream os = sfConn.getOutputStream();
            os.write(jsonInput.getBytes());
            os.flush();
            os.close();

            BufferedReader sfReader = new BufferedReader(new InputStreamReader(sfConn.getInputStream()));
            StringBuilder sfResponse = new StringBuilder();
            while ((line = sfReader.readLine()) != null) {
                sfResponse.append(line);
            }

            return sfResponse.toString();

        } catch (Exception e) {
            return "<error>" + e.getMessage() + "</error>";
        }
    }

    private static String extract(String response, String start, String end) {
        int s = response.indexOf(start);
        if (s == -1) return null;
        int e = response.indexOf(end, s + start.length());
        if (e == -1) return null;
        return response.substring(s + start.length(), e);
    }
}
