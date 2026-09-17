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
        if (line_.length()) { pending_ = static_cast<String &&>(line_); hasPending_ = true; }
        line_ = "";
        if (hasPending_) return;
      } else if (incoming != '\r' && line_.length() < MAX_COMMAND_BYTES) line_ += incoming;
    }
  }
  bool readCommand(String &command) override {
    if (!hasPending_) return false;
    command = static_cast<String &&>(pending_);
    pending_ = "";
    hasPending_ = false;
    return true;
  }
  bool publishTelemetry(JsonDocument &packet) override {
    serializeJson(packet, serial_);
    serial_.println();
    return true;
  }

 private:
  static constexpr size_t MAX_COMMAND_BYTES = 768;
  Stream &serial_;
  unsigned long baud_;
  String line_;
  String pending_;
  bool hasPending_ = false;
};
