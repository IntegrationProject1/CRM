package com.expo.crm.rbmq.consumer;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.ContactController;
import org.json.JSONObject;
import java.io.IOException;

public class UserUpdateConsumer extends BaseConsumer {
    private final ContactController contactController;

    public UserUpdateConsumer(Channel channel, SalesForceClient salesForceClient) {
        super(channel);
        this.contactController = new ContactController(salesForceClient);
    }

    @Override
    public void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
        String xmlMessage = new String(body, "UTF-8");
        try {
            String json = convertXmlToJson(xmlMessage);
            JSONObject userJson = getInnerObject(json, "user");
            String id = userJson.getString("Id");
            userJson.remove("Id");
            var response = contactController.update(id, userJson.toString());
            if (response.statusCode() != 204) {
                throw new RuntimeException("Failed to update user: " + response.body());
            }
            System.out.println("User updated successfully");
            getChannel().basicAck(envelope.getDeliveryTag(), false);
        } catch (Exception e) {
            System.err.println("Error processing message: " + e.getMessage());
            getChannel().basicNack(envelope.getDeliveryTag(), false, true);
        }
    }
}