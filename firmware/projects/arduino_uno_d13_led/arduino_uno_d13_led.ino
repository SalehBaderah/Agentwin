#include <Arduino.h>
#include <ArduinoJson.h>
#include <AgentwinCore.h>
#include <AvrBootId.h>
#include <HardwareDriver.h>
#include <UsbSerialTransport.h>

#include "project_config.h"
#include "src/LedDriver.h"

UsbSerialTransport transport(Serial, ProjectConfig::SERIAL_BAUD);
LedDriver led(ProjectConfig::LED_COMPONENT_ID, ProjectConfig::LED_ACTION,
              ProjectConfig::LED_FIELD, ProjectConfig::LED_PIN, true);
HardwareDriver *drivers[] = {&led};
AgentwinCore agentwin(ProjectConfig::PROJECT_ID, ProjectConfig::DEVICE_ID,
                      ProjectConfig::ACK_FIELD, ProjectConfig::SAMPLE_INTERVAL_MS,
                      transport, drivers, 1);

void setup() {
  char bootId[48];
  AvrBootId::create(ProjectConfig::BOOT_PREFIX, bootId, sizeof(bootId));
  agentwin.begin(bootId);
}

void loop() { agentwin.loop(millis()); }
