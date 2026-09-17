#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

class AgentwinTransport {
 public:
  virtual ~AgentwinTransport() = default;
  virtual void begin() = 0;
  virtual void loop() = 0;
  virtual bool readCommand(String &command) = 0;
  virtual bool publishTelemetry(JsonDocument &packet) = 0;
};
