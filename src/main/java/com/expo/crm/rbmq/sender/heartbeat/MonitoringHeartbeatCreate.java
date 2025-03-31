package com.expo.crm.rbmq.sender.heartbeat;

import com.expo.crm.rbmq.sender.RabbitmqSenderClientTopic;
import com.expo.crm.util.EnvReader;
import java.time.Instant;
import java.io.File;

public class MonitoringHeartbeatCreate {
    public static void send() {
        String xml = buildHeartbeatXml();
        String exchange = EnvReader.get("RABBITMQ_EXCHANGE");
        String routingKey = "monitoring.heartbeat.create";
        File xsdFile = new File("src/main/resources/heartbeat.xsd"); // Path to your XSD file

        if (exchange == null) {
            System.err.println("FOUT: RABBITMQ_EXCHANGE niet gevonden in .env");
            return;
        }

        RabbitmqSenderClientTopic.send(exchange, routingKey, xml, xsdFile);
    }

    private static String buildHeartbeatXml() {
        String serviceName = "MonitoringApp";
        String status = "OK";
        String timestamp = Instant.now().toString();
        String heartBeatInterval = "1"; // In seconden
        String version = "1.0.0";
        String host = "localhost";
        String environment = "production";

        return "<Heartbeat>\n" +
                "  <ServiceName>" + serviceName + "</ServiceName>\n" +
                "  <Status>" + status + "</Status>\n" +
                "  <Timestamp>" + timestamp + "</Timestamp>\n" +
                "  <HeartBeatInterval>" + heartBeatInterval + "</HeartBeatInterval>\n" +
                "  <Metadata>\n" +
                "    <Version>" + version + "</Version>\n" +
                "    <Host>" + host + "</Host>\n" +
                "    <Environment>" + environment + "</Environment>\n" +
                "  </Metadata>\n" +
                "</Heartbeat>";
    }
}