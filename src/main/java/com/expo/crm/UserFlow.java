package com.expo.crm;

import static com.expo.crm.salesforce.account.CreateAccount.createAccount;
import static com.expo.crm.salesforce.contact.CreateContact.createContact;

public class UserFlow {
    public static void main(String[] args) throws Exception {
        String objA =
                """
                {
                    "Name": "Account",
                    "Phone": "123-456-7899",
                    "Website": "https://www.example.com",
                    "Industry": "Technology"
                }
                """;
        String objC =
                """
                {
                    "FirstName": "Zero",
                    "LastName": "Aizen",
                    "Email": "zero@example.com"
                }
                """;
        createAccount(objA);
        createContact(objC);

    }
}