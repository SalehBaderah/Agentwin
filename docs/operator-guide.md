# Agentwin operator guide

This guide describes the current multi-project platform. A fresh installation starts with no projects; every project is created by its operator. The earlier LED report is historical and its UNO R4 LED circuit remains an optional physical showcase.

## Run the web app on Windows

Open PowerShell in the repository root. The verified setup uses Python 3.14 and Node 24.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
npm.cmd --prefix frontend ci
Copy-Item .env.example .env
npm.cmd --prefix frontend run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The backend creates or reuses `data/agentwin.db`; it does not erase existing projects when it starts. If `.env` already exists, keep it and do not repeat the copy command.

The browser interface works without connected hardware. It will show devices as awaiting data until telemetry arrives. A local MQTT broker is required for hardware telemetry and LED controls:

```powershell
docker compose up -d broker
```

If Docker is unavailable, run a native Mosquitto broker on `127.0.0.1:1883` using `broker/mosquitto.conf`. The backend reads broker settings from `.env`.

For frontend development, leave the backend running and use:

```powershell
npm.cmd --prefix frontend run dev
```

Open the Vite address printed by the command, normally [http://127.0.0.1:5173](http://127.0.0.1:5173). For a previously built production app, `powershell -File scripts/start.ps1` starts the backend web server.

## Use the web app

The **Overview** lists every saved project. Select a project to open its workspace.

- **Overview** shows current metric cards, registered devices, recent actions, and the project-scoped assistant.
- **Live readings** shows the selected session's stored telemetry. A numeric field is charted; discrete fields are shown as transitions.
- **Digital twin** is a stable component view. Select a component for its bindings, connections, configuration, current state, and declared controls.
- **Events & history** contains telemetry-missing events and command history. An acknowledgement records operator review; it does not prove recovery.
- **Controls** lists only controls declared by the selected project's Twin. A control is available only for a live session whose device transport is ready.

The project assistant is limited to the currently selected project and session. It can explain the evidence and declared capabilities; it does not autonomously send physical commands.

## Add a project

1. From **Overview**, select **Add project**.
2. Enter a project name and choose a template:
   - **LED or digital output**: creates the UNO-style `led_on` state and `set_led` control contract.
   - **Temperature monitoring**: uses the preset `temperature_c` field.
   - **Water level monitoring**: uses the preset `water_level_cm` field.
   - **Connectivity/RF monitoring**: uses `rf_detector_v` and `wifi_rssi_dbm`.
   - **Generic sensor**: uses the telemetry field and unit entered in the form.
3. Enter the first device identity exactly as its firmware or gateway will report it. Choose **USB serial gateway** or **Direct Wi-Fi MQTT**. For USB, enter the board's COM port.
4. Use **Add device** for every additional device. Devices may mix USB and Wi-Fi MQTT, but all remain scoped to this project.
5. Set the freshness interval. For a generic sensor, enter the JSON telemetry field and unit. Built-in templates retain their preset field names.
6. Select **Save project**. The project receives its own persistent ID, Twin graph, devices, sessions, readings, events, actions, and agent context.

The project opens after saving. The platform creates a live session and an isolated simulated session for each project. Physical controls always require the live session.

## Send telemetry

Each message and MQTT topic is scoped to its project and registered device:

```text
agentwin/{project_id}/{device_id}/telemetry
agentwin/{project_id}/{device_id}/status
agentwin/{project_id}/{device_id}/command
```

Telemetry must use this envelope and only include fields declared by that project template:

```json
{
  "schema_version": 1,
  "project_id": "example-project",
  "device_id": "device-01",
  "boot_id": "boot-001",
  "sequence": 0,
  "uptime_ms": 0,
  "readings": {"sensor_value": 24.5}
}
```

For a USB device, start one gateway per serial port after the broker and web app are running:

```powershell
.\.venv\Scripts\python.exe -m gateway.serial_gateway --port COM5 --project YOUR_PROJECT_ID --device uno-r4-01
```

Replace all three values with the device's saved configuration. Close Arduino Serial Monitor before starting the gateway because only one program can own the serial port.

For direct UNO R4 Wi-Fi MQTT, copy `firmware/agentwin/secrets.example.h` to `firmware/agentwin/secrets.h`, enter private-network broker credentials, set `USE_WIFI_MQTT` to `1`, and upload `firmware/agentwin/agentwin.ino`. Its MQTT transport is implemented but still requires physical broker and board verification.

## Create and control the LED showcase

Create an **LED or digital output** project with device `uno-r4-01`, USB connector `COM5`, and D7 output. Note the generated project ID and set the firmware `PROJECT_ID` to that value. Wire and upload it as described in [hardware.md](hardware.md), then start the broker, web app, and USB gateway with the generated project ID.

Open the LED project and select **Controls**, or select **External LED** in the Twin. The control remains disabled until the live USB gateway reports online. **Enable** or **Disable** creates a `requested` action. It becomes `completed` only when the same device reports both the matching `last_command_id` and the requested `led_on` value. A button click or MQTT publish alone is not proof that the LED changed.

## What changed

- A new database starts empty and the application never creates hard-coded projects on startup.
- Projects, device registrations, Twin definitions, sessions, readings, events, actions, and conversations persist independently in SQLite.
- Templates now cover LED output, temperature, water level, connectivity/RF, and generic sensors.
- USB serial and direct Wi-Fi MQTT use the same scoped topic and telemetry contract.
- The Twin is a stable, responsive component layout instead of an editable monitoring canvas.
- LED command completion now requires a matching command acknowledgement and verified reported state, with a timeout for unresolved commands.

See [platform-migration.md](platform-migration.md) for the architecture and verification boundary, and [hardware.md](hardware.md) for the physical LED wiring procedure.
