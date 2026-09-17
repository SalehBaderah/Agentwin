#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "AgentwinTransport.h"
#include "HardwareDriver.h"

class AgentwinCore {
 public:
  AgentwinCore(const char *projectId, const char *deviceId, const char *ackField,
               unsigned long sampleIntervalMs, AgentwinTransport &transport,
               HardwareDriver **drivers, size_t driverCount)
      : projectId_(projectId), deviceId_(deviceId), ackField_(ackField),
        sampleIntervalMs_(sampleIntervalMs), transport_(transport),
        drivers_(drivers), driverCount_(driverCount) {
    bootId_[0] = '\0';
    lastCommandId_[0] = '\0';
  }

  void begin(const char *bootId) {
    copyBounded(bootId_, sizeof(bootId_), bootId);
    for (size_t i = 0; i < driverCount_; ++i) drivers_[i]->begin();
    transport_.begin();
  }

  void loop(unsigned long now) {
    transport_.loop();
    for (size_t i = 0; i < driverCount_; ++i) drivers_[i]->loop(now);
    String command;
    while (transport_.readCommand(command)) applyCommand(command);
    if (now - lastSampleMs_ < sampleIntervalMs_) return;
    lastSampleMs_ = now;
    publishTelemetry(now);
  }

 private:
  static constexpr size_t COMMAND_ID_SIZE = 48;
  static constexpr size_t BOOT_ID_SIZE = 48;
  static constexpr size_t MAX_COMMAND_BYTES = 768;
  static constexpr size_t MAX_TELEMETRY_BYTES = 700;

  static void copyBounded(char *destination, size_t capacity, const char *source) {
    if (!source) source = "";
    strncpy(destination, source, capacity - 1);
    destination[capacity - 1] = '\0';
  }

  void applyCommand(const String &framed) {
    const bool prefixed = framed.startsWith("CMD ");
    const size_t bodyLength = framed.length() - (prefixed ? 4 : 0);
    if (bodyLength == 0 || bodyLength > MAX_COMMAND_BYTES) return;
    const char *body = framed.c_str() + (prefixed ? 4 : 0);
#if defined(ARDUINO_ARCH_AVR)
    StaticJsonDocument<384> command;
#else
    JsonDocument command;
#endif
    if (deserializeJson(command, body)) return;
    const char *projectId = command["project_id"] | "";
    const char *deviceId = command["device_id"] | "";
    const char *commandId = command["command_id"] | "";
    const char *componentId = command["component_id"] | "";
    const char *action = command["action"] | "";
    if (command["schema_version"] != 1 || strcmp(projectId, projectId_) != 0 ||
        strcmp(deviceId, deviceId_) != 0 || commandId[0] == '\0' ||
        strlen(commandId) >= COMMAND_ID_SIZE || componentId[0] == '\0' || action[0] == '\0') return;

    for (size_t i = 0; i < driverCount_; ++i) {
      if (!drivers_[i]->handlesCommand(componentId, action)) continue;
      if (drivers_[i]->applyCommand(command["value"]))
        copyBounded(lastCommandId_, sizeof(lastCommandId_), commandId);
      return;
    }
  }

  void publishTelemetry(unsigned long now) {
#if defined(ARDUINO_ARCH_AVR)
    StaticJsonDocument<448> packet;
#else
    JsonDocument packet;
#endif
    packet["schema_version"] = 1;
    packet["project_id"] = projectId_;
    packet["device_id"] = deviceId_;
    packet["boot_id"] = bootId_;
    packet["sequence"] = sequence_++;
    packet["uptime_ms"] = now;
    packet["session_registration"] = true;
    JsonObject readings = packet["readings"].to<JsonObject>();
    for (size_t i = 0; i < driverCount_; ++i) drivers_[i]->appendReadings(readings);
    if (ackField_[0]) {
      if (lastCommandId_[0]) readings[ackField_] = lastCommandId_;
      else readings[ackField_] = nullptr;
    }
    if (measureJson(packet) <= MAX_TELEMETRY_BYTES) transport_.publishTelemetry(packet);
  }

  const char *projectId_;
  const char *deviceId_;
  const char *ackField_;
  unsigned long sampleIntervalMs_;
  AgentwinTransport &transport_;
  HardwareDriver **drivers_;
  size_t driverCount_;
  unsigned long sequence_ = 0;
  unsigned long lastSampleMs_ = 0;
  char bootId_[BOOT_ID_SIZE];
  char lastCommandId_[COMMAND_ID_SIZE];
};
