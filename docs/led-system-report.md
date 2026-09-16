# Agentwin LED system report

## Purpose and scope

Agentwin is currently a single, live-hardware project for one external LED on an Arduino UNO R4 WiFi. It does not generate simulated readings, offer replay sessions, or create projects from the UI/API.

The only project identity is:

- Project ID: `smart-connectivity`
- Project name: `UNO R4 LED`
- Device ID: `uno-r4-01`
- Controller output: `D7`

The workspace exposes only these project tabs:

- **Digital Twin** — the physical circuit, current state, command controls, and action acknowledgements.
- **Events & history** — missing-telemetry events, recovery evidence, and stored LED telemetry.

The Project Agent/analysis panel, RF/ADC measurements, Wi-Fi metrics, simulation, replay, project creation, and generic sensor templates have been removed from the active product path.

## Physical wiring

With USB disconnected, make this series circuit:

```text
UNO R4 D7 → 470 Ω resistor → LED long leg (anode)
LED short leg (cathode) → UNO R4 GND
```

The resistor is required. Do not connect an LED directly between D7 and GND.

## How the system works

```text
Digital Twin button
  → FastAPI action API
  → MQTT command topic
  → USB serial gateway on COM5
  → UNO R4 firmware on D7
  → serial telemetry
  → MQTT telemetry topic
  → FastAPI/SQLite
  → action marked completed
```

### Command flow

1. In the Digital Twin, choose **External LED** and press **Turn LED on** or **Turn LED off**.
2. FastAPI validates that the session is live, the MQTT broker is connected, and the USB gateway is online.
3. It creates an action in `requested` state and publishes a `set_led` command with a unique command ID to:

   ```text
   agentwin/smart-connectivity/uno-r4-01/command
   ```

4. The USB gateway validates the command and writes it to the UNO over COM5.
5. Firmware changes D7 and includes both the resulting `led_on` value and the command ID in subsequent telemetry.
6. FastAPI marks the action `completed` only when both values match the requested action. A matching command ID with the wrong LED state remains `requested`.

### Telemetry flow

The firmware emits newline-delimited JSON at 115200 baud. Only these hardware readings are accepted:

```json
{
  "led_on": false,
  "last_command_id": null
}
```

The gateway validates the full packet, then publishes it to:

```text
agentwin/smart-connectivity/uno-r4-01/telemetry
```

The backend rejects retained, malformed, out-of-order, stale, wrong-project, wrong-device, or unexpected-field telemetry. If no valid telemetry arrives within the configured freshness interval, it records a `missing_telemetry` event.

## Running the system

Start Mosquitto, the backend, then the gateway. The gateway must own COM5; Arduino IDE Serial Monitor must be closed.

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
.\.venv\Scripts\python.exe -m gateway.serial_gateway --port COM5 --project smart-connectivity --device uno-r4-01
```

Open:

```text
http://127.0.0.1:8000/projects/smart-connectivity?tab=twin
```

Expected state before control:

- Backend/MQTT connected
- Gateway online
- Session is live
- Telemetry is reporting
- External LED initially reports Off

Runtime files such as `backend-live.log`, `gateway-live.log`, and broker logs are intentionally ignored by Git.

## Adding a new project in the future

Project creation is deliberately disabled in the current LED-only build. Adding a new physical project is an engineering change, not a form submission. It requires all of the following:

1. Define a unique project ID and device ID.
2. Decide the physical wiring, safe operating limits, transport, and command/acknowledgement contract.
3. Add a versioned Digital Twin definition in `backend/templates.py`, including components, wiring/transport relationships, telemetry fields, and supported capabilities.
4. Extend strict telemetry validation in `backend/models.py` and `backend/store.py`; accept only real fields reported by the device.
5. Add the required command validation and completion criteria. A command must remain separate from confirmed physical state.
6. Implement firmware for the target device and gateway support for its serial/network transport.
7. Register only the intended project/device identity in the startup seed and MQTT topic policy.
8. Add tests for invalid telemetry, command publication, gateway forwarding, matching acknowledgement, and live-only operation.
9. Update the UI only after the backend contract exists. Keep physical controls disabled until the required live transport is online.
10. Compile, upload, and perform a real hardware confirmation. Do not report success based solely on a requested action or a simulation.

For a second project, consider restoring a constrained project registry only after these contracts are explicit. Do not restore generic templates or simulated defaults as a shortcut.
