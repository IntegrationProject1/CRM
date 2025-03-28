package com.expo.crm;

import com.expo.crm.salesforce.contact.CreateContact;
import com.expo.crm.salesforce.contact.UpdateContact;

public class UserFlow {
    // CreateContact
    public static String createUserFromJson(String jsonInput) {
        return CreateContact.createFromJson(jsonInput);
    }
    public static String updateUserFromJson(String contactId, String jsonInput) {
        return UpdateContact.updateContactById(contactId, jsonInput);
    }
}
