package com.expo.crm.rbmq.consumer;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.DefaultConsumer;
import com.rabbitmq.client.Envelope;
import com.rabbitmq.client.AMQP;
import com.expo.crm.salesforce.SalesForceClient;

import java.io.IOException;

public class CreateUserQueueConsume {
    private final Channel channel;
    private final String queueName;
    private final ContactCreateHandler handler;

    public CreateUserQueueConsume(RabbitmqClient rabbitmqClient, SalesForceClient salesForceClient, String queueName) throws Exception {
        this.channel = rabbitmqClient.createChannel();
        this.queueName = queueName;
        this.handler = new ContactCreateHandler(salesForceClient);
        // Declare the queue (non-durable, non-exclusive, non-auto-delete)
        channel.queueDeclare(queueName, false, false, false, null);
    }

    public void startConsuming() throws Exception {
        boolean autoAck = false; // Manual acknowledgment for reliability
        channel.basicConsume(queueName, autoAck, "createUserConsumer",
                new DefaultConsumer(channel) {
                    @Override
                    public void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
                        String message = new String(body, "UTF-8");
                        try {
                            handler.handle(message); // Process the XML message
                            channel.basicAck(envelope.getDeliveryTag(), false); // Acknowledge success
                        } catch (Exception e) {
                            System.err.println("Error processing message: " + e.getMessage());
                            channel.basicNack(envelope.getDeliveryTag(), false, true); // Requeue on failure
                        }
                    }
                });
    }
}