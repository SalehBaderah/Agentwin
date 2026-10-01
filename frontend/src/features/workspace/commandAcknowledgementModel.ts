import type { State } from "../../types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** A command ID is protocol evidence, identified by the existing confirmation contract. */
export function isCommandAcknowledgement(state: State, field: string): boolean {
  return state.project.graph.components.some(component =>
    component.controls?.some(control => control.expected.command_field === field),
  ) || (state.project.graph.capabilities ?? []).some(capability =>
    asRecord(capability.expected)?.command_field === field,
  );
}

export function commandAcknowledgementModel(state: State, field: string) {
  const metric = state.project.graph.fields[field];
  const deviceId = metric?.device_id;
  // A null report clears the prior ID, for example after a device reboot. Do not
  // scan back to an older non-null acknowledgement or use another device's data.
  const latest = [...state.readings].reverse().find(reading =>
    (!deviceId || reading.device === deviceId) && Object.hasOwn(reading.readings, field),
  );
  const rawId = latest?.readings[field];
  const commandId = typeof rawId === "string" && rawId.trim() ? rawId : null;
  const targets = new Set(state.project.graph.components
    .filter(component => component.controls?.some(control => control.expected.command_field === field))
    .map(component => component.id));
  (state.project.graph.capabilities ?? []).forEach(capability => {
    if (asRecord(capability.expected)?.command_field === field && typeof capability.component_id === "string") {
      targets.add(capability.component_id);
    }
  });
  const action = commandId ? state.actions.find(action =>
    action.id === commandId && targets.has(action.target),
  ) : undefined;
  const status = state.field_status[field];
  const fresh = Boolean(latest && status?.fresh && status.received === latest.received);
  return { latest, commandId, action, fresh };
}
