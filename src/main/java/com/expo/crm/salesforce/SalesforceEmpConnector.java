package com.expo.crm.salesforce;

import com.salesforce.emp.connector.BayeuxParameters;
import com.salesforce.emp.connector.EmpConnector;
import com.salesforce.emp.connector.LoginHelper;
import org.cometd.bayeux.Channel;
import org.cometd.bayeux.client.ClientSessionChannel;
import org.cometd.client.BayeuxClient;

import java.net.URL;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class SalesforceEmpConnector {

    private static final String LOGIN_URL = "https://login.salesforce.com";
    private static final String USERNAME = "your-username";
    private static final String PASSWORD = "your-password";
    private static final String CHANNEL = "/event/YourEvent__e";

    public static void main(String[] args) throws Exception {
        BayeuxParameters params = LoginHelper.login(new URL(LOGIN_URL), USERNAME, PASSWORD);
        EmpConnector connector = new EmpConnector(params);

        connector.addListener(Channel.META_HANDSHAKE, (ClientSessionChannel.MessageListener) (channel, message) -> {
            if (message.isSuccessful()) {
                System.out.println("Handshake successful");
            } else {
                System.err.println("Handshake failed: " + message);
            }
        });

        connector.addListener(Channel.META_CONNECT, (ClientSessionChannel.MessageListener) (channel, message) -> {
            if (message.isSuccessful()) {
                System.out.println("Connect successful");
            } else {
                System.err.println("Connect failed: " + message);
            }
        });

        connector.start().get(5, TimeUnit.SECONDS);

        connector.subscribe(CHANNEL, BayeuxClient.SubscriptionListener.class, (channel, message) -> {
            Map<String, Object> data = message.getDataAsMap();
            System.out.println("Received event: " + data);
        }).get(5, TimeUnit.SECONDS);

        // Keep the program running to listen for events
        Thread.currentThread().join();
    }
}