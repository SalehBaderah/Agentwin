# Agentwin LED acceptance runbook

This tests one logical UNO R4 device first through USB and then Wi-Fi. Automated checks have not physically verified the board, LED, serial port, broker, or network.

## Project and wiring

Create one project in **Add project**. Choose the LED template, keep the component on `D7`, enter a stable device ID, and select the route under test. After creation, call `GET /api/projects/{project-id}/devices/{device-id}/setup` in `http://127.0.0.1:8000/docs`. Its IDs, topics, fields, port, and baud are the configuration source of truth.

With USB disconnected, wire:

```text
UNO R4 D7 -> 470 ohm resistor -> LED anode (long leg)
LED cathode (short leg / flat side) -> UNO R4 GND
```

In `firmware/agentwin/agentwin.ino`, copy `PROJECT_ID` and `DEVICE_ID`. For the standard template keep `LED_COMPONENT_ID="led"`, `LED_FIELD="led_on"`, `ACK_FIELD="last_command_id"`, and D7. Set `ENABLE_ANALOG_A5=0` unless the project also registers `analog_raw`. Install ArduinoJson and ArduinoMqttClient before compiling.

## Test A: USB gateway

1. Set `USE_WIFI_MQTT 0`, compile, and upload. Close Arduino Serial Monitor.
2. Start the broker and app:

   ```powershell
   docker compose up -d broker
   .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

3. Start the gateway with the setup values:

   ```powershell
   .\.venv\Scripts\python.exe -m gateway.serial_gateway --port COM5 --baud 115200 --project PROJECT_ID --device DEVICE_ID
   ```

4. In the live workspace, confirm gateway online, device reporting, and fresh `led_on` independently.
5. Turn the LED on and off. Each action must show **requested** first and **completed** only after telemetry contains its command ID and intended state. This verifies reported output state, not emitted light.
6. Unplug USB. The gateway retries every three seconds; the field becomes stale and a missing-telemetry event opens. Reconnect with the same logical device ID. Explicit session registration permits a new boot even when first observed late.
7. Request a command and disconnect before its matching report to verify `timed_out`.

Capture the setup identity, requested/completed on and off, stale and recovery states, one timeout, and gateway rejection logs.

## Test B: direct Wi-Fi MQTT

1. Stop the USB gateway. Keep the same project/device identity and configure its connector as MQTT. Never run two command routes for one logical device.
2. Copy `secrets.example.h` to ignored `secrets.h`; set private Wi-Fi, laptop LAN broker address, port, and device credentials.
3. Create ignored `broker/passwords` and `broker/acl`. Use `broker/private-network.conf.example`. The backend account reads `agentwin/+/+/telemetry` and `agentwin/+/+/status`. The device account writes only its telemetry/status topics and reads only its command topic.
4. Set `USE_WIFI_MQTT 1`, compile, and upload over USB. The board needs power afterward, but the serial gateway is not used.
5. Start the authenticated broker. Set backend `MQTT_USERNAME` and `MQTT_PASSWORD`, then start Agentwin.
6. Repeat on/off verification. Interrupt Wi-Fi or the broker, confirm stale data and no false action completion, restore it, and confirm recovery.

```text
agentwin/{project_id}/{device_id}/telemetry
agentwin/{project_id}/{device_id}/command
agentwin/{project_id}/{device_id}/status
```

Capture the same evidence as USB plus proof that the gateway is stopped and MQTT uses the device-specific ACL.

## Troubleshooting and boundaries

- Port busy: close Serial Monitor and old gateway processes. One process owns a serial port.
- Gateway online but stale: compare identity and field keys with the setup response. Status does not refresh fields.
- MQTT denied: check password entries, ACL usernames, and backend/device credentials separately.
- Wi-Fi cannot reach broker: use the laptop LAN address, not `127.0.0.1`, and allow only the private subnet in the firewall.
- Action remains requested: verify component, topic, command ID, acknowledgement field, and reported state.
- Unexpected field/type: register the exact key and type before changing firmware.

Transport, pins, credentials, and field keys require firmware compilation. Labels, freshness, and retention are platform-only. There is no runtime pin reconfiguration, OTA, TLS, cloud deployment, calibration, or independent LED feedback. A5 is raw ADC data only; voltage or engineering-unit conversion requires reviewed calibration.
