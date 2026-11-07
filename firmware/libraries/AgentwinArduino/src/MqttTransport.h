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
    const unsigned long started = millis();
    if (!mqtt_.connected()) return finishPublish(false, started);
    // ArduinoMqttClient buffers unsized messages in a 256-byte TX buffer.
    // Stream an explicitly sized packet, but serialize locally first: writing
    // JSON directly to WiFiS3 can issue a separate Wi-Fi transaction per byte.
    char payload[MAX_TELEMETRY_BYTES];
    const size_t payloadSize = measureJson(packet);
    if (payloadSize >= sizeof(payload) || serializeJson(packet, payload, sizeof(payload)) != payloadSize)
      return finishPublish(false, started);
    if (mqtt_.beginMessage(telemetryTopic_, static_cast<unsigned long>(payloadSize)) != 1) {
      mqtt_.stop();
      return finishPublish(false, started);
    }
    const size_t written = mqtt_.write(reinterpret_cast<const uint8_t *>(payload), payloadSize);
    const bool published = mqtt_.endMessage() == 1;
    if (written != payloadSize || !published) mqtt_.stop();
    return finishPublish(written == payloadSize && published, started);
  }
  unsigned long publishedPackets() const { return publishedPackets_; }
  unsigned long failedPackets() const { return failedPackets_; }
  unsigned long lastPublishMs() const { return lastPublishMs_; }
  unsigned long lastPublishDurationMs() const { return lastPublishDurationMs_; }

 private:
  static constexpr size_t MAX_COMMAND_BYTES = 768;
  static constexpr size_t MAX_TELEMETRY_BYTES = 768;
  bool finishPublish(bool published, unsigned long started) {
    lastPublishDurationMs_ = millis() - started;
    if (published) {
      ++publishedPackets_;
      lastPublishMs_ = millis();
    } else {
      ++failedPackets_;
    }
    return published;
  }
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
  unsigned long publishedPackets_ = 0;
  unsigned long failedPackets_ = 0;
  unsigned long lastPublishMs_ = 0;
  unsigned long lastPublishDurationMs_ = 0;
  bool networkAvailable_ = false;
  bool hasPending_ = false;
  String pending_;
  char clientId_[64];
  char telemetryTopic_[160];
  char commandTopic_[160];
  char statusTopic_[160];
};
