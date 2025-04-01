package com.expo.crm;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.AccountController;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class ExtractUserIds {
    public static void main(String[] args) throws Exception {
        SalesForceClient client = new SalesForceClient();
        AccountController accountController = new AccountController(client);

        // make a empty list of json objects
        List<String> jsonObjects = new ArrayList<>();

        var response = accountController.getAll();

        String content = (String) response.body();
        JSONObject rootNode = new JSONObject(content);

        List<String> userIds = new ArrayList<>();
        JSONArray recentItems = rootNode.getJSONArray("recentItems");

        for (int i = 0; i < recentItems.length(); i++) {
            JSONObject item = recentItems.getJSONObject(i);
            String id = item.getString("Id");
            userIds.add(id);
        }

        for (String userId : userIds) {
            var user = accountController.get(userId);
            jsonObjects.add((String) user.body());
        }
        // print the list of json objects
        System.out.println("List of JSON objects: ");
        for (String jsonObject : jsonObjects) {
            System.out.println("==========================");
            System.out.println(jsonObject);
        }
    }
}