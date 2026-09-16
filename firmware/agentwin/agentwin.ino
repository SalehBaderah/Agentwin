// Agentwin UNO R4 WiFi USB LED controller.
#include <Arduino.h>

const char PROJECT_ID[] = "smart-connectivity";
const char DEVICE_ID[] = "uno-r4-01";
const int LED_PIN = 7;
const unsigned long SAMPLE_INTERVAL_MS = 1000;

unsigned long sequenceNumber = 0;
unsigned long lastSample = 0;
char bootId[48];
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
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Serial.begin(115200);
  unsigned long startupMicros = micros();
  snprintf(bootId, sizeof(bootId), "uno-r4-%08lx", startupMicros);
}

void loop() {
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
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = now;

  char commandValue[64];
  if (lastCommandId[0]) snprintf(commandValue, sizeof(commandValue), "\"%s\"", lastCommandId);
  else snprintf(commandValue, sizeof(commandValue), "null");

  char payload[480];
  snprintf(payload, sizeof(payload),
           "{\"schema_version\":1,\"project_id\":\"%s\",\"device_id\":\"%s\",\"boot_id\":\"%s\",\"sequence\":%lu,\"uptime_ms\":%lu,\"readings\":{\"led_on\":%s,\"last_command_id\":%s}}",
           PROJECT_ID, DEVICE_ID, bootId, sequenceNumber++, now,
           ledOn ? "true" : "false", commandValue);
  Serial.println(payload);
}
