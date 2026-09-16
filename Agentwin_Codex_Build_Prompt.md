# Agentwin — Codex MVP Build Prompt

You are building the first working MVP of **Agentwin**, a platform that gives connected IoT systems a shared dashboard, a live digital representation, and a dedicated AI agent for each project.

Act as an experienced full-stack engineer with strong product design judgment. Implement the application, connect its layers, and verify the working flows. Continue through implementation rather than stopping after a plan or a visual mockup.

## 1. Read the references and apply the latest decisions

Read both attached documents before implementation:

- `IDRAK_Team_Overview_EN.md`: the primary reference for MVP scope and simplicity.
- `IDRAK_Project_Brief.md`: supporting detail for architecture, data, agents, and future capabilities.

For product decisions, the latest requirements in this prompt override older choices in those documents. The short brief takes precedence over the comprehensive reference for MVP scope. Respect the repository's applicable instructions and inspect its current structure before changing it.

Current decisions:

- **Public product name: Agentwin.** IDRAK is the earlier working name in the reference files.
- **Track: AI and Data.** The product is a reusable platform for multiple IoT systems.
- **First showcase: اتصال الأنظمة الذكية — Smart Systems Connectivity.** This replaces temperature as the first showcase.
- **Available showcase hardware:** Arduino UNO R4 WiFi, an AD8313 detector module, antennas, SMA cables, and a 10 dB attenuator. ESP support should remain possible through the shared message format.
- **Brand:** Obsidian Plum, built around `#2d1e2f` and `#4e2a4f`.
- Build a reliable local MVP first. Prepare clean scripts and boundaries for later CI/CD improvements.

Use reasonable defaults for reversible implementation choices and record assumptions in the README. Missing physical hardware, calibration data, or an API key should not prevent development of the runnable platform.

## 2. Product and scope

Agentwin helps teams connect IoT systems, understand their current condition, investigate events, and manage supported actions from one application.

Suggested tagline: **Every system. Its own agent.**

Each project has its own:

- Description, device identities, components, and relationships.
- Supported readings, units, freshness rules, and history.
- Digital representation that updates from received data.
- Agent configuration, tools, conversations, and evidence.
- Events and permitted actions.

Build reusable project templates and shared services. The connectivity showcase must be a template using these services, not special logic scattered throughout the application. Include one minimal generic sensor template to demonstrate reuse; its sample data must be explicitly simulated until real hardware is connected.

For this first showcase, prioritize monitoring and analysis. The listed passive RF components do not provide a remotely controllable repair mechanism. Software actions such as acknowledging an event can work immediately. Add physical control only when a real, supported device capability exists.

## 3. First showcase: hardware and measurement meaning

Create the first project with:

- Arabic title: **اتصال الأنظمة الذكية**
- English title: **Smart Systems Connectivity**
- Description: **Monitor a connected device's availability alongside RF detector readings, and investigate changes using a project-specific AI agent.**

Represent two distinct paths:

1. **RF measurement:** Antenna → SMA connection → optional 10 dB attenuator → AD8313 RF input → analog output → Arduino ADC.
2. **Telemetry transport:** Arduino → USB gateway or Wi-Fi/MQTT → Agentwin backend → web application.

The exact cable arrangement and whether the attenuator is inserted are configurable inventory details. They must match the actual setup.

Measurement requirements:

- The AD8313 is a logarithmic RF detector. It produces an analog output related to the signal at its input; it is not a frequency-resolving spectrum analyzer.
- Display raw ADC counts and detector output voltage first. Show an estimated RF power in dBm only when a valid calibration profile exists for the setup. Do not assume universal calibration coefficients.
- The chip's documented operating range does not justify claiming 5 GHz coverage merely because an attached antenna is dual-band.
- Keep **Arduino Wi-Fi RSSI**, when available from its network interface, separate from **AD8313 detector readings**. They describe different measurements.
- Treat the attenuator as a passive, manually inserted measurement-path component. It does not remotely improve the Arduino's connection. A 10 dB label does not guarantee a visible or exactly measured change under uncontrolled ambient conditions.
- A missing heartbeat means data is missing. An RF change means the detector reading changed. Neither observation alone proves jamming, interference, or a particular root cause.

Use the official [AD8313 product documentation](https://www.analog.com/en/products/ad8313.html), [AD8313 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/AD8313.pdf), and [UNO R4 WiFi documentation](https://docs.arduino.cc/hardware/uno-r4-wifi/) to verify hardware assumptions. Confirm the actual breakout module's supply and output requirements before documenting final wiring; do not infer its pinout from the chip alone.

The showcase should work through normal measurements, pausing telemetry, reconnecting a device, and clearly labeled simulated scenarios. It must not depend on disrupting the venue's wireless network.

## 4. Visual identity and application design

Create a distinctive, polished engineering application with a calm **Obsidian Plum** identity. The design should feel deliberate and readable during a hackathon presentation.

Use this initial token set, adjusting supporting colors if contrast checks require it:

| Token | Value |
| --- | --- |
| Page background | `#100D13` |
| Sidebar background | `#161019` |
| Main surface | `#1C1521` |
| Elevated surface | `#261B2B` |
| Brand start | `#2d1e2f` |
| Brand end | `#4e2a4f` |
| Brand gradient | `linear-gradient(135deg, #2d1e2f 0%, #4e2a4f 100%)` |
| Primary text | `#F4EDF5` |
| Secondary text | `#C4B8C7` |
| Muted text | `#A496AA` |
| Interactive accent | `#D0A7DC` |
| Border | `rgba(225, 201, 232, 0.12)` |
| Success | `#9CBFAF` |
| Warning | `#D9B77A` |
| Error | `#E49BA8` |

Use the gradient on selected surfaces, the active navigation treatment, and restrained brand accents. Keep charts and dense content on stable dark surfaces. Avoid placing the dark brand colors on each other as important text.

Design guidance:

- A compact Agentwin wordmark and a simple original SVG mark suggesting two connected counterparts.
- Clear typography; a readable sans-serif for interface text, tabular numerals for measurements, and an Arabic-capable font fallback for project names.
- English interface initially, with strings organized for future localization. Handle Arabic titles with correct direction and alignment.
- Comfortable spacing, fine borders, moderate corner radii, and consistent custom chart styling.
- Subtle transitions and optional data-flow animation; respect reduced-motion preferences.
- Accessible focus states, meaningful labels, readable contrast, and status text alongside color.
- Responsive layouts for a laptop presentation and a usable narrow-screen view.

The main route should open the application overview. Focus effort on the working product screens, rather than a large marketing website.

## 5. Required screens and interactions

### A. Overview

Show project cards or rows, active events, last update times, and an obvious **Add project** action. Derive counts and statuses from backend data. Provide useful loading, empty, disconnected, and error states.

Each project entry shows its name, template, device count, status, data source mode, and last update. Only show metrics the backend can support. Do not invent uptime percentages or performance scores.

### B. Project workspace

For the connectivity showcase, include:

- A header with project identity, source mode, freshness, and connection status.
- Separate summaries for detector voltage, Arduino Wi-Fi status/RSSI when available, last telemetry, and open events.
- A central workspace with **Live readings**, **Digital twin**, and **Events & history** views.
- A dedicated agent panel on desktop that remains easy to reach on smaller screens.

Use time-series charts for detector output and relevant connection measurements. Label units, source, and time window. Treat unknown values as unknown and show gaps for missing data.

Suggested agent questions: “What changed recently?”, “Is this device still reporting?”, and “What evidence supports this event?”

### C. Digital twin view

Use React Flow to represent the RF measurement chain and telemetry path with visually distinct relationship types. Clicking a component opens its metadata and any associated readings.

The backend owns the component graph and state; the diagram renders that model. Passive antennas, cables, and the attenuator should show inventory information. Do not give them independently measured health states when there is no sensor for that claim.

Call this a live operational representation. A diagram alone does not implement physical simulation or prediction. Keep MATLAB/Simulink optional for a future validated behavior model; the MVP must run without it.

### D. Add project

Implement a short working setup flow: name → template → device identity and connector → field/unit mapping → freshness settings → save.

Saving creates the project, component definition, and scoped agent configuration. It must survive a restart. Provide the telemetry topic or gateway configuration needed to connect the device.

### E. Events and settings

Events show the actual trigger, time, severity, supporting readings, acknowledgement, and recovery status. Selecting an event opens its evidence and agent explanation, if available.

Keep settings limited to useful MVP controls: connector status, sampling/freshness configuration, agent availability, and optional calibration metadata. Present implementation details in a setup or developer area rather than throughout normal operation.

## 6. Implementation stack

Use the following unless the existing repository provides a compatible established stack:

- **Frontend:** React, TypeScript, Vite, React Router, React Flow, Recharts, and CSS variables or Tailwind.
- **Backend:** Python, FastAPI, Pydantic, SQLite with a small persistence layer, and WebSockets for live browser updates.
- **Messaging:** Mosquitto and the Python Paho MQTT client.
- **USB gateway:** Python and pySerial.
- **Firmware:** Arduino C++ for UNO R4 WiFi, using board-compatible libraries.
- **Agent:** One server-side LLM provider integration with structured tool calling.
- **Optional analytics:** scikit-learn after the basic flow works.

Use compatible stable dependency versions and lock them. Prefer a modular backend to a collection of unnecessary services. Organize frontend, backend, gateway, firmware, simulator, schemas, and documentation clearly.

SQLite is sufficient for the local MVP. Prepare repeatable database initialization and idempotent demo seeding. Keep project definitions, readings, events, agent conversations, and action history persistent.

## 7. Ingestion, device firmware, and state

Implement the complete initial path:

**Arduino USB Serial → Python gateway → local MQTT broker → backend validation/storage → WebSocket update → browser.**

Also support direct Wi-Fi/MQTT through the same ingestion format. Keep the transport selectable so the board does not accidentally duplicate every sample through both routes. Wi-Fi telemetry should not be required to demonstrate RF measurement data.

Provide:

- An Arduino sketch that reads a configurable analog input and emits newline-delimited JSON.
- Explicit ADC resolution and voltage-reference settings; preserve raw counts and document voltage calculation assumptions.
- Device identity, boot/session identity, sequence number, and uptime in telemetry.
- Optional network status and Wi-Fi RSSI from the board's own interface; unavailable readings remain null.
- A configurable publishing interval, bounded reconnect behavior, and a documented serial baud rate.
- A gateway with configurable serial port, validation, reconnect handling, and its own availability status.
- Local setup instructions that account for Windows COM ports and Linux/macOS serial names.

Use a versioned message schema. An illustrative message is:

```json
{
  "schema_version": 1,
  "project_id": "smart-connectivity",
  "device_id": "uno-r4-01",
  "boot_id": "example-boot-01",
  "sequence": 42,
  "uptime_ms": 42000,
  "readings": {
    "rf_adc_raw": 980,
    "rf_detector_v": 1.1966,
    "wifi_connected": true,
    "wifi_rssi_dbm": -58
  }
}
```

These are sample values, not hardware measurements. Units, ADC configuration, expected interval, and calibration belong in the device/template configuration. A possible telemetry topic is `agentwin/{project_id}/{device_id}/telemetry`.

Validate the registered device/project mapping. Add server receipt time and trusted source metadata at ingestion. Deduplicate messages using device, boot, and sequence identifiers; old or retained messages must not make a device appear newly active. Handle reboots without confusing them with out-of-order data.

Track telemetry freshness independently from RF observations. Distinguish a device that stopped reporting from a disconnected gateway where possible. Do not infer network round-trip time from unsynchronized clocks; add such metrics only if there is a real measurement mechanism.

Keep WebSocket reconnection reliable by loading a current state snapshot after reconnect. Bound chart windows and browser memory rather than accumulating every reading indefinitely.

## 8. Live, simulated, and replay operation

The platform must be demonstrable before hardware is attached, while remaining honest about its data.

- **Live:** Actual hardware readings through the registered connector.
- **Simulated:** A deterministic producer sends synthetic messages through the same validation and storage path.
- **Replay:** An explicitly selected recording is replayed with its original provenance retained. If a supplied fixture was generated synthetically, label its replay as synthetic too.

Persist source mode and session identity with the data. Keep their histories and latest-state calculations separate, and ensure the agent knows which source it is analyzing. A simulated stream must never overwrite a live device's current state.

Provide repeatable simulated scenarios: normal readings, a detector-level change, missing heartbeats, and recovery. Put these controls in a visible demo area and restrict them to simulated sessions. Do not generate random measurements inside UI components.

If live hardware disconnects, show the loss of updates. Never silently switch to simulated values. An unavailable sensor, uncalibrated metric, or offline agent should have an honest state instead of fabricated output.

## 9. Agent behavior and analysis

Create a separate agent configuration and conversation context for every project. Share the model integration across projects; no per-device LLM training is required.

Implement genuine backend tools such as:

- `get_project_state`
- `get_recent_readings`
- `get_component_details`
- `get_event_evidence`
- `get_allowed_actions`
- `propose_action`

Bind project scope on the server. Model-supplied identifiers must not grant access to another project. Treat device labels, uploaded descriptions, and other external text as data, not executable instructions.

Answers should cite the relevant readings, timestamps, or events in the interface and separate observation from possible explanation. The agent must be able to say that evidence is insufficient. It must not claim a particular interference cause, an exact calibrated power, a completed repair, or a forecast without supporting tools and data.

A useful response structure is: finding, evidence, uncertainty, and next step. Render it as readable product content rather than raw JSON.

Use deterministic checks for missing telemetry and configured limits, with debounce/cooldown and explicit recovery to avoid event flooding. Call the LLM for a user question or a meaningful new event, not every sensor sample. Apply timeouts and a bounded tool-call budget.

Use server-side environment variables for the provider, model ID, and API key. The short brief's hosted-model recommendation is a starting option; verify current SDK compatibility and model availability. Keep the integration replaceable without implementing many providers now.

Without a key or network access, monitoring must still work. Display **AI agent unavailable** and optionally show a clearly labeled rule-based event summary. Do not simulate an LLM conversation and present it as real.

Physical control is disabled for this showcase until implemented capabilities exist. Event acknowledgement or another software action must persist and respect confirmation rules. An acknowledgement is not proof that an underlying issue has been resolved.

Add an Isolation Forest adapter only as a stretch feature after collecting appropriate data. Until a model has been trained and evaluated, show it as unavailable. Do not invent a trained model, detection accuracy, or universal failure-prediction capability.

## 10. Local operation and future CI/CD

Provide a straightforward local development workflow, an `.env.example`, lockfiles, and scripts for frontend lint/type checking/build, backend tests, and starting the simulator.

Use Docker Compose for the broker and other services where it simplifies setup. Keep the USB gateway runnable on the host, since serial access varies by operating system. Document one tested primary startup path and a practical hardware connection path.

Bind services locally by default. Document an explicit private-network configuration for direct board MQTT access, with suitable credentials and registered topics. Keep secrets out of the browser and repository. A hosted LLM still requires internet even when hardware uses USB.

Prepare a brief next-steps document for CI/CD: automated checks, build artifacts, and later deployment. Prioritize the working MVP over cloud infrastructure or production-scale deployment. Do not publish the application, push repository changes, or alter external services as part of this build unless separately authorized.

## 11. Build sequence and verification

Begin with a short plan, then implement these slices in order:

1. Project/template schema, persistence, application shell, and source modes.
2. Working simulator through ingestion, stored readings, and live UI updates.
3. Connectivity workspace, meaningful charts, twin graph, and event detection.
4. Project-scoped agent tools and evidence-backed responses.
5. Arduino firmware, serial gateway, and documented live/MQTT integration.
6. Generic sensor project creation, visual polish, and rehearsal.

Add focused tests for the important behavior:

- Schema validation, deduplication, reboot handling, and stale data.
- Isolation between projects and between live/simulated/replay sessions.
- Event creation and recovery without duplicates.
- Agent tool scope, missing credentials, and unsupported actions.
- Calibration-dependent values remaining unavailable without calibration.

Run the relevant checks and one browser smoke flow: start a simulated project, see an update, trigger missing data, observe recovery, and create another project. Inspect the main screens at laptop and narrow widths when browser tools are available. Fix console errors, layout clipping, and unreadable chart labels.

Compile the firmware if the toolchain is available. Clearly distinguish compiled, simulated, and physically tested behavior. Report unavailable hardware testing honestly; do not mark it as passed.

## 12. Definition of done and handoff

The MVP is complete when:

- Agentwin opens with the specified plum identity and working navigation.
- The connectivity showcase operates through real shared backend services.
- A clearly labeled simulation works without hardware or an LLM key.
- Incoming messages update stored state, charts, and the component view.
- Data freshness, source mode, detector readings, and connection status are represented accurately.
- The configured agent can use scoped tools and display supporting evidence.
- A second project can be created without rewriting the dashboard.
- Project configuration and relevant history persist after restart.
- The gateway and firmware are supplied with clear setup instructions.
- The demonstrated flows pass the checks that are possible in the environment.

Deliver the working source code plus:

- `README.md`: setup, startup, architecture summary, and known limitations.
- `.env.example`: required configuration without real secrets.
- A hardware integration guide with unresolved calibration/wiring assumptions called out.
- A three-minute demo script covering overview, changing data, evidence, disconnection, and recovery.
- A concise CI/CD and future improvements backlog.

In your final handoff, state what works, how to run it, what was verified, and what still needs physical hardware or credentials. Keep the original reference documents intact and record this prompt's updated naming and showcase decisions in the implementation documentation.
