# Agentwin UNO R4 LED hardware test

Work in the existing Agentwin repository. Inspect the repository before changing anything and preserve its current architecture.

## Context

Agentwin is a local FastAPI, React, SQLite, MQTT, and Arduino platform.

The first real hardware test controls an external LED connected to an Arduino UNO R4 WiFi. The intended command path is:

```text
Agentwin UI → FastAPI → local MQTT broker → USB serial gateway → UNO R4 D7
→ telemetry acknowledgement → Agentwin marks the action completed
```

Important behavior:

- Use the live hardware session by default.
- Do not substitute simulated readings when live hardware is disconnected.
- Keep simulation available only as an explicitly selected test source.
- Keep a requested command separate from confirmed hardware state.
- Mark an LED action completed only after telemetry contains the matching command ID and reported LED state.
- Use the existing project identity:
  - Project: `smart-connectivity`
  - Device: `uno-r4-01`
  - Component: `led`
  - Digital pin: `D7`
- The firmware file is `firmware/agentwin/agentwin.ino`.
- The USB gateway is `gateway/serial_gateway.py`.
- Hardware instructions are in `docs/hardware.md`.

## Hardware

Required parts:

- Arduino UNO R4 WiFi
- One ordinary LED
- One 470 Ω resistor
- Breadboard and jumper wires
- USB-C cable

Leave the AD8313 and RF components disconnected.

Wire with USB unplugged:

```text
UNO R4 D7
   │
470 Ω resistor
   │
LED long leg / anode
LED short leg / flat side / cathode
   │
UNO R4 GND
```

Do not connect the LED without the resistor. The UNO R4 GPIO limit is 8 mA; the 470 Ω resistor keeps a typical red LED below that limit.

Official references:

- https://docs.arduino.cc/hardware/uno-r4-wifi
- https://docs.arduino.cc/resources/pinouts/ABX00087-full-pinout.pdf

## Tasks

1. Inspect the current Git status and relevant files. Do not discard existing changes.
2. Confirm the current implementation has:
   - A versioned Digital Twin definition containing the `led` component.
   - An `action:set_led` capability.
   - `led_on` boolean telemetry.
   - `last_command_id` categorical telemetry.
   - A live-only action API.
   - MQTT command publication.
   - USB gateway command forwarding.
   - Firmware command parsing and D7 output.
   - Telemetry acknowledgement.
   - Turn LED on/off controls in the Digital Twin.
3. Fix any missing or broken part of that path.
4. Compile the firmware for **Arduino UNO R4 WiFi** using Arduino CLI if available. If it is unavailable, use Arduino IDE or tell me exactly what remains.
5. Identify the Arduino COM port. Do not guess if several boards are connected.
6. Upload `firmware/agentwin/agentwin.ino`.
7. Close Serial Monitor after uploading.
8. Start the local MQTT broker.
9. Start Agentwin.
10. Start the USB gateway using the detected COM port.
11. Ask me to press RESET only when all services are ready.
12. Verify real telemetry appears in the live session.
13. Guide me through:
    - Selecting Test LED.
    - Turning it on.
    - Confirming the physical LED illuminates.
    - Confirming Agentwin changes the action from `requested` to `completed`.
    - Turning it off and confirming both physical and reported state.
14. Capture exact failures if any layer does not work. Diagnose one boundary at a time:
    - Browser to API.
    - API to MQTT.
    - MQTT to gateway.
    - Gateway to serial.
    - Firmware to D7.
    - Firmware telemetry back to Agentwin.
15. Run the relevant backend tests, frontend lint, type checking, and build after any code changes.
16. Do not claim the physical test passed until I confirm the LED changed on the real board.

## Startup commands

From the repository root:

```powershell
docker compose up -d broker
```

If Docker is unavailable, use an installed native Mosquitto broker configured from `broker/mosquitto.conf`.

Start Agentwin:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Start the USB gateway after identifying the real COM port:

```powershell
.\.venv\Scripts\python.exe -m gateway.serial_gateway `
  --port COM_PORT `
  --project smart-connectivity `
  --device uno-r4-01
```

Open:

```text
http://127.0.0.1:8000/projects/smart-connectivity?tab=twin
```

Expected prerequisites before control is enabled:

- Current source is `live`.
- Backend is connected.
- MQTT broker is connected.
- USB gateway reports `online`.
- Test LED initially reports `Off`.
- Arduino Serial Monitor is closed.

If an action remains `requested`, do not treat it as success. Check the gateway terminal, serial-port ownership, board reset timing, telemetry rejection counters, project/device identity, and returned `last_command_id`.
