# Local development

Complete the [README quick start](../README.md#quick-start) first. Use the existing
checkout and run backend commands from the repository root. Examples below use
macOS/Linux paths. On Windows, replace `.venv/bin/python` with
`.\.venv\Scripts\python.exe` and `npm` with `npm.cmd`.

## Daily workflow

Start FastAPI with one worker:

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
```

In another terminal, start Vite:

```bash
npm --prefix frontend run dev
```

Use `http://127.0.0.1:5173`. The backend accepts the localhost origins on ports
5173 and 8000. Keep those ports for interactive development. Set
`AGENTWIN_BACKEND_URL` in Vite's process environment if the backend uses another
port; the proxy defaults to `http://127.0.0.1:8000`.

FastAPI serves `frontend/dist` when that directory exists at startup. After
`npm --prefix frontend run build`, restart FastAPI if it was started before the
first build. Frontend hot reload happens through Vite, not through the built UI.

## Control a simulated session from the CLI

Create a project in the UI, then copy its ID from `/projects/<project-id>` in the
address bar. Use that actual ID, replacing `PROJECT_ID` below:

```bash
.venv/bin/python -m simulator.run --project PROJECT_ID --scenario normal
.venv/bin/python -m simulator.run --project PROJECT_ID --scenario pause
.venv/bin/python -m simulator.run --project PROJECT_ID --scenario recovery
.venv/bin/python -m simulator.run --project PROJECT_ID --scenario stop
```

The CLI selects the project's newest simulated session and prints its ID.
If none exists, it creates one. Choose the entry beginning `simulated` in the
workspace's **Session** selector to view its data.
Use `--api http://127.0.0.1:8000/api` to override the API address. This path needs
neither MQTT nor hardware. Synthetic values are demo signals, not a hardware model.

## Tests

```bash
.venv/bin/python -m pytest -q
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m evals.granite.run --validate-only
```

`npm test` runs frontend state/model checks without a browser. The build includes
TypeScript checking. The evaluation command validates the frozen cases and harness;
it does not run model inference.

The MQTT/socket integration test uses a local Aedes test fixture, not a physical
board or a production Mosquitto broker. Install frontend dependencies first, then:

```bash
# macOS / Linux
RUN_MQTT_TESTS=1 .venv/bin/python -m pytest -q
```

```powershell
# Windows PowerShell
$env:RUN_MQTT_TESTS = '1'
.\.venv\Scripts\python.exe -m pytest -q
Remove-Item Env:RUN_MQTT_TESTS
```

`RUN_LOCAL_MODEL_TESTS=1` and `RUN_CONTROL_MODEL_TESTS=1` enable tests that require
a running LM Studio server and loaded model. These are intentionally skipped in
the default suite. Follow [evaluation instructions](../evals/granite/README.md)
for a model-inference run and keep skipped tests distinct from passing tests.

## Browser checks

The smoke test creates a temporary project and deletes it afterward. Use a
**disposable database** so failures or interrupted cleanup cannot affect your work.
Stop an existing backend on port 8000 before starting this test instance.

```bash
# macOS / Linux, from the repository root
mkdir -p artifacts
DATABASE_PATH=artifacts/browser-test.db .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
```

```powershell
# Windows PowerShell, from the repository root
New-Item -ItemType Directory -Force artifacts | Out-Null
$env:DATABASE_PATH = 'artifacts/browser-test.db'
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
# After stopping this server: Remove-Item Env:DATABASE_PATH
```

In a second terminal:

```bash
cd frontend
npx playwright install chromium
npm run smoke
npm run test:windows
```

On Linux, Playwright may also require OS libraries; use its documented
`npx playwright install --with-deps chromium` with appropriate local permissions.
All browser scripts use the shared `tests/browser.mjs` launcher. It defaults to
Playwright's installed Chromium. You can set `AGENTWIN_BROWSER_PATH` to an existing
Chromium executable, or `AGENTWIN_BROWSER_CHANNEL=msedge` to use an installed Edge.
The explicit path takes precedence. `AGENTWIN_TEST_URL` overrides the smoke URL.

Screenshots and smoke results are written to ignored `artifacts/`. Other visual
review scripts have their own fixtures and port requirements; read their headers
before running them. The core smoke does not require a model or connected device.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `python3 -m venv` fails | Install Python's venv support for your OS (for example `python3-venv` on Ubuntu). |
| npm engine/version errors | Use Node.js 24; run `npm ci` inside `frontend` or with `--prefix frontend`. |
| `/` returns 404 | Build the frontend from the root and restart FastAPI from that root. |
| API returns 403 / invalid host | Use the documented localhost addresses and ports; the app restricts Host and Origin. |
| Port 8000 is busy | Stop the instance you started before launching another. Do not terminate unrelated processes. |
| MQTT is false | Expected for simulation; for hardware, check broker availability and matching credentials. |
| AI unavailable | Expected with `LLM_PROVIDER=none`; otherwise check model service, model ID, and credentials. |
| Live has no readings | Start the CLI simulator and select its `simulated` session, or connect a real device. Source histories are separate. |
| Browser executable missing | Run `npx playwright install chromium` inside `frontend`, or set `AGENTWIN_BROWSER_PATH`. |

SQLite data lives in `data/agentwin.db` by default. Stop the backend before copying
it for backup, or use SQLite's backup API. Do not commit databases, browser storage,
logs, or screenshots containing private device/project information.
