#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoMqttClient.h>
#include <WiFiS3.h>
#include <AgentwinCore.h>
#include <HardwareDriver.h>
#include <MqttTransport.h>
#include <UnoR4BootId.h>
#include <UnoR4WifiNetwork.h>

#include "project_config.h"
#include "secrets.h"
#include "src/RfJammingDriver.h"

WiFiClient networkClient;
MqttClient mqttClient(networkClient);
UnoR4WifiNetwork network(WIFI_SSID, WIFI_PASSWORD, ProjectConfig::RECONNECT_INTERVAL_MS);
MqttTransport transport(mqttClient, ProjectConfig::PROJECT_ID, ProjectConfig::DEVICE_ID,
                        MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASSWORD,
                        ProjectConfig::RECONNECT_INTERVAL_MS);
RfJammingDriver detector(ProjectConfig::SENSOR_PIN, ProjectConfig::ADC_REFERENCE_V,
                         ProjectConfig::MODEL_SAMPLE_INTERVAL_MS);
HardwareDriver *drivers[] = {&detector};
AgentwinCore agentwin(ProjectConfig::PROJECT_ID, ProjectConfig::DEVICE_ID,
                      ProjectConfig::ACK_FIELD, ProjectConfig::TELEMETRY_INTERVAL_MS,
                      transport, drivers, 1);

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);  // Shows that battery power reached setup().
  char bootId[48];
  UnoR4BootId::create(ProjectConfig::BOOT_PREFIX, bootId, sizeof(bootId));
  network.begin();
  agentwin.begin(bootId);
}

void loop() {
  network.loop();
  transport.setNetworkAvailable(network.connected());
  agentwin.loop(millis());
  // Built-in D13 LED: solid = MQTT, slow blink = Wi-Fi only, fast blink = no Wi-Fi.
  const unsigned long blinkPeriodMs = network.connected() ? 500 : 150;
  digitalWrite(LED_BUILTIN, transport.connected() ? HIGH :
               ((millis() / blinkPeriodMs) % 2 == 0 ? HIGH : LOW));
}
