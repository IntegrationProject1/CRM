package com.expo.crm.rbmq.consumer;

import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import com.rabbitmq.client.Channel;

public class RabbitmqClient {
    private final Connection connection;

    public RabbitmqClient() throws Exception {
        ConnectionFactory factory = new ConnectionFactory();
        // Hardcoded for simplicity; later, read from config.xml
        factory.setHost("localhost");
        factory.setPort(5672);
        factory.setUsername("guest");
        factory.setPassword("guest");
        this.connection = factory.newConnection();
    }

    public Channel createChannel() throws Exception {
        return connection.createChannel();
    }

    public void close() throws Exception {
        if (connection != null && connection.isOpen()) {
            connection.close();
        }
    }
}
