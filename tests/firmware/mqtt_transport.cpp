#include <cassert>
#include <iostream>
#include <ArduinoJson.h>
#include <MqttTransport.h>

unsigned long testMillis = 0;

int main() {
  JsonDocument packet;
  packet["schema_version"] = 1;
  packet["project_id"] = "project-rf-test";
  packet["device_id"] = "rf-device";
  packet["boot_id"] = "rf-test-boot";
  packet["sequence"] = 50;
  packet["uptime_ms"] = 50000;
  packet["session_registration"] = true;
  JsonObject readings = packet["readings"].to<JsonObject>();
  readings["rf_detector_v"] = 0.406f;
  readings["rf_mean_v"] = 0.407f;
  readings["rf_std_v"] = 0.021f;
  readings["jamming_probability_percent"] = 1.5f;
  readings["jamming_state"] = "normal";
  assert(measureJson(packet) > 256);  // Exercise the old unsized TX-buffer limit.

  MqttClient unbuffered;
  serializeJson(packet, unbuffered);
  assert(unbuffered.byteWrites + unbuffered.bufferWrites > 1);

  MqttClient mqtt;
  MqttTransport transport(mqtt, "project-rf-test", "rf-device", "localhost", 1883, "", "", 5000);
  assert(transport.publishTelemetry(packet));
  assert(mqtt.byteWrites == 0 && mqtt.bufferWrites == 1);
  assert(mqtt.payload == unbuffered.payload);
  assert(mqtt.payload.size() == mqtt.announcedSize);
  JsonDocument decoded;
  assert(!deserializeJson(decoded, mqtt.payload));
  assert(decoded["sequence"] == 50);
  assert(decoded["readings"]["jamming_state"] == "normal");
  assert(transport.publishedPackets() == 1 && transport.failedPackets() == 0);
  assert(transport.lastPublishDurationMs() == 1);

  // Successful repeated packets continue beyond the reported 50-second boundary.
  for (unsigned long sequence = 51; sequence <= 180; ++sequence) {
    testMillis = sequence * 1000;
    packet["sequence"] = sequence;
    packet["uptime_ms"] = testMillis;
    assert(transport.publishTelemetry(packet));
  }
  assert(transport.publishedPackets() == 131);
  assert(mqtt.bufferWrites == 131);

  mqtt.shortWrite = true;
  assert(!transport.publishTelemetry(packet));
  assert(!mqtt.online && transport.failedPackets() == 1);
  mqtt.shortWrite = false;
  mqtt.online = true;
  mqtt.failBegin = true;
  assert(!transport.publishTelemetry(packet));
  assert(!mqtt.online && transport.failedPackets() == 2);
  mqtt.failBegin = false;
  mqtt.online = true;
  mqtt.failEnd = true;
  assert(!transport.publishTelemetry(packet));
  assert(!mqtt.online && transport.failedPackets() == 3);

  mqtt.online = true;
  mqtt.failEnd = false;
  packet["padding"] = std::string(800, 'x');
  const auto writes = mqtt.bufferWrites;
  assert(!transport.publishTelemetry(packet));
  assert(mqtt.bufferWrites == writes);
  assert(transport.failedPackets() == 4);
  std::cout << "MQTT payload test passed: "
            << unbuffered.byteWrites + unbuffered.bufferWrites
            << " direct-stream writes reduced to 1 buffered write; full JSON, repeated sends, failures, and bounds verified.\n";
}
