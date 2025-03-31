package com.expo.crm.rbmq.consumer;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.DefaultConsumer;
import com.rabbitmq.client.Envelope;
import com.rabbitmq.client.AMQP;
import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.ContactController;
import com.expo.crm.util.Converter;
import org.json.JSONObject;
import java.io.IOException;

public class UserConsumer {
    private final Channel channel;
    private final SalesForceClient salesForceClient;
    private final String exchangeName = "user";
    private final String[] routingKeys = {"crm.user.create", "crm.user.update", "crm.user.delete"};

    public UserConsumer(ConsumerClient consumerClient, SalesForceClient salesForceClient) throws Exception {
        this.channel = consumerClient.createChannel();
        this.salesForceClient = salesForceClient;
        declareQueues();
    }

    private void declareQueues() throws Exception {
        for (String routingKey : routingKeys) {
            String queueName = routingKey.replace(".", "_") + "_queue";
            channel.queueDeclare(queueName, false, false, false, null);
            channel.queueBind(queueName, exchangeName, routingKey);
        }
    }

    public void startConsuming() throws Exception {
        for (String routingKey : routingKeys) {
            String queueName = routingKey.replace(".", "_") + "_queue";
            boolean autoAck = false;
            channel.basicConsume(queueName, autoAck, "userConsumer_" + routingKey,
                    new DefaultConsumer(channel) {
                        @Override
                        public void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
                            String message = new String(body, "UTF-8");
                            try {
                                processMessage(message, routingKey);
                                channel.basicAck(envelope.getDeliveryTag(), false);
                            } catch (Exception e) {
                                System.err.println("Failed to process user message: " + e.getMessage());
                                channel.basicNack(envelope.getDeliveryTag(), false, true);
                            }
                        }
                    });
        }
        System.out.println("UserConsumer gestart, luistert naar queues voor user-operaties.");
    }

    private void processMessage(String xmlMessage, String routingKey) throws Exception {
        String json = Converter.xmlToJson(xmlMessage);
        JSONObject jsonObject = new JSONObject(json).getJSONObject("user");
        ContactController contactController = new ContactController(salesForceClient);

        switch (routingKey) {
            case "crm.user.create":
                var createResponse = contactController.create(jsonObject.toString());
                if (createResponse.statusCode() != 201) {
                    throw new RuntimeException("Fout bij aanmaken user: " + createResponse.body());
                }
                System.out.println("User succesvol aangemaakt: " + createResponse.body());
                break;
            case "crm.user.update":
                String id = jsonObject.getString("Id");
                jsonObject.remove("Id");
                var updateResponse = contactController.update(id, jsonObject.toString());
                if (updateResponse.statusCode() != 204) {
                    throw new RuntimeException("Fout bij updaten user: " + updateResponse.body());
                }
                System.out.println("User succesvol geüpdatet");
                break;
            case "crm.user.delete":
                String deleteId = jsonObject.getString("Id");
                var deleteResponse = contactController.delete(deleteId);
                if (deleteResponse.statusCode() != 204) {
                    throw new RuntimeException("Fout bij verwijderen user: " + deleteResponse.body());
                }
                System.out.println("User succesvol verwijderd");
                break;
            default:
                throw new IllegalArgumentException("Onbekende routing key: " + routingKey);
        }
    }
}