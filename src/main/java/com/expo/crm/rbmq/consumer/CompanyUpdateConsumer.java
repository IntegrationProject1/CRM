package com.expo.crm.rbmq.consumer;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.AccountController;
import org.json.JSONObject;
import java.io.IOException;

public class CompanyUpdateConsumer extends BaseConsumer {
    private final AccountController accountController;

    public CompanyUpdateConsumer(Channel channel, SalesForceClient salesForceClient) {
        super(channel);
        this.accountController = new AccountController(salesForceClient);
    }

    @Override
    public void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
        String xmlMessage = new String(body, "UTF-8");
        try {
            String json = convertXmlToJson(xmlMessage);
            JSONObject companyJson = getInnerObject(json, "company");
            String id = companyJson.getString("Id");
            companyJson.remove("Id");
            var response = accountController.update(id, companyJson.toString());
            if (response.statusCode() != 204) {
                throw new RuntimeException("Failed to update company: " + response.body());
            }
            System.out.println("Company updated successfully");
            getChannel().basicAck(envelope.getDeliveryTag(), false);
        } catch (Exception e) {
            System.err.println("Error processing message: " + e.getMessage());
            getChannel().basicNack(envelope.getDeliveryTag(), false, true);
        }
    }
}