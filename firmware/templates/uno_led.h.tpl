#pragma once
#include <Arduino.h>
// Generated for one Agentwin project/device. Hardware behavior stays in the driver.
namespace ProjectConfig {
constexpr char PROJECT_ID[] = "$project_id";
constexpr char DEVICE_ID[] = "$device_id";
constexpr char BOOT_PREFIX[] = "uno-avr";
constexpr unsigned long SAMPLE_INTERVAL_MS = $interval_ms;
constexpr unsigned long SERIAL_BAUD = 38400;
constexpr char ACK_FIELD[] = "$ack_field";
constexpr char LED_COMPONENT_ID[] = "$led_component_id";
constexpr char LED_ACTION[] = "set_led";
constexpr char LED_FIELD[] = "led_on";
constexpr uint8_t LED_PIN = LED_BUILTIN;
}  // namespace ProjectConfig
