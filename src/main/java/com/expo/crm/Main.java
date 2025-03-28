//package com.expo.crm;
//
//public class Main {
//    public static void main(String[] args) {
//        System.out.println(" Microservice gestart → start JSON flow...");
//
//        // dummy data broooo
//        String json = "{ \"FirstName\": \"Zero\", \"LastName\": \"Aizen\", \"Email\": \"zero@example.com\" }";
//
//        String response = UserFlow.createUserFromJson(json);
//        System.out.println("Antwoord van Salesforce:\n" + response);
//    }
//}
package com.expo.crm;

public class Main {

    public static void main(String[] args) {
        System.out.println("Microservice gestart → start JSON flow...");

        // Voor nieuwe contact aanmaken
        String createJson = """
        {
          "FirstName": "Zero",
          "LastName": "UpdateCheck",
          "Email": "zeroupdate@example.com"
        }
        """;

        String createResponse = UserFlow.createUserFromJson(createJson);
        System.out.println("Create-response van Salesforce:");
        System.out.println(createResponse);

        // Voor contact updaten (zet hier een echte ID)
        String contactId = "003Qy00000MCFUrIAP"; // <- Vervang met geldige Contact ID
        String updateJson = """
        {
          "FirstName": "Updated",
          "LastName": "Contact"
        }
        """;

        String updateResponse = UserFlow.updateUserFromJson(contactId, updateJson);
        System.out.println("Update-response van Salesforce:");
        System.out.println(updateResponse);
    }
}
