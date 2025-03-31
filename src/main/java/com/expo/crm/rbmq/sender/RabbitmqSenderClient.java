package com.expo.crm.rbmq.sender;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import com.expo.crm.util.EnvReader;

public class RabbitmqSenderClient {
    private static Connection connection;
    private static Channel channel;

    static {
        int retries = 5; // Aantal pogingen om verbinding te maken
        while (retries > 0) {
            try {
                ConnectionFactory factory = new ConnectionFactory();
                String host = EnvReader.get("RABBITMQ_HOST");
                String port = EnvReader.get("RABBITMQ_PORT");
                String username = EnvReader.get("RABBITMQ_USERNAME");
                String password = EnvReader.get("RABBITMQ_PASSWORD");
                String exchange = EnvReader.get("RABBITMQ_EXCHANGE");

                // Validatie van de configuratie
                if (host == null || port == null || username == null || password == null || exchange == null) {
                    throw new IllegalStateException("FOUT: Een of meer RabbitMQ-configuraties ontbreken in .env");
                }

                factory.setHost(host);
                factory.setPort(Integer.parseInt(port));
                factory.setUsername(username);
                factory.setPassword(password);

                connection = factory.newConnection();
                channel = connection.createChannel();
                channel.exchangeDeclare(exchange, "topic", true);
                break; // Succes, verlaat de lus
            } catch (Exception e) {
                System.err.println("FOUT bij initialiseren RabbitMQ: " + e.getMessage());
                retries--;
                if (retries > 0) {
                    try {
                        Thread.sleep(5000); // Wacht 5 seconden voor de volgende poging
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                } else {
                    System.err.println("FOUT: Kon RabbitMQ niet initialiseren na meerdere pogingen");
                }
            }
        }
    }

    public static void send(String exchange, String routingKey, String message) {
        try {
            if (channel == null) {
                throw new IllegalStateException("FOUT: RabbitMQ kanaal niet geïnitialiseerd");
            }
            channel.basicPublish(exchange, routingKey, null, message.getBytes());
            System.out.println(" [x] Verstuurd '" + routingKey + "': '" + message + "'");
        } catch (Exception e) {
            System.err.println("FOUT bij verzenden bericht: " + e.getMessage());
        }
    }
}