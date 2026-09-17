# Verification record

Environment: Windows, Python 3.14.7, Node 24.19.0. Local build on 2026-09-16. Hardware not wired; no provider credentials used.

Final combined backend run: **13 passed** (12 regression tests + 1 serial/MQTT integration test). Frontend lint/typecheck/build and the browser smoke passed.

| Check | Result / scope |
| --- | --- |
| Backend regression suite | 12 tests passed: schema/ranges/nonfinite values, device mapping, deduplication, retained/late messages, reboot retirement, project/session/source isolation, event debounce/recovery/acknowledgement, calibration unavailable, database reopen/idempotent seed, synthetic replay provenance, scoped tools, prompt-injection scope rejection, provider failure/budget, missing credentials, HTTP setup and WebSocket snapshots. |
| Serial/MQTT integration | Passed separately: synthetic TCP serial fixture → real pySerial gateway process → Aedes MQTT test broker → backend/SQLite → project WebSocket snapshot. Temporary isolated database only. Also checked gateway availability and simulated-session isolation. |
| Frontend | TypeScript, ESLint and Vite production build passed. Dependencies pinned in package.json/package-lock.json; npm install audit reported no vulnerabilities. |
| Browser | Headless Microsoft Edge smoke passed. Simulation, level event/evidence, acknowledgement, missing telemetry, recovery, twin component selection, unavailable agent, synthetic replay, project creation and reload persistence. No browser console errors. |
| Visual inspection | Screenshots inspected at 1440px laptop width and 390px narrow width. No horizontal page overflow in overview, workspace or add-project screens. Dark plum styling, Arabic title, null measurements and chart gaps visible. |
| Offline assets | Interface fonts are bundled locally. Monitoring/simulation do not need an external font service, broker or LLM key. |
| Original documents | Build prompt and both IDRAK reference Markdown files preserved. Updated naming/showcase decisions recorded in README. |

Screenshots and `browser-results.json` are in ignored `artifacts/`. Browser smoke creates a temporary project and removes it in cleanup; use an isolated `DATABASE_PATH` in CI so an interrupted browser process cannot touch operator data. Unit and integration tests use temporary databases.

Run all backend tests including the protocol fixture:

```powershell
$env:RUN_MQTT_TESTS='1'
.\.venv\Scripts\python.exe -m pytest -q
```

The optional integration test needs frontend dev dependencies installed (Aedes is a test fixture, not the deployment broker). A Starlette/AnyIO deprecation warning is emitted by the dependency's TestClient; it does not fail the tests.

## Still unverified / intentionally unavailable

- Physical wiring, breakout supply/pinout, actual ADC reference, RF calibration, real detector measurements, board RSSI, board reconnect behavior and USB hardware transport. Hardware is not wired yet by the user's plan.
- Arduino compile: `arduino-cli` was not installed. Firmware source and compile instructions are provided; no binary or successful compile is claimed.
- Mosquitto/Compose runtime: Docker engine unavailable and native Mosquitto not installed. MQTT protocol integration used Aedes; this is not a Mosquitto ACL/deployment test.
- Live OpenAI model call/account access: unavailable without credentials. The actual SDK tool loop was tested with a fake provider; product monitoring never pretends that is live AI.
- Calibration conversion, trained ML, physical simulation/prediction, physical repair/control, production authentication, and internet deployment are not implemented. RF power stays unavailable.
- Vite reports a large main bundle (~823 kB before gzip) because charts and React Flow are bundled together; runtime works, and route-level splitting remains a performance improvement.

No application publication, repository push, external service modification, or git commit was performed.
