package com.expo.crm;

public class Main {
    public static void main(String[] args) {
        System.out.println(" Microservice gestart → start JSON flow...");

        // dummy data broooo
        String json = "{ \"FirstName\": \"Zero\", \"LastName\": \"Aizen\", \"Email\": \"zero@example.com\" }";

        String response = UserFlow.createUserFromJson(json);
        System.out.println("Antwoord van Salesforce:\n" + response);
    }
}
