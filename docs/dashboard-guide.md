# Agentwin Dashboard — Brief Guide

Agentwin brings multiple IoT systems into one interface. Each project describes a system's devices, components, readings, connections, and supported controls.

## What the UI shows

| Area | What you see | Why it is useful |
| --- | --- | --- |
| Platform overview | Project cards, reporting devices, telemetry history, pending actions, and open events | Find which systems need attention without opening every project. |
| Project header | Project name and copyable ID, selected session, connection status, freshness, latest reading, and last telemetry time | Identify the system and judge whether its data is current. |
| Overview tab | Component readings, device status, and recent actions | Check the project's current condition quickly. |
| Live readings | Numeric charts or state changes, with a **Window** selector for **Latest 30**, **Latest 60**, or **All available** readings | Apply the same sample window to every metric, chart, and statistic in the selected session. Up to 180 recent readings are available in this view. |
| Digital twin | Device/component nodes, configured connections, and reported state | Understand where a reading comes from and which component is involved. |
| Events & history | Event evidence, timestamps, acknowledgement, and recovery status | Investigate interruptions; acknowledging an event does not fix its cause. |
| Controls | Supported actions, reported state, and command results | Verify a command through matching device telemetry and acknowledgement. |
| Project agent | Questions about this project's selected session, evidence, uncertainty, and suggested next steps | Help interpret readings and events when an AI provider is configured. |

**Telemetry** means readings sent by firmware. **Freshness** is the allowed time without a new reading: an 8-second threshold means older data is stale. A stored value does not prove the device is still in that state. Live and test sessions are displayed separately.

In **Live readings**, **Clear history** asks for confirmation before deleting older
telemetry across all metrics in the selected session. The latest reading for each
device is kept, along with settings, events, actions, and other sessions. New
readings continue to arrive. Clearing history does not make stale telemetry fresh
or reset device sequencing.

## How the current digital twin works

1. Project configuration creates controller, transport, sensor, and actuator nodes, plus their relationships.
2. Incoming telemetry supplies the component values and freshness indicators. Nodes show their type, name, and available state.
3. Click a node to inspect readings, configured pins, relationships, recent state changes, and related actions/events.
4. Drag nodes, pan, or zoom to explore the system. Supported controls are also available in the details panel.

The twin is a **configured topology with reported operational state**. It does not discover wiring, prove electrical continuity, or simulate physical behavior. Moving nodes changes the view, not the hardware; positions are currently held in the view rather than saved permanently. A controller or gateway without bound readings may show configuration only.

## Existing and new projects

The same interface is built from each project's configuration. A new project follows **Name & template → Devices → Components → Fields → Freshness → Review**. Templates provide starting components; firmware must publish the matching IDs, field names, and value types. Until telemetry arrives, the project has no live measurements. Adding a UI component does not install its hardware driver.

**Example — UNO D13 LED:** the twin shows the LED connected to the UNO and the UNO reporting through USB. Request **Turn on**; the action completes when firmware reports ON with the matching command ID. This verifies the firmware-reported output, not optical light emission.

**Example — a new humidity project:** configure a humidity sensor and its board, then connect matching firmware. The same dashboard shows humidity, its history, freshness, and topology. Controls appear only for configured, implemented actuator capabilities.
