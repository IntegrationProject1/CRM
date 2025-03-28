package com.expo.crm;

import static com.expo.crm.salesforce.account.CreateAccount.createAccount;

public class UserFlow {
    public static void main(String[] args) throws Exception {
        String obj =
                """
                {
                    "Name": "Account",
                    "Phone": "123-456-7899",
                    "Website": "https://www.example.com",
                    "Industry": "Technology"
                }
                """;
        createAccount(obj);
    }
}