// Agentwin UNO R4 WiFi; hardware not yet wired or physically validated.
#include <Arduino.h>
#define USE_WIFI_MQTT 0  // 0: USB only, 1: Wi-Fi/MQTT only; never both.
#if USE_WIFI_MQTT
#include <WiFiS3.h>
#include <ArduinoMqttClient.h>
#include "secrets.h"
WiFiClient network;
MqttClient mqtt(network);
#endif

const char PROJECT_ID[] = "smart-connectivity";
const char DEVICE_ID[] = "uno-r4-01";
const int DETECTOR_PIN = A0;
const int LED_PIN = 7;
const int ADC_BITS = 12;
const float ADC_REFERENCE_V = 5.0f; // Nominal AR_DEFAULT; measure for accuracy.
const unsigned long SAMPLE_INTERVAL_MS = 1000;
unsigned long sequenceNumber = 0, lastSample = 0, lastReconnect = 0;
char bootId[40];
char lastCommandId[48] = "";
bool ledOn = false;
String commandLine;

void applySerialCommand(const String &line) {
  if (!line.startsWith("CMD {") || line.length() > 512) return;
  int idKey = line.indexOf("\"command_id\":\"");
  int actionKey = line.indexOf("\"action\":\"set_led\"");
  int componentKey = line.indexOf("\"component_id\":\"led\"");
  int valueKey = line.indexOf("\"value\":");
  if (idKey < 0 || actionKey < 0 || componentKey < 0 || valueKey < 0) return;
  int idStart = idKey + 14;
  int idEnd = line.indexOf('"', idStart);
  if (idEnd <= idStart || idEnd - idStart >= (int)sizeof(lastCommandId)) return;
  bool requestedOn;
  if (line.substring(valueKey + 8).startsWith("true")) requestedOn = true;
  else if (line.substring(valueKey + 8).startsWith("false")) requestedOn = false;
  else return;
  line.substring(idStart, idEnd).toCharArray(lastCommandId, sizeof(lastCommandId));
  ledOn = requestedOn;
  digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  analogReadResolution(ADC_BITS);
  analogReference(AR_DEFAULT);
  // Persist a boot counter so a reboot cannot reuse an old deduplication identity.
  // EEPROM on UNO R4 is board-supported; initialize erased flash below.
}

#include <EEPROM.h>
bool bootInitialized = false;
void initializeBoot() {
  uint32_t counter;
  EEPROM.get(0, counter);
  if (counter == 0xffffffffUL) counter = 0;
  counter++;
  EEPROM.put(0, counter);
  snprintf(bootId, sizeof(bootId), "uno-r4-%lu", (unsigned long)counter);
  bootInitialized = true;
}

void loop() {
  if (!bootInitialized) initializeBoot();
  while (Serial.available()) {
    char incoming = (char)Serial.read();
    if (incoming == '\n') {
      applySerialCommand(commandLine);
      commandLine = "";
    } else if (incoming != '\r' && commandLine.length() < 512) {
      commandLine += incoming;
    }
  }
  unsigned long now = millis();
#if USE_WIFI_MQTT
  if (now - lastReconnect >= 5000) {
    lastReconnect = now;
    if (WiFi.status() != WL_CONNECTED) WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    else if (!mqtt.connected()) {
      mqtt.setId(DEVICE_ID);
      mqtt.setUsernamePassword(MQTT_USER, MQTT_PASSWORD);
      mqtt.setConnectionTimeout(2000);
      mqtt.connect(MQTT_HOST, MQTT_PORT);
    }
  }
  if (mqtt.connected()) mqtt.poll();
#endif
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = now;
  int raw = analogRead(DETECTOR_PIN);
  float voltage = raw * ADC_REFERENCE_V / ((1UL << ADC_BITS) - 1);
  char wifiStatus[8] = "null", rssi[16] = "null";
#if USE_WIFI_MQTT
  bool wifiConnected = WiFi.status() == WL_CONNECTED;
  snprintf(wifiStatus, sizeof(wifiStatus), "%s", wifiConnected ? "true" : "false");
  if (wifiConnected) snprintf(rssi, sizeof(rssi), "%ld", WiFi.RSSI());
#endif
  char commandValue[64];
  if (lastCommandId[0]) snprintf(commandValue, sizeof(commandValue), "\"%s\"", lastCommandId);
  else snprintf(commandValue, sizeof(commandValue), "null");
  char payload[640];
  snprintf(payload, sizeof(payload), "{\"schema_version\":1,\"project_id\":\"%s\",\"device_id\":\"%s\",\"boot_id\":\"%s\",\"sequence\":%lu,\"uptime_ms\":%lu,\"readings\":{\"rf_adc_raw\":%d,\"rf_detector_v\":%.4f,\"wifi_connected\":%s,\"wifi_rssi_dbm\":%s,\"led_on\":%s,\"last_command_id\":%s}}", PROJECT_ID, DEVICE_ID, bootId, sequenceNumber++, now, raw, voltage, wifiStatus, rssi, ledOn ? "true" : "false", commandValue);
#if USE_WIFI_MQTT
  if (mqtt.connected()) {
    char topic[180];
    snprintf(topic, sizeof(topic), "agentwin/%s/%s/telemetry", PROJECT_ID, DEVICE_ID);
    mqtt.beginMessage(topic);
    mqtt.print(payload);
    mqtt.endMessage();
  }
#else
  Serial.println(payload);
#endif
}
