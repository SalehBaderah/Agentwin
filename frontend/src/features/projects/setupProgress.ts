import type { Project, State, Reading } from "../../types.ts";

// Browser records describe operator actions, never device evidence.
export type SetupRecord = { downloadedAt?: number; flashedAt?: number };
export const setupRecordKey = (project: string, device: string, template: string) =>
  `agentwin-setup:${project}:${device}:${template}`;
export function readSetupRecord(storage: Pick<Storage, "getItem">, key: string, contract: string): SetupRecord {
  try {
    const saved = JSON.parse(storage.getItem(key) || "null");
    if (saved?.contract !== contract) return {};
    const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
    return {
      ...(valid(saved.downloadedAt) ? { downloadedAt: saved.downloadedAt } : {}),
      ...(valid(saved.downloadedAt) && valid(saved.flashedAt) && saved.flashedAt >= saved.downloadedAt ? { flashedAt: saved.flashedAt } : {}),
    };
  } catch { return {}; }
}
export function writeSetupRecord(storage: Pick<Storage, "setItem">, key: string, contract: string, record: SetupRecord) {
  storage.setItem(key, JSON.stringify({ contract, ...record }));
}

// Stages remain independent: telemetry cannot prove a browser download or upload.
export function onboardingProgress(configured: boolean, record: SetupRecord, evidence: { reporting: boolean; verified: boolean }) {
  const steps = [
    { id: "configured", label: "Configured", done: configured, tip: "This device is registered in the saved project configuration." },
    { id: "downloaded", label: "Firmware downloaded", done: configured && !!record.downloadedAt, tip: "The firmware package reached this browser and a download was started. Saving it to disk is not observed." },
    { id: "uploaded", label: "Upload confirmed", done: configured && !!record.flashedAt, tip: "You confirmed uploading this package. This browser record is not observed hardware evidence." },
    { id: "reporting", label: "Reporting", done: configured && evidence.reporting, tip: "Fresh, correctly typed telemetry is arriving from this device in the selected Live session." },
    { id: "verified", label: "Telemetry verified", done: configured && evidence.reporting && evidence.verified, tip: "Fresh Live samples advance in sequence and receipt time and match the expected template contract. Wiring and sensor accuracy are not verified." },
  ];
  const firstPending = steps.findIndex((step) => !step.done);
  const lastComplete = [...steps].reverse().find((step) => step.done);
  return { steps, complete: firstPending < 0, currentIndex: firstPending < 0 ? steps.length - 1 : firstPending, status: lastComplete?.label ?? "Configuration required" };
}

export function setupEvidence(state: State, project: Project, device: string, fields: string[], compatible: boolean, connected: boolean, now: number) {
  if (state.project.id !== project.id || state.session.mode !== "live")
    return { reporting: false, verified: false, note: "Select a Live session to check device reporting. Simulation and Replay never verify setup." };
  if (!connected) return { reporting: false, verified: false, note: "Backend disconnected. Stored readings are last-known evidence only." };
  const samples = [...state.readings, ...(state.latest ? [state.latest] : [])]
    .filter((sample) => sample.device === device)
    .sort((a, b) => b.received - a.received || b.id - a.id);
  const ageValid = (sample: Reading, field: string) => {
    const metric = project.graph.fields[field];
    const value = sample.readings[field];
    const age = now - sample.received;
    return !!metric && metric.device_id === device && age >= 0 && age <= (metric.freshness_seconds ?? project.freshness_seconds)
      && (metric.data_type === "number" ? typeof value === "number" && Number.isFinite(value)
        : metric.data_type === "boolean" ? typeof value === "boolean" : typeof value === "string");
  };
  const reporting = fields.some((field) => samples.some((sample) => ageValid(sample, field)));
  const latest = samples[0];
  const complete = (sample: Reading) => fields.length > 0 && fields.every((field) => ageValid(sample, field));
  // Receipt time, boot identity and sequence must all advance in this Live session.
  // Verify telemetry contract only; firmware identity and physical output are not observed.
  const verified = compatible && !!latest?.boot && Number.isInteger(latest.seq) && complete(latest)
    && samples.some((sample) => sample.boot === latest.boot && Number.isInteger(sample.seq)
      && sample.seq! < latest.seq! && sample.received < latest.received && complete(sample));
  return { reporting, verified, note: verified
    ? "Telemetry contract verified: fresh expected fields and advancing receipt time/sequence in this Live session. Hardware is not independently verified."
    : reporting ? "Live telemetry received. Verification needs two fresh, complete samples with advancing sequence in the same boot."
      : samples.length ? "Last known telemetry is unavailable or stale. Waiting for fresh Live readings from this device."
        : "Waiting for Live telemetry from this device. Downloading or confirming an upload does not establish reporting." };
}
