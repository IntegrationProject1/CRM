package com.expo.crm;

import com.expo.crm.rbmq.consumer.CompanyConsumer;
import com.expo.crm.rbmq.ConsumerClient;
import com.expo.crm.rbmq.consumer.UserConsumer;
import com.expo.crm.salesforce.SalesForceClient;

public class UserFlow {
    public static void main(String[] args) throws Exception {
        System.out.println("Applicatie wordt gestart...");

        // Initialiseer clients
        SalesForceClient salesForceClient = new SalesForceClient();
        ConsumerClient consumerClient = new ConsumerClient();

        // Start UserConsumer
        UserConsumer userConsumer = new UserConsumer(consumerClient, salesForceClient);
        userConsumer.startConsuming();

        // Start CompanyConsumer
        CompanyConsumer companyConsumer = new CompanyConsumer(consumerClient, salesForceClient);
        companyConsumer.startConsuming();

        // Voeg shutdown hook toe om resources op te ruimen
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                consumerClient.close();
                System.out.println("RabbitMQ-verbinding gesloten.");
            } catch (Exception e) {
                System.err.println("Fout bij sluiten RabbitMQ-verbinding: " + e.getMessage());
            }
        }));

        // Houd de main thread in leven
        System.out.println("Applicatie draait, druk op Ctrl+C om te stoppen.");
        Thread.currentThread().join();
    }
}