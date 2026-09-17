#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

class HardwareDriver {
 public:
  virtual ~HardwareDriver() = default;
  virtual void begin() = 0;
  virtual void loop(unsigned long) {}
  virtual void appendReadings(JsonObject readings) = 0;
  virtual bool handlesCommand(const char *, const char *) const { return false; }
  virtual bool applyCommand(JsonVariantConst) { return false; }
};
