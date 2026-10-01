# Agentwin

**Every system. Its own agent.** A local IoT monitoring MVP with an Obsidian Plum React interface, persistent FastAPI backend, project-scoped agent tools, simulation, replay, MQTT ingestion, and a USB gateway.

Two physical projects share one backend and MQTT broker:

| Project | Board | Connection | Local project ID |
| --- | --- | --- | --- |
| `arduino_uno_d13_led` | Classic UNO, built-in D13 LED | USB on `COM4` -> Python gateway -> MQTT | `project-1b000f5096` |
| `R4_jamming_detector` | UNO R4 WiFi, AD8313 on A5 | Wi-Fi -> MQTT; USB-C is for flashing/power | `project-6309ff857a` |

COM ports, project IDs, and LAN IPs can change. Confirm them on your machine. Use each project's **Live** session for physical readings; simulation is separate.

## Hardware and project workflows

Agentwin has two workflows: developers add support for hardware once, then
operators create projects from that reusable **Hardware Template**. Choose
supported hardware, configure the device, deploy its Agentwin firmware package,
and bring it into the same operational workspace.

### Choose a project setup method

**Add Project** offers two setup methods. **Supported hardware** is the simpler
path; **Custom configuration** gives you control over the devices and fields.

| Aspect | Supported hardware | Custom configuration |
| --- | --- | --- |
| Setup | Choose an existing Hardware Template; its components, pins, fields, units and transport are supplied | Define devices, components, pins and telemetry fields yourself |
| Firmware | Download a matching package with this project's project/device IDs, then build and upload locally | Supply firmware that matches the configuration you define |
| Devices | One device per project | One or multiple devices per project |
| Hardware | Currently classic UNO D13 LED and R4 RF Jamming Detector | Hardware you implement and configure using supported component/field types |

Both methods use the same operational workspace and Live telemetry checks.
Choose **Supported hardware** for the two included hardware setups. Choose
**Custom configuration** for a sensor without a Hardware Template or a
multi-device assembly; it does not automatically generate a sensor driver.

### 1. Developer workflow: add support for new hardware

Use this workflow when the board/sensor combination does not yet have a Hardware
Template. For example, adding an UNO temperature sensor requires its actual
sensor model, driver, libraries and wiring; a temperature field alone does not
implement sensor support.

1. Create a firmware project under `firmware/projects/`. Keep the sketch folder
   and main `.ino` filename identical. Implement a hardware driver with
   `begin()` and `appendReadings()`, reusing Agentwin's telemetry and transport
   libraries.
2. Add a JSON manifest under `firmware/templates/`. Define a unique template ID,
   version, name, board/FQBN, public firmware files, required libraries, transport,
   timing defaults and exact component/field contracts. A temperature reading
   might use `temperature_c`, type `number`, unit `°C` and the actual configured
   sensor pin.
3. Add the referenced `.h.tpl` configuration header. Agentwin substitutes
   `$project_id`, `$device_id` and `$interval_ms` when exporting a package.
   Hardware-specific behavior remains in the driver/configuration header.
4. Set the optional `visual_profile` to suggest the Digital Twin's 2D board
   artwork, such as `arduino-uno-r3`. Artwork, pins and transport are configured
   metadata, not hardware detection or independently verified physical wiring.
   Unknown profiles fall back to generic artwork; browser overrides remain
   available.
5. Compile, test the contract/package and validate the real hardware. Restart
   the backend to reload the manifest registry. The Hardware Template then
   appears in **Add Project** and **Device setup** without frontend dropdown edits.

Start from the [existing UNO Hardware Template](firmware/templates/arduino_uno_d13_led.json)
and follow the [Hardware Template development guide](docs/hardware-templates.md).
The user-facing term is **Hardware Template**; recipe/manifest describe its
internal implementation.

### 2. Project workflow: use supported hardware

Use this workflow after a matching Hardware Template exists. The included
templates currently support the classic UNO D13 LED and R4 RF Jamming Detector;
a temperature sensor needs the developer workflow above before it can offer a
matching generated firmware package.

1. Open **Add Project**, name the project and keep **Supported hardware** selected.
   Choose its **Hardware Template**; this dropdown lists supported hardware only.
2. Configure the device identity and USB COM port where applicable. The template
   supplies transport, fields, units, pins, timing defaults and board artwork.
3. Review the configuration and create the project. **Device setup** opens.
4. Download the compatible firmware package. Its project/device IDs are already
   generated for this project.
5. Build and upload locally. Fill local Wi-Fi/broker credentials when needed,
   then select **I uploaded this package** to record your upload confirmation.
6. Start the USB gateway or connect the MQTT device and check fresh **Live**
   telemetry in the workspace.

Device setup displays **Configured → Firmware downloaded → Upload confirmed →
Reporting → Telemetry verified**. Download and upload records stay in this
browser; **Upload confirmed** is operator-confirmed. **Reporting** requires fresh
Live telemetry. **Telemetry verified**
checks the compatible telemetry contract using two fresh, complete samples with
advancing sequence and receipt time in the same boot. Simulation/Replay never
verify setup, and telemetry verification does not establish physical wiring,
calibration or output. Reporting/verification expire when evidence becomes stale.

The full stepper remains visible until all five stages have evidence, then
collapses into a compact **Telemetry verified** badge. **View setup progress**
expands it. Stale telemetry, a backend disconnect or a non-Live session
automatically restores the full stepper. Telemetry never implies that firmware
was downloaded or an upload was confirmed in this browser.

Reuse the same Hardware Template for another project using the supported
hardware. Download a package for each new project/device; you do not need to
rewrite the driver or sketch.

### Custom configuration and the MVP boundary

Hardware Templates currently create **one device per project**. **Custom
configuration** supports unsupported hardware and multiple-device assemblies,
but the operator must supply matching firmware. Select **Custom configuration**
as the setup method, then configure devices, components and fields. For example,
adding a temperature component registers its fields; it does not generate a
sensor driver or matching temperature firmware package. Legacy custom presets
are no longer choices in the **Hardware Template** dropdown.

## Run both projects (Windows PowerShell)

Run commands from the repository root. On a fresh checkout, install and build once:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
```

Create `.env` from `.env.example` only if it does not exist. Also create `broker/private-network.conf` from its `.example`, `broker/acl`, `broker/passwords`, and R4 `secrets.h` from `secrets.example.h`. These files are ignored by Git. Do not overwrite working credentials or copy password **hashes** from `broker/passwords` into `.env` or firmware.

For daily use, open separate PowerShell windows for the broker, backend, and classic UNO gateway:

```powershell
docker compose up -d broker
```

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```powershell
.\.venv\Scripts\python.exe -m gateway.serial_gateway --port COM4 --baud 38400 --project project-1b000f5096 --device uno-d13-01
```

Open **http://127.0.0.1:8000**. Keep the classic UNO on USB and run **one** gateway for it. The R4 publishes directly over Wi-Fi, including on battery; **do not run a serial gateway for the R4**. Close Arduino Serial Monitor while the gateway owns the UNO port.

### MQTT setup (once)

Use `ipconfig` to find the computer's LAN IPv4 address. In `.env`, set `MQTT_HOST` and `MQTT_BIND_IP` to that address, `MQTT_PORT=1883`, `MQTT_USERNAME=agentwin-backend`, and its **plain** `MQTT_PASSWORD`. The backend and USB gateway share this account. In R4 `secrets.h`, set your Wi-Fi credentials and the same MQTT host/port; use `#define MQTT_USER "r4-rf-01"` and `#define MQTT_PASSWORD "plain-r4-password"` with C++ quotes. The R4 must be on a network that can reach the computer; allow inbound TCP 1883 on the Windows **Private** network only.

Create the broker accounts. Both commands prompt for passwords. The first command's `-c` **replaces** an existing password file, so use it only on first setup; omit `-c` when resetting or adding accounts:

```powershell
docker run --rm -it -v "${PWD}\broker:/mosquitto/config" --entrypoint mosquitto_passwd eclipse-mosquitto:2.0.22 -c /mosquitto/config/passwords agentwin-backend
docker run --rm -it -v "${PWD}\broker:/mosquitto/config" --entrypoint mosquitto_passwd eclipse-mosquitto:2.0.22 /mosquitto/config/passwords r4-rf-01
```

Put these permissions in ignored `broker/acl` (replace project IDs if yours differ). The classic UNO gateway shares the backend account, so it needs **write** permission for the UNO topics:

```text
user agentwin-backend
topic read agentwin/+/+/telemetry
topic read agentwin/+/+/status
topic write agentwin/+/+/command
topic read agentwin/project-1b000f5096/uno-d13-01/command
topic write agentwin/project-1b000f5096/uno-d13-01/telemetry
topic write agentwin/project-1b000f5096/uno-d13-01/status

user r4-rf-01
topic write agentwin/project-6309ff857a/r4-rf-01/telemetry
topic write agentwin/project-6309ff857a/r4-rf-01/status
topic read agentwin/project-6309ff857a/r4-rf-01/command
```

Restart the broker after editing `broker/acl` or `broker/passwords`.

### Flash a board when its firmware changes

Connect the board by USB, close Serial Monitor, and stop the classic UNO gateway if it owns that board's COM port. The Arduino IDE includes `arduino-cli` at this path; use `board list` to confirm which COM port belongs to which board. Compile and upload only the board you changed:

```powershell
$cli = "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
& $cli board list
& $cli compile --fqbn arduino:avr:uno --libraries firmware/libraries firmware/projects/arduino_uno_d13_led
& $cli upload --port COM4 --fqbn arduino:avr:uno firmware/projects/arduino_uno_d13_led
& $cli compile --fqbn arduino:renesas_uno:unor4wifi --libraries firmware/libraries firmware/projects/R4_jamming_detector
& $cli upload --port COM3 --fqbn arduino:renesas_uno:unor4wifi firmware/projects/R4_jamming_detector
```

The classic UNO firmware and gateway must both use **38400 baud**. After uploading it, restart the gateway. The R4 needs no gateway; reflash it after changing `secrets.h` or firmware. Its built-in D13 LED is a connection indicator: **fast blink** = no Wi-Fi, **slow blink** = Wi-Fi but no MQTT, **solid** = MQTT connected. If it never lights on battery, check power first. The AD8313 provides a detector voltage and MLP output, not a calibrated frequency spectrum. See the [R4 hardware notes](firmware/projects/R4_jamming_detector/README.md).

### Quick checks

- `http://127.0.0.1:8000/api/health` should show `"mqtt": true`; both projects should show fresh **Live** readings.
- Broker `not authorised`: check the account's **plain** password, not the hash in `broker/passwords`. Restart broker after resetting it; restart backend/gateway after `.env` edits; reflash R4 after `secrets.h` edits.
- UNO gateway warnings: confirm its COM port, close Serial Monitor, and match the 38400-baud firmware. The battery-powered R4 does not use a COM port.
- MQTT connected but UNO not reporting: check the `agentwin-backend` ACL's **write** permission for the UNO telemetry/status topics.

If a server reports that port `8000` is already in use, find the listening process and terminate its PID before restarting Uvicorn:

```powershell
netstat -ano | findstr LISTENING | findstr :8000
Stop-Process -Id <PID>
```

## What works

- Hardware Templates for the classic UNO D13 LED and R4 RF detector, generated per-device firmware packages, Device setup progress and configured Digital Twin artwork. See [Hardware Template setup](docs/hardware-templates.md).
- Overview, project workspace, add-project flow, events and useful setup settings.
- Editable custom configurations with multiple devices, supported components, typed fields, scoped capabilities, and project-scoped agent configuration.
- Deterministic normal/level-change/pause/recovery simulations through the **same Store.ingest validation and storage boundary** as MQTT. UI components never generate readings. The simulator calls ingestion directly so a broker is not required for a laptop demo.
- SQLite project definitions, source sessions, readings, events, actions, and successful agent conversations survive restart. A fresh database contains no hardcoded projects. Simulation producers are intentionally not resumed automatically after restart.
- Live, simulated and replay histories and latest-state calculations are session-isolated. Replay explicitly selects the currently viewed original recording, keeps original provenance/timestamps and replays at most its latest 180 samples. Replay does not trigger fresh operational events.
- WebSocket snapshots update the overview and project workspace every second. Reconnect loads the current state via HTTP and resumes snapshots; charts/browser readings are bounded to 180 samples. Missing samples produce chart gaps.
- Device/project/topic validation, strict versioned schema, finite/range/type checks, deduplication, retired-boot rejection, retained-message rejection, server receipt timestamps and connector-derived source metadata.
- Deterministic per-device silence alerts after the first accepted sample, plus optional numeric above/below limits requiring two recent readings. Alerts close when telemetry resumes or readings return to range; acknowledgement is a separate operator action.
- Project-scoped live summaries at a configurable 1-1,440-minute interval, visible in Win and Events, with optional branded email. Email includes the last stored live telemetry age at the window end and its UTC timestamp; no stored reading is reported as unknown, not guessed.
- Physical 2D, data-flow, and topology Twin views generated from project components, with generic visuals for future project types. This branch does not provide a 3D/WebGL Twin.
- Local Qwen synthesis through LM Studio with deterministic server-side observation routing, free-text redaction, JSON-schema output and server-attached evidence. The existing OpenAI Responses tool loop remains an optional provider. Provider failures explicitly display **AI agent unavailable** while deterministic monitoring continues.
- Arduino USB telemetry plus a reconnecting pySerial/Paho gateway with availability reporting and live-only LED command forwarding. Requested actions remain separate from telemetry-confirmed completion.

## Architecture and contracts

```mermaid
flowchart LR
  USB[Classic UNO D13 USB] --> GW[Host Python gateway]
  GW --> MQ[Local Mosquitto]
  WIFI[UNO R4 RF detector Wi-Fi] --> MQ
  MQ --> ING[Validation / Store.ingest]
  SIM[Deterministic simulator] --> ING
  REP[Selected recording replay] --> ING
  ING --> DB[(SQLite)]
  DB --> WS[WebSocket snapshots]
  WS --> UI[React / Recharts / React Flow]
  UI --> API[FastAPI]
  API --> AG[Deterministic agent controller]
  AG --> DB
  AG --> LLM[Local LM Studio / optional OpenAI]
```

`backend/models.py` owns request/message validation; generated telemetry schema is in `schemas/telemetry-v1.json`. `backend/templates.py` owns reusable fields/components/relationships. `backend/store.py` owns persistence and deterministic event rules. `backend/runtime.py` handles MQTT, simulation and replay. `backend/agent.py` owns tools and provider integration. `gateway/`, `firmware/`, `simulator/`, `frontend/`, `tests/`, and `docs/` contain their corresponding layers.

API explorer: http://127.0.0.1:8000/docs. Project/session IDs in routes select the local operator's context; agent tool arguments cannot change it. This is a **single local operator MVP, not a multi-tenant authorization system**. The LED action API accepts only the declared `set_led` capability in a live session with an online gateway and broker. Agent proposals never execute physical actions.

### AI security and evidence

Device labels, descriptions, notes and stored conversation content are data, not trusted instructions. The local controller chooses and executes bounded operations before inference, removes arbitrary prose fields, exposes no tools to Qwen, and attaches reading/event evidence from returned records rather than model text. Event references are checked within project/session before proposals. No calls occur per sensor sample; user questions and scheduled summaries may invoke the provider. The optional OpenAI provider retains its bounded four-turn/eight-tool-call loop.

For local Qwen, start LM Studio's localhost server, load the model and copy its identifier from `lms ps` or `GET /v1/models`. With the current model, set `LLM_PROVIDER=lmstudio`, `LLM_MODEL=qwen/qwen3-4b-2507`, and `LLM_BASE_URL=http://127.0.0.1:1234/v1` in `.env`. The server must remain running while Agentwin answers questions. See `.env.example` for the complete local configuration.

To use the optional hosted provider instead, set `OPENAI_API_KEY`, `LLM_PROVIDER=openai` and `LLM_MODEL`. The starting hosted model `gpt-5.6-luna` is documented in the [official model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna); [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling) remains implemented using the installed SDK.

Only server-generated references to stored readings/events render as evidence. They do not guarantee that every model statement is correct; unsupported/invalid references are removed. Missing evidence is disclosed. Monitoring/rules work without any API key or internet. Provider-configured status means configuration exists, not that a request succeeded.

### Live alerts and scheduled Win summaries

Every existing and future project has independent monitoring settings under **Settings → Project monitoring**. The defaults are a 30-second per-device silence alert and a 10-minute live summary; threshold rules are **off** until an operator adds a limit to a numeric field. Silence starts only after that device's first accepted sample. A threshold event requires two recent readings beyond its configured above/below limit and closes after two normal readings. Removing or changing a rule closes its open event as a settings change, not as a claimed physical recovery. Simulation events never send email.

The summary interval accepts any whole number from 1 to 1,440 minutes and can be disabled per project. Each summary is stored, shown in Win's panel and the Events views, and optionally emailed. Its email shows the most recent stored telemetry from the live session as an age measured at the window end plus the UTC receipt time. If none is stored, the email says so. If the local model is unavailable, Agentwin uses a factual deterministic summary; alerts and delivery do not depend on the model. After a backend restart, one current-window summary is created when overdue rather than sending a backlog. The backend must remain running; monitoring its own outage requires an external watchdog.

To send email, set `AGENTWIN_SMTP_HOST`, `AGENTWIN_EMAIL_FROM`, and either `AGENTWIN_EMAIL_TO` or a recipient in the project's settings. Set `AGENTWIN_SMTP_PORT`, `AGENTWIN_SMTP_SECURITY` (`starttls`, `ssl`, or `none`), and SMTP credentials as required by your mail service; see `.env.example`. Keep SMTP secrets only in the ignored local `.env`, never in the UI or a commit. Restart the backend after changing `.env`. Every queued summary is retained for bounded retries; failed delivery is shown as failed, not silently treated as sent. An SMTP configuration indicator only confirms settings are present, not that delivery succeeded. The branded HTML email embeds the Agentwin mark and includes a plain-text version; delivery requires a reachable mail service.

### Operational-agent evaluation

`evals/granite` contains the original fixed 30-case suite, now named `agentwin-operational-agent-v1`. Qwen's deterministic-context controller passed all 30 frozen cases; the result is documented in `evals/granite/QWEN3_DETERMINISTIC_RESULT.md`. This synthetic result validates the included boundaries, not production reliability or live hardware. Validate the harness using `.\.venv\Scripts\python.exe -m evals.granite.run --validate-only`, or follow `evals/granite/README.md` to repeat model inference.

## Configuration and assumptions

The two device identities and telemetry fields are configured per project in the web app. Their matching firmware identities are in each project's `project_config.h`.

- Default freshness 8 seconds, sampling 1 second, high detector limit 1.6 V; these are demo defaults, not measured operating limits. Generic seed uses °C and limit 30, explicitly synthetic. A new project defines its own unit/field/limit.
- Overview and project routes use **live** sessions by default. Simulation remains available from the source selector and never replaces a disconnected live source.
- Each telemetry packet explicitly registers its boot session. A newly observed boot can arrive late, retires the prior boot for that device, and old-session or out-of-order packets are rejected. MQTT telemetry is non-retained and browser/API histories are bounded.
- The R4 firmware samples A5 at 10-bit resolution using a 3.3 V conversion assumption to preserve its supplied MLP features. Verify the actual ADC reference, AD8313 breakout wiring, and model calibration before interpreting voltage or classification as RF evidence. No calibrated dBm or frequency spectrum is provided.
- One SQLite writer process; run **one Uvicorn worker**. No cloud deployment, application authentication, OTA changes, or calibration editor is included. Physical control is limited to declared LED capabilities.
- Each project has configurable reading retention; cleanup deletes at most 200 expired readings per evaluation. Events and actions are preserved. Back up `data/agentwin.db` while stopped or use SQLite backup tooling.
- English-first interface with Arabic-capable fallback and direction-aware project titles. Core labels are centralized; complete localization extraction remains future work.

## Verify and rehearse

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
node frontend/tests/twin-state.mjs
node frontend/tests/project-actions-layout.mjs
# With backend running on 8000 and Microsoft Edge installed:
npm.cmd --prefix frontend run smoke
# CLI simulation controls:
.\.venv\Scripts\python.exe -m simulator.run --scenario normal
.\.venv\Scripts\python.exe -m simulator.run --scenario pause
.\.venv\Scripts\python.exe -m simulator.run --scenario recovery
```

Browser tests create a verification project and simulated/replay histories in the running database. Use a separate `DATABASE_PATH` for test runs. See the [Platform Overview](docs/platform-overview.md) for architecture, firmware dependencies, physical acceptance boundaries, and future improvements.

The optional serial/MQTT protocol test uses a local Aedes test fixture because Mosquitto/Docker was unavailable. Run it with `$env:RUN_MQTT_TESTS='1'` before pytest. Deployment remains configured for Mosquitto; passing this fixture does not certify broker ACLs or physical serial hardware.
