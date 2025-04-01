package com.expo.crm.rbmq;

import com.expo.crm.salesforce.SalesForceClient;
import com.rabbitmq.client.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeoutException;

public class UserMessageListener {

    private static final String QUEUE_NAME = "create-user-queue"; // Pas aan indien nodig
    private static final String RABBITMQ_HOST = System.getenv("RABBITMQ_HOST");

    public void listenForMessages() throws IOException, TimeoutException {
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(RABBITMQ_HOST != null ? RABBITMQ_HOST : "localhost");
        factory.setUsername(System.getenv("RABBITMQ_USERNAME"));
        factory.setPassword(System.getenv("RABBITMQ_PASSWORD"));

        Connection connection = factory.newConnection();
        Channel channel = connection.createChannel();

        channel.queueDeclare(QUEUE_NAME, true, false, false, null);
        System.out.println("[RabbitMQ] Waiting for messages...");

        DeliverCallback deliverCallback = (consumerTag, delivery) -> {
            String message = new String(delivery.getBody(), StandardCharsets.UTF_8);
            System.out.println("[RabbitMQ] Received message: " + message);

            // Roep hier de Salesforce-client aan om gebruiker aan te maken
            SalesForceClient sfClient = new SalesForceClient();
            sfClient.createUserFromJson(message);
        };

        channel.basicConsume(QUEUE_NAME, true, deliverCallback, consumerTag -> {});
    }
}
