package com.expo.crm;

import com.expo.crm.rbmq.sender.heartbeat.MonitoringHeartbeatCreate;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class HeartbeatFlow {
    private static final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

    public static void start() {
        scheduler.scheduleAtFixedRate(
                MonitoringHeartbeatCreate::send,
                0, // Start direct
                1, // Interval van 1 seconden
                TimeUnit.SECONDS
        );
    }
}