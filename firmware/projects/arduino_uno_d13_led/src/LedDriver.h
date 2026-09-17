#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareDriver.h>

class LedDriver : public HardwareDriver {
 public:
  LedDriver(const char *componentId, const char *action, const char *field,
            uint8_t pin, bool activeHigh)
      : componentId_(componentId), action_(action), field_(field), pin_(pin), activeHigh_(activeHigh) {}
  void begin() override { pinMode(pin_, OUTPUT); writeOutput(); }
  void appendReadings(JsonObject readings) override { readings[field_] = state_; }
  bool handlesCommand(const char *componentId, const char *action) const override {
    return strcmp(componentId, componentId_) == 0 && strcmp(action, action_) == 0;
  }
  bool applyCommand(JsonVariantConst value) override {
    if (!value.is<bool>()) return false;
    state_ = value.as<bool>();
    writeOutput();
    return true;
  }

 private:
  void writeOutput() { digitalWrite(pin_, state_ == activeHigh_ ? HIGH : LOW); }
  const char *componentId_;
  const char *action_;
  const char *field_;
  uint8_t pin_;
  bool activeHigh_;
  bool state_ = false;
};
