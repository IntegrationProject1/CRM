package com.expo.crm.rbmq.consumer;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.AccountController;
import org.json.JSONObject;
import java.io.IOException;

public class CompanyCreateConsumer extends BaseConsumer {
    private final AccountController accountController;

    public CompanyCreateConsumer(Channel channel, SalesForceClient salesForceClient) {
        super(channel);
        this.accountController = new AccountController(salesForceClient);
    }

    @Override
    public void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
        String xmlMessage = new String(body, "UTF-8");
        try {
            String json = convertXmlToJson(xmlMessage);
            JSONObject companyJson = getInnerObject(json, "company");
            var response = accountController.create(companyJson.toString());
            if (response.statusCode() != 201) {
                throw new RuntimeException("Failed to create company: " + response.body());
            }
            System.out.println("Company created successfully: " + response.body());
            getChannel().basicAck(envelope.getDeliveryTag(), false);
        } catch (Exception e) {
            System.err.println("Error processing message: " + e.getMessage());
            getChannel().basicNack(envelope.getDeliveryTag(), false, true);
        }
    }
}