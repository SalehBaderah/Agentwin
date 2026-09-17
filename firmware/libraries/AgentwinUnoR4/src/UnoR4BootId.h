#pragma once
#include <Arduino.h>
#include <EEPROM.h>

namespace UnoR4BootId {
constexpr uint32_t MAGIC = 0x41574E31;
constexpr int EEPROM_ADDRESS = 0;

struct BootRecord {
  uint32_t magic;
  uint32_t counter;
  uint32_t invertedCounter;
};

inline void create(const char *prefix, char *destination, size_t capacity) {
  BootRecord record;
  EEPROM.get(EEPROM_ADDRESS, record);
  const bool valid = record.magic == MAGIC && record.invertedCounter == ~record.counter;
  record.counter = valid ? record.counter + 1 : 1;
  record.magic = MAGIC;
  record.invertedCounter = ~record.counter;
  EEPROM.put(EEPROM_ADDRESS, record);
  snprintf(destination, capacity, "%s-%08lx", prefix,
           static_cast<unsigned long>(record.counter));
}
}  // namespace UnoR4BootId
