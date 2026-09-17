// Agentwin UNO R4 WiFi reference firmware: D7 LED plus optional A5 analog input.
#include <Arduino.h>
#include <ArduinoJson.h>
#define USE_WIFI_MQTT 0
#define ENABLE_ANALOG_A5 0
#if USE_WIFI_MQTT
#include <WiFiS3.h>
#include <ArduinoMqttClient.h>
#include "secrets.h"
WiFiClient network; MqttClient mqtt(network);
#endif
const char PROJECT_ID[] = "project-b9324cdd42";
const char DEVICE_ID[] = "uno-r4-01";
const char LED_COMPONENT_ID[] = "led";
const char LED_FIELD[] = "led_on";
const char ACK_FIELD[] = "last_command_id";
const char ANALOG_FIELD[] = "analog_raw";
const uint8_t LED_PIN = 7, ANALOG_PIN = A5;
const unsigned long SAMPLE_INTERVAL_MS = 1000;
unsigned long sequenceNumber = 0, lastSample = 0, lastReconnect = 0;
char bootId[48], lastCommandId[48] = ""; bool ledOn = false; String commandLine;

void applyCommand(const String &framed) {
  String line = framed; if (line.startsWith("CMD ")) line.remove(0, 4);
  if (line.length() == 0 || line.length() > 768) return;
  StaticJsonDocument<768> command; if (deserializeJson(command, line)) return;
  const char *project = command["project_id"] | "", *device = command["device_id"] | "";
  const char *commandId = command["command_id"] | "", *action = command["action"] | "", *component = command["component_id"] | "";
  if (command["schema_version"] != 1 || strcmp(project, PROJECT_ID) || strcmp(device, DEVICE_ID) || strcmp(action, "set_led") || strcmp(component, LED_COMPONENT_ID)) return;
  if (!command["value"].is<bool>() || strlen(commandId) == 0 || strlen(commandId) >= sizeof(lastCommandId)) return;
  ledOn = command["value"].as<bool>(); digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  strncpy(lastCommandId, commandId, sizeof(lastCommandId) - 1); lastCommandId[sizeof(lastCommandId) - 1] = '\0';
}
#if USE_WIFI_MQTT
void onMqttMessage(int) { String body; while (mqtt.available()) body += (char)mqtt.read(); applyCommand(body); }
void connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) { WiFi.begin(WIFI_SSID, WIFI_PASSWORD); return; }
  if (mqtt.connected()) return;
  mqtt.setId(DEVICE_ID); mqtt.setUsernamePassword(MQTT_USER, MQTT_PASSWORD); mqtt.setConnectionTimeout(2000);
  if (mqtt.connect(MQTT_HOST, MQTT_PORT)) { char topic[160]; snprintf(topic, sizeof(topic), "agentwin/%s/%s/command", PROJECT_ID, DEVICE_ID); mqtt.subscribe(topic, 1); snprintf(topic, sizeof(topic), "agentwin/%s/%s/status", PROJECT_ID, DEVICE_ID); mqtt.beginMessage(topic); mqtt.print("{\"online\":true}"); mqtt.endMessage(); }
}
#endif
void setup() {
  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW); pinMode(ANALOG_PIN, INPUT); Serial.begin(115200);
  snprintf(bootId, sizeof(bootId), "uno-r4-%08lx", micros());
#if USE_WIFI_MQTT
  mqtt.onMessage(onMqttMessage);
#endif
}
void publishTelemetry(unsigned long now) {
  StaticJsonDocument<768> packet; packet["schema_version"] = 1; packet["project_id"] = PROJECT_ID; packet["device_id"] = DEVICE_ID;
  packet["boot_id"] = bootId; packet["sequence"] = sequenceNumber++; packet["uptime_ms"] = now; packet["session_registration"] = true;
  JsonObject readings = packet.createNestedObject("readings"); readings[LED_FIELD] = ledOn;
  if (lastCommandId[0]) readings[ACK_FIELD] = lastCommandId; else readings[ACK_FIELD] = nullptr;
#if ENABLE_ANALOG_A5
  readings[ANALOG_FIELD] = analogRead(ANALOG_PIN);
#endif
  if (measureJson(packet) > 700) return;
#if USE_WIFI_MQTT
  if (mqtt.connected()) { char topic[160]; snprintf(topic, sizeof(topic), "agentwin/%s/%s/telemetry", PROJECT_ID, DEVICE_ID); mqtt.beginMessage(topic); serializeJson(packet, mqtt); mqtt.endMessage(); }
#else
  serializeJson(packet, Serial); Serial.println();
#endif
}
void loop() {
#if USE_WIFI_MQTT
  if (millis() - lastReconnect >= 5000) { lastReconnect = millis(); connectMqtt(); } if (mqtt.connected()) mqtt.poll();
#else
  while (Serial.available()) { char incoming = (char)Serial.read(); if (incoming == '\n') { applyCommand(commandLine); commandLine = ""; } else if (incoming != '\r' && commandLine.length() < 768) commandLine += incoming; }
#endif
  unsigned long now = millis(); if (now - lastSample < SAMPLE_INTERVAL_MS) return; lastSample = now; publishTelemetry(now);
}
