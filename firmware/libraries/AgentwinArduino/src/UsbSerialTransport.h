#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <AgentwinTransport.h>

class UsbSerialTransport : public AgentwinTransport {
 public:
  UsbSerialTransport(Stream &serial, unsigned long baud) : serial_(serial), baud_(baud) {}
  void begin() override { Serial.begin(baud_); }
  void loop() override {
    if (hasPending_) return;
    while (serial_.available()) {
      const char incoming = static_cast<char>(serial_.read());
      if (incoming == '\n') {
        if (!overflowed_ && lineLength_) {
          line_[lineLength_] = '\0';
          hasPending_ = true;
        } else {
          lineLength_ = 0;
        }
        overflowed_ = false;
        if (hasPending_) return;
      } else if (incoming != '\r' && !overflowed_) {
        if (lineLength_ < MAX_COMMAND_BYTES) line_[lineLength_++] = incoming;
        else overflowed_ = true;  // Discard the entire oversized line.
      }
    }
  }
  bool readCommand(String &command) override {
    if (!hasPending_) return false;
    command = line_;
    lineLength_ = 0;
    hasPending_ = false;
    return true;
  }
  bool publishTelemetry(JsonDocument &packet) override {
    serializeJson(packet, serial_);
    serial_.println();
    return true;
  }

 private:
  static constexpr size_t MAX_COMMAND_BYTES = 384;
  Stream &serial_;
  unsigned long baud_;
  char line_[MAX_COMMAND_BYTES + 1] = {};
  size_t lineLength_ = 0;
  bool hasPending_ = false;
  bool overflowed_ = false;
};
