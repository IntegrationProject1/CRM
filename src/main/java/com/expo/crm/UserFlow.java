package com.expo.crm;

import com.expo.crm.salesforce.contact.CreateContact;

public class UserFlow {
    // CreateContact
    public static String createUserFromJson(String jsonInput) {
        return CreateContact.createFromJson(jsonInput);
    }
}
