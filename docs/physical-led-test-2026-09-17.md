# Physical D7 LED test — 2026-09-17

## Configuration

- Board detected by Arduino CLI: Arduino UNO R4 WiFi on `COM3`.
- Agentwin project: `project-b9324cdd42` (`UNO R4 D7 LED`).
- Device: `uno-r4-01`, USB gateway, 115200 baud.
- Component: external LED configured on D7.
- Firmware: USB transport, LED-only telemetry, ArduinoJson 7.2.1.
- Broker: repository Aedes loopback test fixture on `127.0.0.1:1883`. This was a local USB acceptance test, not the authenticated Wi-Fi route.

## Results

Firmware compiled for `arduino:renesas_uno:unor4wifi` and uploaded successfully to COM3. The device registered boot `uno-r4-000000ad`; Agentwin showed the gateway online and the device reporting.

| Test | Action ID | Required telemetry | Result |
|---|---|---|---|
| Turn on | `d1cd508830004522acaffaa501a200c3` | `led_on: true` and matching `last_command_id` | Completed at sequence 165 |
| Turn off | `242d0400533e40689d8e7d74e8ae4978` | `led_on: false` and matching `last_command_id` | Completed at sequence 177 |

The board was left reporting `led_on: false`. This verifies the board's reported D7 output state through the complete Agentwin command/telemetry path. No independent light sensor was used, so the software evidence alone does not prove emitted light.

## Live-test finding

The existing database used an older three-column `gateways` table. Telemetry arrived, but device-scoped gateway status was rejected. A repeatable migration now converts it to project/device scope and preserves an old row against the project's primary device. After restart, gateway status became online and command controls were enabled.

The disconnect/reconnect, timeout, and Wi-Fi/MQTT acceptance cases remain to be physically exercised.
