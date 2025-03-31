package com.expo.crm;

import com.expo.crm.rbmq.consumer.CreateUserQueueConsume;
import com.expo.crm.rbmq.consumer.RabbitmqClient;
import com.expo.crm.salesforce.SalesForceClient;
import com.expo.crm.rbmq.consumer.*;
import com.expo.crm.salesforce.SalesForceClient;
import com.rabbitmq.client.Channel;

public class UserFlow {
    public static void main(String[] args) throws Exception {
//        System.out.println("Starting application...");
//
//        // Initialize clients
//        SalesForceClient salesForceClient = new SalesForceClient(); // Assumes login happens here
//        RabbitmqClient rabbitmqClient = new RabbitmqClient();
//        String queueName = "create_user_queue"; // Hardcoded for simplicity
//
//        // Start the consumer
//        CreateUserQueueConsume consumer = new CreateUserQueueConsume(rabbitmqClient, salesForceClient, queueName);
//        consumer.startConsuming();
//
//        // Add shutdown hook to close RabbitMQ connection gracefully
//        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
//            try {
//                rabbitmqClient.close();
//                System.out.println("RabbitMQ connection closed.");
//            } catch (Exception e) {
//                System.err.println("Error closing RabbitMQ connection: " + e.getMessage());
//            }
//        }));
//
//        // Keep the application running
//        System.out.println("Application running, press Ctrl+C to stop.");
//        Thread.currentThread().join();
        System.out.println("Starting application...");

        // Initialiseer clients
        SalesForceClient salesForceClient = new SalesForceClient();
        RabbitmqClient rabbitmqClient = new RabbitmqClient();
        Channel channel = rabbitmqClient.createChannel();

        // Declareer queues en bindings voor users
        String userExchange = "user";
        channel.queueDeclare("user_create_queue", false, false, false, null);
        channel.queueBind("user_create_queue", userExchange, "crm.user.create");
        channel.queueDeclare("user_update_queue", false, false, false, null);
        channel.queueBind("user_update_queue", userExchange, "crm.user.update");
        channel.queueDeclare("user_delete_queue", false, false, false, null);
        channel.queueBind("user_delete_queue", userExchange, "crm.user.delete");

        // Declareer queues en bindings voor companies
        String companyExchange = "company";
        channel.queueDeclare("company_create_queue", false, false, false, null);
        channel.queueBind("company_create_queue", companyExchange, "crm.company.create");
        channel.queueDeclare("company_update_queue", false, false, false, null);
        channel.queueBind("company_update_queue", companyExchange, "crm.company.update");
        channel.queueDeclare("company_delete_queue", false, false, false, null);
        channel.queueBind("company_delete_queue", companyExchange, "crm.company.delete");

        // Start consumers
        channel.basicConsume("user_create_queue", false, new UserCreateConsumer(channel, salesForceClient));
        channel.basicConsume("user_update_queue", false, new UserUpdateConsumer(channel, salesForceClient));
        channel.basicConsume("user_delete_queue", false, new UserDeleteConsumer(channel, salesForceClient));
        channel.basicConsume("company_create_queue", false, new CompanyCreateConsumer(channel, salesForceClient));
        channel.basicConsume("company_update_queue", false, new CompanyUpdateConsumer(channel, salesForceClient));
        channel.basicConsume("company_delete_queue", false, new CompanyDeleteConsumer(channel, salesForceClient));

        // Shutdown hook om resources te sluiten
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                channel.close();
                rabbitmqClient.close();
                System.out.println("Resources gesloten.");
            } catch (Exception e) {
                System.err.println("Fout bij sluiten resources: " + e.getMessage());
            }
        }));

        // Houd de applicatie draaiende
        System.out.println("Applicatie draait, druk Ctrl+C om te stoppen.");
        Thread.currentThread().join();
    }
}