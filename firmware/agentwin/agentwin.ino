// Agentwin UNO R4 WiFi LED controller. Set USE_WIFI_MQTT to select one route.
#include <Arduino.h>
#define USE_WIFI_MQTT 0  // 0: USB serial gateway, 1: direct Wi-Fi MQTT
#if USE_WIFI_MQTT
#include <WiFiS3.h>
#include <ArduinoMqttClient.h>
#include "secrets.h"
WiFiClient network;
MqttClient mqtt(network);
#endif

const char PROJECT_ID[] = "smart-connectivity";
const char DEVICE_ID[] = "uno-r4-01";
const int LED_PIN = 7;
const unsigned long SAMPLE_INTERVAL_MS = 1000;
unsigned long sequenceNumber = 0, lastSample = 0, lastReconnect = 0;
char bootId[48], lastCommandId[48] = "";
bool ledOn = false;
String commandLine;

void applyCommand(String line) {
  if (line.startsWith("CMD ")) line.remove(0, 4);
  if (!line.startsWith("{") || line.length() > 512) return;
  int idKey = line.indexOf("\"command_id\":\"");
  int actionKey = line.indexOf("\"action\":\"set_led\"");
  int componentKey = line.indexOf("\"component_id\":\"led\"");
  int valueKey = line.indexOf("\"value\":");
  if (idKey < 0 || actionKey < 0 || componentKey < 0 || valueKey < 0) return;
  int idStart = idKey + 14, idEnd = line.indexOf('"', idStart);
  if (idEnd <= idStart || idEnd - idStart >= (int)sizeof(lastCommandId)) return;
  bool requestedOn;
  if (line.substring(valueKey + 8).startsWith("true")) requestedOn = true;
  else if (line.substring(valueKey + 8).startsWith("false")) requestedOn = false;
  else return;
  line.substring(idStart, idEnd).toCharArray(lastCommandId, sizeof(lastCommandId));
  ledOn = requestedOn; digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
}

#if USE_WIFI_MQTT
void onMqttMessage(int messageSize) {
  String body;
  while (mqtt.available()) body += (char)mqtt.read();
  applyCommand(body);
}
void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) { WiFi.begin(WIFI_SSID, WIFI_PASSWORD); return; }
  if (!mqtt.connected()) {
    mqtt.setId(DEVICE_ID); mqtt.setUsernamePassword(MQTT_USER, MQTT_PASSWORD); mqtt.setConnectionTimeout(2000);
    if (mqtt.connect(MQTT_HOST, MQTT_PORT)) {
      char commandTopic[160]; snprintf(commandTopic, sizeof(commandTopic), "agentwin/%s/%s/command", PROJECT_ID, DEVICE_ID);
      mqtt.subscribe(commandTopic, 1);
    }
  }
}
#endif

void setup() {
  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW); Serial.begin(115200);
  snprintf(bootId, sizeof(bootId), "uno-r4-%08lx", micros());
#if USE_WIFI_MQTT
  mqtt.onMessage(onMqttMessage);
#endif
}

void loop() {
#if USE_WIFI_MQTT
  unsigned long wifiNow = millis();
  if (wifiNow - lastReconnect >= 5000) { lastReconnect = wifiNow; connectMqtt(); }
  if (mqtt.connected()) mqtt.poll();
#else
  while (Serial.available()) { char incoming = (char)Serial.read(); if (incoming == '\n') { applyCommand(commandLine); commandLine = ""; } else if (incoming != '\r' && commandLine.length() < 512) commandLine += incoming; }
#endif
  unsigned long now = millis();
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = now;
  char commandValue[64];
  if (lastCommandId[0]) snprintf(commandValue, sizeof(commandValue), "\"%s\"", lastCommandId); else snprintf(commandValue, sizeof(commandValue), "null");
  char payload[360];
  snprintf(payload, sizeof(payload), "{\"schema_version\":1,\"project_id\":\"%s\",\"device_id\":\"%s\",\"boot_id\":\"%s\",\"sequence\":%lu,\"uptime_ms\":%lu,\"readings\":{\"led_on\":%s,\"last_command_id\":%s}}", PROJECT_ID, DEVICE_ID, bootId, sequenceNumber++, now, ledOn ? "true" : "false", commandValue);
#if USE_WIFI_MQTT
  if (mqtt.connected()) { char topic[160]; snprintf(topic, sizeof(topic), "agentwin/%s/%s/telemetry", PROJECT_ID, DEVICE_ID); mqtt.beginMessage(topic); mqtt.print(payload); mqtt.endMessage(); }
#else
  Serial.println(payload);
#endif
}
