import { useState } from "react";
import { Activity } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { StatusBadge } from "@/components/StatusBadge";
import { metricValue, sessionLabel } from "@/lib/format";
import type { State } from "@/types";
import { time } from "@/types";
import { readingModel } from "./readingModel";
import { StateTimeline } from "./StateTimeline";
import { CategoricalSummary } from "./CategoricalSummary";
import { CommandAcknowledgementCard, isCommandAcknowledgement } from "./CommandAcknowledgement";

export function ReadingCard({ state, field, embedded = false, categoricalView = "distribution", windowSize }: { state: State; field: string; embedded?: boolean; categoricalView?: "distribution" | "timeline"; windowSize?: string }) {
  const historyState = windowSize && windowSize !== "all"
    ? { ...state, readings: state.readings.slice(-Number(windowSize)) }
    : state;
  return isCommandAcknowledgement(state, field)
    ? <CommandAcknowledgementCard state={historyState} field={field} embedded={embedded} />
    : <MetricReadingCard state={historyState} field={field} embedded={embedded} categoricalView={categoricalView} sampleWindow={windowSize !== undefined} />;
}

function MetricReadingCard({ state, field, embedded, categoricalView, sampleWindow }: { state: State; field: string; embedded: boolean; categoricalView: "distribution" | "timeline"; sampleWindow: boolean }) {
  const [limit, setLimit] = useState(5);
  const metric = state.project.graph.fields[field];
  const model = readingModel(state, field);
  const { kind, rows, latest, numbers, range, transitions } = model;
  const fresh = latest && state.field_status[field]?.fresh;
  // Legacy field metadata can declare zero precision for fractional sensors.
  const precision = Math.max(metric.precision, numbers.some(value => !Number.isInteger(value)) ? 3 : 0);
  const format = (value: unknown) => metricValue(value, precision);
  const color = "var(--chart-2)";
  const start = rows[0]?.received ?? 0;
  const end = rows.at(-1)?.received ?? start;
  const padding = Math.max(state.project.interval_seconds, 1);
  const timeDomain = start === end ? [start - padding, end + padding] : [start, end];
  const axisTime = (value: number) => new Date(value * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return <article className={embedded ? "min-w-0" : "min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"} aria-label={`${metric.label} reading`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-semibold break-words">{metric.label}</h4><p className="mt-1 text-xs text-muted-foreground">{kind === "state" ? "State history" : kind === "category" ? "Reported state" : kind === "count" ? "Count history" : "Sensor history"}{metric.unit ? ` · ${metric.unit}` : ""}</p></div>
      <StatusBadge tone={fresh ? "success" : latest ? "warning" : "neutral"}>{fresh ? state.session.mode === "live" ? "Live" : "Fresh" : latest ? "Stale" : "Unavailable"}</StatusBadge>
    </header>
    <div className="mt-6 mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><strong className="font-heading text-3xl font-semibold tracking-tight break-words tabular-nums">{format(latest?.readings[field])}</strong>{latest && metric.unit && <span className="ml-2 text-sm text-muted-foreground">{metric.unit}</span>}</div>
      <span className="text-xs text-muted-foreground" title={latest ? new Date(latest.received * 1000).toLocaleString() : undefined}>{latest ? `${fresh ? "Received" : "Last known"} ${time(latest.received)}` : "Awaiting telemetry"}</span>
    </div>
    {latest ? (kind === "state" || kind === "category" && categoricalView === "timeline") ? <StateTimeline state={state} field={field} sampleWindow={sampleWindow} /> : kind === "category" ? <CategoricalSummary state={state} field={field} /> : <ChartContainer config={{ value: { label: metric.label, color } }} className="aspect-auto h-56 w-full border-t pt-5">
      <ComposedChart accessibilityLayer data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 5" />
        <XAxis dataKey="received" type="number" scale="time" domain={timeDomain} tickFormatter={value => axisTime(Number(value))} tickLine={false} axisLine={false} tickMargin={10} minTickGap={32} />
        <YAxis width={48} tickLine={false} axisLine={false} domain={range ?? (kind === "count" ? [0, "auto"] : ["auto", "auto"])} allowDecimals={kind !== "count"} tickFormatter={value => Number(value).toLocaleString("en-US", { maximumSignificantDigits: 3 })} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => time(Number(payload?.[0]?.payload?.received))} formatter={value => <><span className="text-muted-foreground">{metric.label}</span><strong className="ml-auto tabular-nums">{format(value)} {metric.unit}</strong></>} />} />
        {kind === "count" ? <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} /> : <Line dataKey="value" type="linear" stroke={color} strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: color }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />}
      </ComposedChart>
    </ChartContainer> : <EmptyState className="h-56 justify-center border-0" icon={<Activity />} title="No readings in this session"><p>This field appears when the selected source reports it.</p></EmptyState>}
    {numbers.length > 0 && kind === "continuous" && <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-xs">{[["Min", Math.min(...numbers)], ["Sample average", numbers.reduce((sum, n) => sum + n, 0) / numbers.length], ["Max", Math.max(...numbers)]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{format(value)} {metric.unit}</dd></div>)}</dl>}
    {range && kind !== "state" && <p className="mt-3 text-xs text-muted-foreground">Range {range[0]}–{range[1]} {metric.unit}</p>}
    {(kind === "state" || kind === "category") && transitions.length > 0 && <div className="mt-5 border-t pt-4"><h5 className="mb-2 text-xs font-medium text-muted-foreground">Recent changes</h5><div className="divide-y">{transitions.slice(0, limit).map(reading => <div key={reading.id} className="flex justify-between gap-4 py-2 text-xs"><span className="text-muted-foreground">{time(reading.received)}</span><strong className="break-all text-right font-medium">{format(reading.readings[field])}</strong></div>)}</div>{transitions.length > 5 && <Button variant="ghost" size="sm" onClick={() => setLimit(limit >= transitions.length ? 5 : limit + 10)}>{limit >= transitions.length ? "Show less" : "Show more"}</Button>}</div>}
    <footer className="mt-4 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground"><span>{sessionLabel(state.session.mode)} session</span><span>{model.count} observations · {model.gaps} {model.gaps === 1 ? "gap" : "gaps"}</span></footer>
  </article>;
}

export function Readings({ state }: { state: State }) {
  const [field, setField] = useState("all");
  const [windowSize, setWindowSize] = useState("30");
  const fields = Object.entries(state.project.graph.fields);
  const available = state.readings.length;
  const shown = windowSize === "all" ? available : Math.min(available, Number(windowSize));
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h3 className="text-base font-semibold">Live readings</h3><p className="mt-1 text-[13px] text-muted-foreground">Stored observations from the selected session. Missing samples remain gaps.</p></div>
      <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap">
        <FormField id="readings-metric" label="Metric"><OptionSelect id="readings-metric" value={field} onValueChange={setField} className="sm:w-56" options={[{ value: "all", label: "All metrics" }, ...fields.map(([key, item]) => ({ value: key, label: `${item.label} ${item.unit}` }))]} /></FormField>
        <FormField id="readings-window" label="Window"><OptionSelect id="readings-window" value={windowSize} onValueChange={setWindowSize} disabled={available === 0} className="sm:w-40" options={[{ value: "30", label: "Latest 30" }, { value: "60", label: "Latest 60" }, { value: "all", label: "All available" }]} /></FormField>
      </div>
    </div>
    <p className="text-xs text-muted-foreground" role="status">Showing {shown} of {available} recent readings. Up to 180 are available in this view.</p>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">{fields.filter(([key]) => field === "all" || field === key).map(([key]) => <ReadingCard key={`${state.session.id}:${key}:${windowSize}`} state={state} field={key} windowSize={windowSize} />)}</div>
  </div>;
}
