# Three-minute Agentwin rehearsal

Start the built app at http://127.0.0.1:8000. This rehearsal uses **synthetic simulation**, not wired hardware. No AI key is required.

| Time | Action | What it demonstrates |
| --- | --- | --- |
| 0:00–0:25 | Open Overview. Explain “Every system. Its own agent.” Show the connectivity and generic sensor templates. | One shared platform; counts come from SQLite. |
| 0:25–0:55 | Open Smart Systems Connectivity, keep Simulated selected, click Start normal. Show voltage, raw counts, null RSSI and unavailable RF power. | Backend-generated data passes shared validation, persistence and WebSocket delivery. |
| 0:55–1:20 | Select Digital twin and click AD8313. Explain RF measurement vs telemetry; show passive inventory. | A live operational representation, not a physics model. |
| 1:20–1:45 | Click Detector / level change. After three samples open Events & history; select high reading. Acknowledge the event. | Actual rule and stored evidence. Acknowledgement does not resolve the condition. |
| 1:45–2:10 | Ask “What evidence supports this event?” If configured, inspect cited evidence. Otherwise show AI agent unavailable and use the deterministic event evidence. | Honest provider availability; monitoring remains functional. |
| 2:10–2:35 | Pause telemetry, wait just over eight seconds, show missing telemetry and a chart gap. Click Recover; wait three samples. | Freshness detection and explicit recovery without diagnosing a cause. |
| 2:35–3:00 | Add a generic sensor, choose field `water_cm`, unit `cm`, save. Show its own topic, simulated session and agent context. | Reuse and persistent project creation. |

Optional follow-up: replay a recording and point to the **replay · synthetic** label. Select Live to show awaiting/stale hardware data; there is no automatic simulation fallback. Refresh or restart the backend to demonstrate persistent configuration/history. Producers stop on restart; click Start normal to resume explicitly.
