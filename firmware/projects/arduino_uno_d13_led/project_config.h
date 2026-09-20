#pragma once
#include <Arduino.h>

namespace ProjectConfig {
constexpr char PROJECT_ID[] = "project-1b000f5096";
constexpr char DEVICE_ID[] = "uno-d13-01";
constexpr char BOOT_PREFIX[] = "uno-avr";
constexpr unsigned long SAMPLE_INTERVAL_MS = 1000;
// A conservative UART rate for the classic 16 MHz AVR/USB serial path.
constexpr unsigned long SERIAL_BAUD = 38400;
constexpr char ACK_FIELD[] = "last_command_id";
constexpr char LED_COMPONENT_ID[] = "led";
constexpr char LED_ACTION[] = "set_led";
constexpr char LED_FIELD[] = "led_on";
constexpr uint8_t LED_PIN = LED_BUILTIN;
}  // namespace ProjectConfig
