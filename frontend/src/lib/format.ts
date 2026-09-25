import type { Project, State } from "@/types";

export const summaryTime = (value: number) => new Date(value * 1000).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const emailStatus = (status: string, enabled: boolean) => status === "not_configured" && !enabled ? "off" : status.replace("_", " ");

export const sessionLabel = (mode: string) =>
  mode === "live" ? "Live" : mode === "simulated" ? "Simulation" : mode === "replay" ? "Replay" : mode;

export function humanAction(value: string) {
  const [action, raw] = value.split(":");
  if (action === "set_led") return raw === "true" ? "Turn LED on" : "Turn LED off";
  if (action === "acknowledge_event") return "Acknowledge event";
  return action.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

export function metricValue(value: unknown, precision: number) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: precision });
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

export function isVisibleMetric(key: string) {
  return !key.endsWith("command_id") && !key.includes("last_command_id");
}

export function controlReady(state: State, project: Project, control: { expected: { field: string } }) {
  if (state.session.mode !== "live") return false;
  const deviceId = project.graph.fields[control.expected.field]?.device_id;
  const device = state.devices.find((item) => item.id === deviceId);
  return !!device && (device.connector === "usb" ? device.online : device.reporting);
}
