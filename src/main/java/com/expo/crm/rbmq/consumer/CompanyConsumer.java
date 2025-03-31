package com.expo.crm.rbmq.consumer;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.DefaultConsumer;
import com.rabbitmq.client.Envelope;
import com.rabbitmq.client.AMQP;
import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.salesforce.controller.AccountController;
import com.expo.crm.util.Converter;
import org.json.JSONObject;
import java.io.IOException;

public class CompanyConsumer {
    private final Channel channel;
    private final SalesForceClient salesForceClient;
    private final String exchangeName = "company";
    private final String[] routingKeys = {"crm.company.create", "crm.company.update", "crm.company.delete"};

    public CompanyConsumer(ConsumerClient consumerClient, SalesForceClient salesForceClient) throws Exception {
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
            channel.basicConsume(queueName, autoAck, "companyConsumer_" + routingKey,
                    new DefaultConsumer(channel) {
                        @Override
                        public void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException {
                            String message = new String(body, "UTF-8");
                            try {
                                processMessage(message, routingKey);
                                channel.basicAck(envelope.getDeliveryTag(), false);
                            } catch (Exception e) {
                                System.err.println("Failed to process company message: " + e.getMessage());
                                channel.basicNack(envelope.getDeliveryTag(), false, true);
                            }
                        }
                    });
        }
        System.out.println("CompanyConsumer gestart, luistert naar queues voor company-operaties.");
    }

    private void processMessage(String xmlMessage, String routingKey) throws Exception {
        String json = Converter.xmlToJson(xmlMessage);
        JSONObject jsonObject = new JSONObject(json).getJSONObject("company");
        AccountController accountController = new AccountController(salesForceClient);

        switch (routingKey) {
            case "crm.company.create":
                var createResponse = accountController.create(jsonObject.toString());
                if (createResponse.statusCode() != 201) {
                    throw new RuntimeException("Fout bij aanmaken company: " + createResponse.body());
                }
                System.out.println("Company succesvol aangemaakt: " + createResponse.body());
                break;
            case "crm.company.update":
                String id = jsonObject.getString("Id");
                jsonObject.remove("Id");
                var updateResponse = accountController.update(id, jsonObject.toString());
                if (updateResponse.statusCode() != 204) {
                    throw new RuntimeException("Fout bij updaten company: " + updateResponse.body());
                }
                System.out.println("Company succesvol geüpdatet");
                break;
            case "crm.company.delete":
                String deleteId = jsonObject.getString("Id");
                var deleteResponse = accountController.delete(deleteId);
                if (deleteResponse.statusCode() != 204) {
                    throw new RuntimeException("Fout bij verwijderen company: " + deleteResponse.body());
                }
                System.out.println("Company succesvol verwijderd");
                break;
            default:
                throw new IllegalArgumentException("Onbekende routing key: " + routingKey);
        }
    }
}
