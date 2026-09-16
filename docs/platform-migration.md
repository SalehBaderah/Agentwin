# Agentwin multi-project platform

The UNO R4 LED circuit is a saved `led` project named `UNO R4 LED`; it is not a platform-wide board, GPIO, or serial-port default. Existing LED readings and actions remain scoped to `smart-connectivity` and `uno-r4-01` during migration.

## Project contract

Each project persists its own identity, template, devices, connector settings, Digital Twin graph, telemetry fields, freshness interval, events, action history, and agent conversations. A new project is created in the app with:

```text
Name → template → device identity and connector → field/unit mapping → freshness → save
```

Supported starting templates are LED/digital output, temperature, water level, connectivity/RF, and generic sensor. The onboarding form can register additional USB or MQTT devices with the project; the stored `devices` list and scoped MQTT topics keep them separate from every other project.

## Telemetry and connectors

All telemetry uses the shared JSON envelope:

```json
{
  "schema_version": 1,
  "project_id": "example-project",
  "device_id": "device-01",
  "boot_id": "boot-001",
  "sequence": 0,
  "uptime_ms": 0,
  "readings": {"temperature_c": 22.5}
}
```

Topic paths are scoped as `agentwin/{project_id}/{device_id}/telemetry`, `.../status`, and `.../command`. A USB project runs one `gateway.serial_gateway` process per serial port. A Wi-Fi project publishes and subscribes directly to the same scoped MQTT topics. Both routes use the same command and acknowledgement format.

For USB, run:

```powershell
.\.venv\Scripts\python.exe -m gateway.serial_gateway --port COM5 --project smart-connectivity --device uno-r4-01
```

`COM5` is only the saved LED showcase configuration; choose the actual port for every other device.

For UNO R4 WiFi, copy `firmware/agentwin/secrets.example.h` to ignored `secrets.h`, fill in a private LAN broker, set `USE_WIFI_MQTT` to `1`, and upload. USB is still useful for first upload and troubleshooting. The Wi-Fi firmware follows the shared MQTT schema but has not been physically verified in this repository.

## Verified controls

Components advertise controls in their project graph. A control records its target component, action, expected telemetry field/value, and timeout. Agentwin records `requested`, then changes the action to `completed` only after the same device reports the matching `last_command_id` and expected state. Mismatched, late, expired, or unrelated acknowledgements cannot complete it. Requested actions become `timed_out` after their configured deadline.

The LED template demonstrates this through `set_led`, expecting the `led_on` field. Read-only templates show no controls.

## What was tested

Automated tests cover independent ingest for two projects, persisted onboarding, scoped telemetry validation, project/session API behavior, gateway command validation, and the LED mismatch acknowledgement rule. The USB LED route remains the physical showcase. Direct Wi-Fi telemetry and control need physical network verification before being reported as working hardware.
