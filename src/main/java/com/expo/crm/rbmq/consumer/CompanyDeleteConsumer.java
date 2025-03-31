package com.expo.crm.rbmq.consumer;

import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.AccountController;
import org.json.JSONObject;
import java.io.IOException;

public class CompanyDeleteConsumer extends BaseConsumer {
    private final AccountController accountController;

    public CompanyDeleteConsumer(Channel channel, SalesForceClient salesForceClient) {
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
            var response = accountController.delete(id);
            if (response.statusCode() != 204) {
                throw new RuntimeException("Failed to delete company: " + response.body());
            }
            System.out.println("Company deleted successfully");
            getChannel().basicAck(envelope.getDeliveryTag(), false);
        } catch (Exception e) {
            System.err.println("Error processing message: " + e.getMessage());
            getChannel().basicNack(envelope.getDeliveryTag(), false, true);
        }
    }
}
