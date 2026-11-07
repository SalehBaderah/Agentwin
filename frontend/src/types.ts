export type Reading = {
  id: number;
  device?: string;
  boot?: string;
  seq?: number;
  uptime?: number;
  received: number;
  readings: Record<string, number | boolean | string | null>;
  original: null | { received: number };
};
export type Event = {
  id: string;
  kind: string;
  subject: string;
  created: number;
  recovered: number | null;
  acknowledged: number | null;
  severity: string;
  email_status: "pending" | "sent" | "failed" | "cancelled" | "not_configured";
  evidence: {
    rule: string;
    cause: string;
    readings: Reading[];
    source_mode: string;
    device_id?: string;
    field_key?: string;
    direction?: "above" | "below";
    limit?: number;
    unit?: string;
    close_reason?: string;
  };
};
export type ThresholdRule = { field_key: string; direction: "above" | "below"; limit: number };
export type MonitoringSettings = {
  silence_seconds: number;
  threshold_rules: ThresholdRule[];
  summary_enabled: boolean;
  summary_interval_minutes: number;
  alert_email_enabled: boolean;
  summary_email_enabled: boolean;
  email_to: string | null;
};
export type Summary = {
  id: string;
  period_start: number;
  period_end: number;
  created: number;
  body: string;
  source: "local_model" | "deterministic";
  email_status: "pending" | "sent" | "failed" | "cancelled" | "not_configured";
};
export type Component = {
  id: string;
  name: string;
  label: string;
  type: string;
  category: string;
  kind: string;
  description?: string;
  group?: string | null;
  bindings: string[];
  capabilities: string[];
  controls?: { action: string; label: string; parameters: Record<string, unknown>; expected: { field: string; command_field?: string }; timeout_seconds?: number }[];
  configuration: Record<string, unknown>;
  visual: Record<string, unknown>;
};
export type Metric = {
  unit: string;
  label: string;
  component: string;
  component_id: string;
  data_type: "number" | "boolean" | "categorical";
  precision: number;
  freshness_seconds: number | null;
  calibrated: boolean;
  source: string;
  device_id?: string | null;
};
export type Project = {
  id: string;
  name: string;
  arabic_title: string | null;
  template: string;
  description: string;
  device_id: string;
  connector: string;
  freshness_seconds: number;
  interval_seconds: number;
  high_limit: number | null;
  monitoring: MonitoringSettings;
  attenuator_inserted?: boolean;
  cable_description: string;
  mapping: { field: string; unit: string };
  devices: { id: string; connector: string; serial_port?: string | null; baud_rate?: number }[];
  components?: Record<string, unknown>[];
  retention_days: number;
  graph: {
    schema_version: number;
    primary_field: string;
    fields: Record<string, Metric>;
    components: Component[];
    edges: { id: string; source: string; target: string; kind: string; label: string; category: string }[];
    groups: { id: string; name: string }[];
    capabilities?: Record<string, unknown>[];
  };
};
export type Session = {
  id: string;
  mode: string;
  created: number;
  scenario: string;
  provenance: { origin: string };
};
export type ControlProposal = {
  id: string;
  status: string;
  component_id: string;
  device_id: string;
  label: string;
  control_label?: string;
  action: string;
  value: boolean | number | string;
  expires_at: number;
};
export type State = {
  project: Project;
  session: Session;
  sessions: Session[];
  latest: Reading | null;
  readings: Reading[];
  events: Event[];
  summaries: Summary[];
  next_summary_email_due: number | null;
  server_time: number;
  actions: { id: string; created: number; action: string; target: string; status: string; proposal?: ControlProposal }[];
  devices: { id: string; connector: string; online: boolean; reporting: boolean }[];
  field_status: Record<string, { received: number | null; fresh: boolean; device_id?: string | null }>;
  status: string;
  gateway_status: string;
};
export type Answer = {
  available: boolean;
  finding: string;
  uncertainty: string;
  next_step: string;
  source?: string;
  control_proposal?: ControlProposal;
  evidence: {
    id: string;
    timestamp: number;
    readings?: Record<string, number | boolean | string | null>;
    trigger?: string;
  }[];
};
export const strings = {
  brand: "Agentwin",
  tagline: "Every system. Its own agent.",
  overview: "Overview",
  projects: "Projects",
  events: "Events",
  settings: "Settings",
  add: "Add project",
  unavailable: "AI agent unavailable",
};
export async function api<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    "/api" + path,
    body === undefined
      ? undefined
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : "Check your configuration and try again.",
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const time = (value: number | null | undefined) =>
  value
    ? new Date(value * 1000).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "No data yet";
export const display = (value: unknown) =>
  value === null || value === undefined
    ? "—"
    : typeof value === "number"
      ? Number(value.toFixed(4)).toLocaleString("en-US")
      : String(value);
