# AgentWin

**Every system. Its own agent.**

AgentWin streams and monitors data from edge devices in real time. It uses
FastAPI, SQLite, React, and TypeScript to bring device readings, alerts, digital
twins, and a project-scoped AI assistant into one local workspace.

## Why we built it

AgentWin's original goal was to stream real-time edge-device data for
[CryptoPulse AI System](https://github.com/SalehBaderah/cryptopulse-ai-system).
We then expanded the system with support for more devices, live dashboards,
monitoring, hardware controls, simulation, and AI-assisted explanations.

The model deployed on the **UNO R4 WiFi RF Jamming Detector** is also open source
in the [CryptoPulse repository](https://github.com/SalehBaderah/cryptopulse-ai-system).
See the [R4 firmware guide](firmware/projects/R4_jamming_detector/README.md) for its
AgentWin integration.

## What it does

- Streams device telemetry through MQTT or a USB serial gateway.
- Shows live readings, charts, digital twins, and event history per project.
- Tracks silence and threshold alerts, with optional email and AI summaries.
- Supports hardware commands confirmed by device telemetry.
- Offers isolated simulated sessions for development without hardware.

An MQTT broker, physical devices, AI services, and email are optional for trying
the application locally.

## Quick start

Install **Git**, **Python 3.12 or 3.13**, and **Node.js 24 LTS** with npm.

```bash
git clone https://github.com/SalehBaderah/Agentwin.git
cd Agentwin
```

Run the following commands from the repository root.

**macOS / Linux:**

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
npm --prefix frontend ci
npm --prefix frontend run build
cp -n .env.example .env
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
```

**Windows PowerShell** (use `py -3.13` if you installed Python 3.13):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Open **http://127.0.0.1:8000**. API docs are at **http://127.0.0.1:8000/docs**.
The copy commands preserve an existing `.env`. Defaults disable AI and store data
in `data/agentwin.db`; no credentials are needed for simulation. Restart the
backend after changing `.env`, and keep one worker for SQLite.

**After pulling updates:** rebuild with `npm --prefix frontend run build` (or
`npm.cmd --prefix frontend run build` on Windows), then restart Uvicorn and
refresh the browser. Uvicorn serves the compiled frontend; it does not rebuild
it. On Windows, `scripts/start.ps1` rebuilds the frontend before starting the app.

### Try it without hardware

1. Select **Add project → Custom configuration**, review the defaults, and create
   a project.
2. Copy its ID from `/projects/<project-id>` in the address bar. In another
   terminal, replace `PROJECT_ID` and run:

   ```bash
   .venv/bin/python -m simulator.run --project PROJECT_ID --scenario normal
   ```

   On Windows, use `.\.venv\Scripts\python.exe` instead of `.venv/bin/python`.
3. Choose the `simulated` entry in the project's **Session** selector. Explore
   **Live readings**, **Digital twin**, and **Events & history**.

Use `--scenario pause`, `recovery`, or `stop` to control simulation. Restart its
producer after restarting the backend. For real devices, follow the
[hardware setup guide](docs/hardware-setup.md).

## Development and documentation

For frontend hot reload, keep the backend running and start
`npm --prefix frontend run dev` in a second terminal. Open **http://127.0.0.1:5173**.

- [Development, tests, and troubleshooting](docs/local-development.md)
- [Environment variables, MQTT, AI, and email](docs/configuration.md)
- [Hardware setup](docs/hardware-setup.md) · [Add a Hardware Template](docs/hardware-templates.md)
- [Architecture](docs/platform-overview.md) · [Agent evaluation](evals/granite/README.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Release checklist](docs/open-source-readiness.md)

## Project status

AgentWin is a local, single-operator MVP without user authentication. Keep the
web app on loopback. RF detector readings and classifier output do not establish
calibrated RF power or proof of jamming; see the [R4 guide](firmware/projects/R4_jamming_detector/README.md).

## Author and license

Created by [SalehBaderah](https://github.com/SalehBaderah). AgentWin's original code
is available under the [MIT License](LICENSE). Dependencies and third-party
materials retain their own licenses.
