#pragma once
#include <Arduino.h>
#include <WiFiS3.h>

class UnoR4WifiNetwork {
 public:
  UnoR4WifiNetwork(const char *ssid, const char *password, unsigned long reconnectIntervalMs)
      : ssid_(ssid), password_(password), reconnectIntervalMs_(reconnectIntervalMs) {}
  void begin() { attemptConnection(); }
  void loop() {
    if (connected()) return;
    const unsigned long now = millis();
    if (now - lastAttemptMs_ >= reconnectIntervalMs_) attemptConnection();
  }
  bool connected() const { return WiFi.status() == WL_CONNECTED; }

 private:
  void attemptConnection() { lastAttemptMs_ = millis(); WiFi.begin(ssid_, password_); }
  const char *ssid_;
  const char *password_;
  unsigned long reconnectIntervalMs_;
  unsigned long lastAttemptMs_ = 0;
};
