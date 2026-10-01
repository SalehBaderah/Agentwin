#pragma once
#include <Arduino.h>
// Generated IDs/timing only. Preserve the supplied model's hardware assumptions.
namespace ProjectConfig {
constexpr char PROJECT_ID[] = "$project_id";
constexpr char DEVICE_ID[] = "$device_id";
constexpr char BOOT_PREFIX[] = "uno-r4-rf";
constexpr char ACK_FIELD[] = "";
constexpr unsigned long TELEMETRY_INTERVAL_MS = $interval_ms;
constexpr unsigned long MODEL_SAMPLE_INTERVAL_MS = 100;
constexpr unsigned long RECONNECT_INTERVAL_MS = 5000;
constexpr uint8_t SENSOR_PIN = A5;
// Conversion assumption, not a calibration record.
constexpr float ADC_REFERENCE_V = 3.3f;
}  // namespace ProjectConfig
