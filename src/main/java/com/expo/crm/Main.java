package com.expo.crm;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.AccountController;

public class Main {
    public static void main(String[] args) throws Exception {
        System.out.println("Hello world!");

        // Gemeenschappelijke Client object Instantie aanmaken (Logt automatisch in)
        SalesForceClient client = new SalesForceClient();

        System.out.println("Client successfully initialised");

        // Instantie van de controllers aanmaken om te testen

        AccountController accountController = new AccountController(client);
        // ContactController contactController = new ContactController(client); // Nog te implementeren
        // UserController userController = new UserController(client); // Nog te implementeren


        // Testen van alle methoden in AccountController

        // CREATE Account
        var response = accountController.create("""
            {
                "Name": "Account Created by API TEST",
                "Phone": "123-456-7898",
                "Website": "https://www.example.com",
                "Industry": "Technology"
            }""");

        if (response.statusCode() != 201) {
            throw new RuntimeException("Failed to create Account: " + response.body());
        }
        System.out.println("Account successfully created: " + response.body());


        // GET Account by Id
        response = accountController.get("001Qy00000y5kvkIAA");

        if (response.statusCode() != 200) {
            throw new RuntimeException("Failed to get Account: " + response.body());
        }
        System.out.println("Account successfully retrieved: " + response.body());


        // UPDATE Account by Id
        response = accountController.update("001Qy00000y65vOIAQ", """
            {
                "Name": "Account updated by API",
                "Phone": "123-456-7898",
                "Website": "https://www.example.com",
                "Industry": "Technology"
            }""");

        if (response.statusCode() != 204) {
            throw new RuntimeException("Failed to update Account: " + response.body());
        }
        System.out.println("Account successfully updated");


        // DELETE Account by Id
        response = accountController.delete("001Qy00000y5kvkIAA");

        if (response.statusCode() != 204) {
            throw new RuntimeException("Failed to delete Account: " + response.body());
        }
        System.out.println("Account successfully deleted");
    }
}