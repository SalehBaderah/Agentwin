import type { State } from "../../types";

export function readingModel(state: State, field: string) {
  const metric = state.project.graph.fields[field];
  const unit = metric.unit.trim().toLowerCase();
  const semantic = `${field} ${metric.label}`.toLowerCase().replaceAll("_", " ");
  // ADC counts are continuous measurements; integers alone do not imply events.
  const count = /\b(counter|events|pulses|packets|count)\b/.test(semantic) || /^(events?|pulses?|packets?)$/.test(unit);
  const kind = metric.data_type === "boolean" ? "state" : metric.data_type === "categorical" ? "category" : count ? "count" : "continuous";
  const valid = (value: unknown) => metric.data_type === "number" ? typeof value === "number" && Number.isFinite(value) : metric.data_type === "boolean" ? typeof value === "boolean" : typeof value === "string";
  const samples = state.readings
    .filter(reading => !metric.device_id || reading.device === metric.device_id)
    .slice().sort((a, b) => a.received - b.received);
  const observations = samples.filter(reading => valid(reading.readings[field]));
  const latest = observations.at(-1);
  const numbers = observations.map(reading => reading.readings[field]).filter((value): value is number => typeof value === "number");
  const rows: { received: number; value: number | string | null }[] = [];
  let gaps = 0;
  samples.forEach((reading, index, all) => {
    const previous = all[index - 1];
    const limit = metric.freshness_seconds ?? state.project.freshness_seconds;
    const restarted = previous?.boot && reading.boot && previous.boot !== reading.boot;
    if (previous && (reading.received - previous.received > limit || restarted)) {
      const separator = previous.received + Math.min(limit, (reading.received - previous.received) / 2);
      rows.push({ received: separator, value: null });
      gaps += 1;
    }
    const value = reading.readings[field];
    rows.push({ received: reading.received, value: valid(value) ? typeof value === "boolean" ? Number(value) : value as number | string : null });
  });
  const range: [number, number] | undefined = kind === "state" ? [0, 1] : /^(%|percent)$/.test(unit) ? [0, 100] : /\bprobability\b/.test(semantic) && !unit && numbers.every(n => n >= 0 && n <= 1) ? [0, 1] : undefined;
  const transitions = samples.filter((reading, index, all) => index === 0 || reading.readings[field] !== all[index - 1].readings[field]).slice().reverse();
  const frequencies = new Map<string, number>();
  if (kind === "category") observations.forEach(reading => {
    const category = String(reading.readings[field]);
    frequencies.set(category, (frequencies.get(category) ?? 0) + 1);
  });
  const categories = [...frequencies].map(([label, count]) => ({ label, count, percent: count / observations.length * 100 })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { kind, rows, latest, numbers, range, transitions, categories, gaps, count: observations.length };
}
