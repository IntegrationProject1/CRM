package com.expo.crm.rbmq;

import com.rabbitmq.client.Connection;
import com.rabbitmq.client.ConnectionFactory;
import com.rabbitmq.client.Channel;
import com.expo.crm.util.EnvReader;

public class ConsumerClient {
    private final Connection connection;

    public ConsumerClient() throws Exception {
        ConnectionFactory factory = new ConnectionFactory();
        factory.setHost(EnvReader.get("RABBITMQ_HOST"));
        factory.setPort(Integer.parseInt(EnvReader.get("RABBITMQ_PORT")));
        factory.setUsername(EnvReader.get("RABBITMQ_USERNAME"));
        factory.setPassword(EnvReader.get("RABBITMQ_PASSWORD"));
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