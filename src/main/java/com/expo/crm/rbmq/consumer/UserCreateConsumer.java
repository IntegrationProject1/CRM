package com.expo.crm.rbmq.consumer;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.ContactController;
import org.json.JSONObject;
import java.io.IOException;

public class UserCreateConsumer extends BaseConsumer {
    private final ContactController contactController;

    public UserCreateConsumer(Channel channel, SalesForceClient salesForceClient) {
        super(channel);
        this.contactController = new ContactController(salesForceClient);
    }

    @Override
    public void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
        String xmlMessage = new String(body, "UTF-8");
        try {
            String json = convertXmlToJson(xmlMessage);
            JSONObject userJson = getInnerObject(json, "user");
            var response = contactController.create(userJson.toString());
            if (response.statusCode() != 201) {
                throw new RuntimeException("Failed to create user: " + response.body());
            }
            System.out.println("User created successfully: " + response.body());
            getChannel().basicAck(envelope.getDeliveryTag(), false);
        } catch (Exception e) {
            System.err.println("Error processing message: " + e.getMessage());
            getChannel().basicNack(envelope.getDeliveryTag(), false, true);
        }
    }
}
