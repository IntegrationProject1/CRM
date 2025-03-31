package com.expo.crm.rbmq.consumer;

import com.rabbitmq.client.Channel;
import com.rabbitmq.client.DefaultConsumer;
import com.rabbitmq.client.Envelope;
import com.rabbitmq.client.AMQP;
import org.json.JSONObject;
import java.io.IOException;

public abstract class BaseConsumer extends DefaultConsumer {
    public BaseConsumer(Channel channel) {
        super(channel);
    }

    protected String convertXmlToJson(String xml) throws Exception {
        return Converter.xmlToJson(xml); // Aanname: Converter klasse bestaat
    }

    protected JSONObject getInnerObject(String json, String root) {
        JSONObject jsonObject = new JSONObject(json);
        return jsonObject.getJSONObject(root);
    }

    @Override
    public abstract void handleDelivery(String consumerTag, Envelope envelope, AMQP.BasicProperties properties, byte[] body) throws IOException;
}