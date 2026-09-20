#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoMqttClient.h>
#include <AgentwinTransport.h>

class MqttTransport : public AgentwinTransport {
 public:
  MqttTransport(MqttClient &mqtt, const char *projectId, const char *deviceId,
                const char *host, int port, const char *username, const char *password,
                unsigned long reconnectIntervalMs)
      : mqtt_(mqtt), host_(host), port_(port), username_(username), password_(password),
        reconnectIntervalMs_(reconnectIntervalMs) {
    snprintf(telemetryTopic_, sizeof(telemetryTopic_), "agentwin/%s/%s/telemetry", projectId, deviceId);
    snprintf(commandTopic_, sizeof(commandTopic_), "agentwin/%s/%s/command", projectId, deviceId);
    snprintf(statusTopic_, sizeof(statusTopic_), "agentwin/%s/%s/status", projectId, deviceId);
    strncpy(clientId_, deviceId, sizeof(clientId_) - 1);
    clientId_[sizeof(clientId_) - 1] = '\0';
  }
  void begin() override { active() = this; mqtt_.onMessage(onMessage); }
  void setNetworkAvailable(bool available) {
    if (networkAvailable_ && !available) mqtt_.stop();
    if (!networkAvailable_ && available)
      lastReconnectMs_ = millis() - reconnectIntervalMs_;  // Retry immediately after Wi-Fi returns.
    networkAvailable_ = available;
  }
  void loop() override {
    if (!networkAvailable_) return;
    if (mqtt_.connected()) mqtt_.poll();
    if (mqtt_.connected()) return;
    const unsigned long now = millis();
    if (now - lastReconnectMs_ < reconnectIntervalMs_) return;
    lastReconnectMs_ = now;
    connect();
  }
  bool connected() { return networkAvailable_ && mqtt_.connected(); }
  bool readCommand(String &command) override {
    if (!hasPending_) return false;
    command = pending_;
    pending_ = "";
    hasPending_ = false;
    return true;
  }
  bool publishTelemetry(JsonDocument &packet) override {
    if (!mqtt_.connected()) return false;
    // ArduinoMqttClient buffers unsized messages in a 256-byte TX buffer.
    // Supplying the exact length streams the JSON instead of truncating it.
    const size_t payloadSize = measureJson(packet);
    if (mqtt_.beginMessage(telemetryTopic_, static_cast<unsigned long>(payloadSize)) != 1)
      return false;
    const size_t written = serializeJson(packet, mqtt_);
    const bool published = mqtt_.endMessage() == 1;
    if (written != payloadSize || !published) mqtt_.stop();
    return written == payloadSize && published;
  }

 private:
  static constexpr size_t MAX_COMMAND_BYTES = 768;
  static MqttTransport *&active() { static MqttTransport *instance = nullptr; return instance; }
  static void onMessage(int messageSize) {
    MqttTransport *self = active();
    if (!self || messageSize <= 0 || messageSize > static_cast<int>(MAX_COMMAND_BYTES)) return;
    self->pending_ = "";
    while (self->mqtt_.available()) self->pending_ += static_cast<char>(self->mqtt_.read());
    self->hasPending_ = self->pending_.length() > 0;
  }
  void connect() {
    mqtt_.setId(clientId_);
    mqtt_.setUsernamePassword(username_, password_);
    mqtt_.setConnectionTimeout(2000);
    if (!mqtt_.connect(host_, port_)) return;
    mqtt_.subscribe(commandTopic_, 1);
    mqtt_.beginMessage(statusTopic_);
    mqtt_.print("{\"online\":true}");
    mqtt_.endMessage();
  }

  MqttClient &mqtt_;
  const char *host_;
  int port_;
  const char *username_;
  const char *password_;
  unsigned long reconnectIntervalMs_;
  unsigned long lastReconnectMs_ = 0;
  bool networkAvailable_ = false;
  bool hasPending_ = false;
  String pending_;
  char clientId_[64];
  char telemetryTopic_[160];
  char commandTopic_[160];
  char statusTopic_[160];
};
