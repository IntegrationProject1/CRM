package com.expo.crm;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.util.HashMap;

public class EnvReader {
    private static final HashMap<String, String> env = new HashMap<>();

    static {
        try {
            String projectRoot = System.getProperty("user.dir");
            File file = new File(projectRoot + "/.env");
            BufferedReader reader = new BufferedReader(new FileReader(file));

            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.trim().startsWith("#") && line.contains("=")) {
                    String[] parts = line.split("=", 2);
                    env.put(parts[0].trim(), parts[1].trim());
                }
            }
        } catch (IOException e) {
            System.err.println("FOUT bij lezen .env: " + e.getMessage());
        }
    }

    public static String get(String key) {
        return env.get(key);
    }
}
