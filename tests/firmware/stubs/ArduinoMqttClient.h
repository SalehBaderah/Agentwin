#pragma once
#include <Arduino.h>

// Host test double for the MQTT socket. ArduinoJson itself is the real library.
class MqttClient {
 public:
  bool online = true;
  bool failBegin = false;
  bool failEnd = false;
  bool shortWrite = false;
  unsigned int byteWrites = 0;
  unsigned int bufferWrites = 0;
  unsigned long announcedSize = 0;
  std::string payload;
  bool connected() { return online; }
  void stop() { online = false; }
  void poll() {}
  void onMessage(void (*)(int)) {}
  int available() { return 0; }
  int read() { return -1; }
  void setId(const char *) {}
  void setUsernamePassword(const char *, const char *) {}
  void setConnectionTimeout(unsigned long) {}
  int connect(const char *, int) { online = true; return 1; }
  int subscribe(const char *, int) { return 1; }
  int beginMessage(const char *, unsigned long size = 0) {
    announcedSize = size;
    payload.clear();
    return failBegin ? 0 : 1;
  }
  int endMessage() { return failEnd ? 0 : 1; }
  size_t write(uint8_t byte) {
    ++byteWrites;
    payload += static_cast<char>(byte);
    ++testMillis;
    return 1;
  }
  size_t write(const uint8_t *bytes, size_t size) {
    ++bufferWrites;
    ++testMillis;
    const size_t written = shortWrite && size ? size - 1 : size;
    payload.append(reinterpret_cast<const char *>(bytes), written);
    return written;
  }
  size_t print(const char *text) {
    return write(reinterpret_cast<const uint8_t *>(text), strlen(text));
  }
};
