package com.expo.crm;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.AccountController;
import com.expo.crm.salesforce.controller.ContactController;

public class Main {
    public static void main(String[] args) throws Exception {


        System.out.println("Hello world!");

        // Gemeenschappelijke Client object Instantie aanmaken (Logt automatisch in)
        SalesForceClient client = new SalesForceClient();

        System.out.println("Client successfully initialised");

        // Instantie van de controllers aanmaken om te testen
        AccountController accountController = new AccountController(client);
        ContactController contactController = new ContactController(client);
        // UserController userController = new UserController(client); // Nog te implementeren


        // Wat testen van methoden in de controllers

        // CREATE Account
        var response = accountController.create("""
            {
                "Name": "Account Created by API",
                "Phone": "123-456-7898",
                "Website": "https://www.example.com",
                "Industry": "Technology"
            }""");

        if (response.statusCode() != 201) {
            throw new RuntimeException("Failed to create Account: " + response.body());
        }
        System.out.println("Account successfully created: " + response.body());


        // GET User by Id
        response = accountController.get("005Qy00000E8M6cIAF");

        if (response.statusCode() != 200) {
            throw new RuntimeException("Failed to get User: " + response.body());
        }
        System.out.println("User successfully retrieved: " + response.body());


        // UPDATE Contact by Id
        response = accountController.update("003Qy00000MF8NBIA1", """
                {
                    "FirstName": "John",
                    "LastName": "Doe2 Created by API"
                }""");

        if (response.statusCode() != 204) {
            throw new RuntimeException("Failed to update Contact: " + response.body());
        }
        System.out.println("Contact successfully updated");


        // DELETE Account by Id
        response = accountController.delete("001Qy00000y5kvkIAA");

        if (response.statusCode() != 204) {
            throw new RuntimeException("Failed to delete Account: " + response.body());
        }
        System.out.println("Account successfully deleted");




    }
}