# Digital Twin configuration

Agentwin renders each project's Digital Twin from `project.graph`. The current schema version is `3`. Existing projects are upgraded when loaded while preserving component IDs and telemetry field keys, so stored readings, URLs, and event evidence keep their identity. Version 3 adds the live LED actuator and its acknowledged state fields to the connectivity template.

## Project definition

A project graph contains four collections:

- `components`: stable `id`, user-facing `name`, `type`, broad `category`, optional `group`, telemetry `bindings`, `capabilities`, static `configuration`, and optional visual hints.
- `fields`: telemetry keys mapped to a component, with label, unit, data type (`number`, `boolean`, or `categorical`), precision, freshness limit, source mode, and calibration status.
- `edges`: stable IDs and directed semantic relationships. The built-in relationship kinds are `measures`, `controls`, `telemetry`, `connected`, `located_in`, and `powers`. Their categories determine consistent visual treatment.
- `groups`: optional subsystem or location identifiers and labels.

The renderer chooses a node treatment from the component category (`sensor`, `controller`, `actuator`, `gateway`, `passive`, `software`, or `asset`). Any unrecognized category uses the generic node, so a new protocol or vendor component remains visible before a specialized renderer exists.

## State boundaries

Keep these forms of state separate when extending the platform:

| State | Stored in | Meaning |
| --- | --- | --- |
| Static configuration | `component.configuration` | User or installer supplied facts such as channel, location, or physical setup |
| Reported state | Telemetry `readings` | Values received from a device, gateway, replay, or simulator |
| Derived state | Backend events and summaries | Server calculations based on reported readings and rules |
| Requested state | Action request and audit record | An operator's requested change; it must not be displayed as confirmed device state |

Actions appear only when a component advertises an implemented `action:*` capability. A production connector should add permission checks, delivery acknowledgement, failure state, and audit history before advertising that capability.

## Adding a project or protocol

1. Add a definition in `backend/templates.py`, or persist an equivalent version 2 graph.
2. Give every component and edge a stable project-local ID. Never derive identity from display names or visual position.
3. Bind each telemetry field to one component and declare its actual data type, unit, source, and freshness window.
4. Add semantic edges and optional groups. Layout is computed deterministically from relationships, so visual coordinates are optional.
5. Add a category renderer only when the component needs meaningfully different visuals. The generic fallback is the default extension path.
6. Add connector ingestion that emits the shared telemetry envelope in `schemas/telemetry-v1.json`; no Digital Twin UI fork is required.

The bundled Connectivity, Temperature, and Water templates exercise numeric and categorical telemetry, different units and freshness windows, passive components, gateways, groups, and semantic relationships.
