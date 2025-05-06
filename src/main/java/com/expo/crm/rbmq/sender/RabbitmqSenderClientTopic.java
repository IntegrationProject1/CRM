package com.expo.crm.rbmq.sender;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import com.expo.crm.util.EnvReader;
import com.expo.crm.util.ValidatorXSD;

import java.io.File;
import java.io.FileWriter;

public class RabbitmqSenderClientTopic {
    public static Connection connection;
    public static Channel channel;

    static {
        int retries = 5; // Number of attempts to connect
        while (retries > 0) {
            try {
                ConnectionFactory factory = new ConnectionFactory();
                String host = EnvReader.get("RABBITMQ_HOST");
                String port = EnvReader.get("RABBITMQ_PORT");
                String username = EnvReader.get("RABBITMQ_USERNAME");
                String password = EnvReader.get("RABBITMQ_PASSWORD");
                String exchange = EnvReader.get("RABBITMQ_EXCHANGE");

                // Validate configuration
                if (host == null || port == null || username == null || password == null || exchange == null) {
                    throw new IllegalStateException("ERROR: One or more RabbitMQ configurations are missing in .env");
                }

                factory.setHost(host);
                factory.setPort(Integer.parseInt(port));
                factory.setUsername(username);
                factory.setPassword(password);

                connection = factory.newConnection();
                channel = connection.createChannel();
                channel.exchangeDeclare(exchange, "topic", true);
                break; // Success, exit the loop
            } catch (Exception e) {
                System.err.println("ERROR initializing RabbitMQ: " + e.getMessage());
                retries--;
                if (retries > 0) {
                    try {
                        Thread.sleep(5000); // Wait 5 seconds before the next attempt
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                } else {
                    System.err.println("ERROR: Could not initialize RabbitMQ after multiple attempts");
                }
            }
        }
    }

    public static void send(String exchange, String routingKey, String message, File xsdFile) {
        try {
            if (channel == null) {
                throw new IllegalStateException("ERROR: RabbitMQ channel not initialized");
            }

            // Validate the XML message
//            File xmlFile = new File("temp.xml");
//            try (FileWriter writer = new FileWriter(xmlFile)) {
//                writer.write(message);
//            }

//            boolean isValid = ValidatorXSD.validateXMLSchema(xmlFile, xsdFile);
//            if (!isValid) {
//                throw new IllegalArgumentException("ERROR: Invalid XML message");
//            }

            channel.basicPublish(exchange, routingKey, null, message.getBytes());
            System.out.println(" [x] Sent '" + routingKey + "': '" + message + "'");
        } catch (Exception e) {
            System.err.println("ERROR sending message: " + e.getMessage());
        }
    }
}