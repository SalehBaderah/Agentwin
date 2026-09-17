#pragma once
#include <Arduino.h>

namespace ProjectConfig {
constexpr char PROJECT_ID[] = "replace-with-project-id";
constexpr char DEVICE_ID[] = "r4-rf-01";
constexpr char BOOT_PREFIX[] = "uno-r4-rf";
// This project is read-only, so it does not emit a command acknowledgement field.
constexpr char ACK_FIELD[] = "";
constexpr unsigned long TELEMETRY_INTERVAL_MS = 1000;
constexpr unsigned long MODEL_SAMPLE_INTERVAL_MS = 100;
constexpr unsigned long RECONNECT_INTERVAL_MS = 5000;

// UNO R4 WiFi exposes A0-A5 on its headers. A10 is not an exposed UNO pin.
constexpr uint8_t SENSOR_PIN = A5;
// Preserve the supplied model's 10-bit/3.3 V feature calculation. Confirm the
// actual module output and reference with a meter before treating volts as calibrated.
constexpr float ADC_REFERENCE_V = 3.3f;
}  // namespace ProjectConfig
