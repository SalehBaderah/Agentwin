import type { Reading } from "../../types";

export type StateInterval = {
  start: number;
  end: number;
  label: string | null;
};

/** Duration is bounded by the stored observation window, never inferred beyond it. */
export function stateHistory(
  readings: Reading[],
  field: string,
  freshness: number,
  deviceId?: string | null,
  options: { boolean?: boolean; windowSeconds?: number } = {},
) {
  const samples = readings
    .filter(
      (r) =>
        Number.isFinite(r.received) && (!deviceId || r.device === deviceId),
    )
    .slice()
    .sort((a, b) => a.received - b.received);
  const points = new Map<number, Reading>();
  samples.forEach((r) => points.set(r.received, r));
  const ordered = [...points.values()];
  const end = ordered.at(-1)?.received ?? 0;
  const start = Math.max(ordered[0]?.received ?? end, options.windowSeconds ? end - options.windowSeconds : -Infinity);
  const labelFor = (value: unknown): string | null => options.boolean ? typeof value === "boolean" ? value ? "On" : "Off" : null : typeof value === "string" ? value : null;
  const duration = end - start;
  const intervals: StateInterval[] = [];
  const appendInterval = (interval: StateInterval) => {
    const previous = intervals.at(-1);
    if (previous && previous.label === interval.label && previous.end === interval.start) previous.end = interval.end;
    else intervals.push(interval);
  };
  const totals = new Map<string, number>();
  const labels = [
    ...new Set(
      ordered
        .map((r) => labelFor(r.readings[field]))
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  let covered = 0;
  ordered.forEach((r, index) => {
    const next = ordered[index + 1]?.received;
    if (next === undefined || next <= r.received || next <= start) return;
    const raw = labelFor(r.readings[field]);
    const from = Math.max(start, r.received);
    const until =
      typeof raw === "string"
        ? Math.min(next, r.received + Math.max(0, freshness))
        : r.received;
    if (until > from && typeof raw === "string") {
      appendInterval({ start: from, end: until, label: raw });
      const elapsed = until - from;
      totals.set(raw, (totals.get(raw) ?? 0) + elapsed);
      covered += elapsed;
    }
    if (until < next) appendInterval({ start: Math.max(from, until), end: next, label: null });
  });
  return {
    start,
    end,
    duration,
    covered,
    unknown: Math.max(0, duration - covered),
    labels,
    intervals,
    shares: labels.map((label) => ({
      label,
      seconds: totals.get(label) ?? 0,
      percent: duration ? ((totals.get(label) ?? 0) / duration) * 100 : 0,
    })),
  };
}
