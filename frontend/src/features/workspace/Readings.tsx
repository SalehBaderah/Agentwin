import { useState } from "react";
import { Activity } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";
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

export function ReadingCard({ state, field, embedded = false, categoricalView = "distribution" }: { state: State; field: string; embedded?: boolean; categoricalView?: "distribution" | "timeline" }) {
  const [limit, setLimit] = useState(5);
  const metric = state.project.graph.fields[field];
  const model = readingModel(state, field);
  const { kind, rows, latest, numbers, range, transitions } = model;
  const fresh = latest && state.field_status[field]?.fresh;
  // Legacy field metadata can declare zero precision for fractional sensors.
  const precision = Math.max(metric.precision, numbers.some(value => !Number.isInteger(value)) ? 3 : 0);
  const format = (value: unknown) => metricValue(value, precision);
  const color = "var(--chart-2)";
  return <article className={embedded ? "min-w-0" : "min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"} aria-label={`${metric.label} reading`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-semibold break-words">{metric.label}</h4><p className="mt-1 text-xs text-muted-foreground">{kind === "state" ? "State history" : kind === "category" ? "Reported state" : kind === "count" ? "Count history" : "Sensor history"}{metric.unit ? ` · ${metric.unit}` : ""}</p></div>
      <StatusBadge tone={fresh ? "success" : latest ? "warning" : "neutral"}>{fresh ? state.session.mode === "live" ? "Live" : "Fresh" : latest ? "Stale" : "Unavailable"}</StatusBadge>
    </header>
    <div className="mt-6 mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><strong className="font-heading text-3xl font-semibold tracking-tight break-words tabular-nums">{format(latest?.readings[field])}</strong>{latest && metric.unit && <span className="ml-2 text-sm text-muted-foreground">{metric.unit}</span>}</div>
      <span className="text-xs text-muted-foreground" title={latest ? new Date(latest.received * 1000).toLocaleString() : undefined}>{latest ? `${fresh ? "Received" : "Last known"} ${time(latest.received)}` : "Awaiting telemetry"}</span>
    </div>
    {latest ? (kind === "state" || kind === "category" && categoricalView === "timeline") ? <StateTimeline state={state} field={field} /> : kind === "category" ? <section className="border-t pt-5" aria-label={`${metric.label} distribution`}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2"><h5 className="text-xs font-medium">State distribution</h5><span className="text-[11px] text-muted-foreground">Share of {model.count} reported samples</span></div>
      <div className="max-h-64 space-y-5 overflow-y-auto pr-1">
        {model.categories.map((category, index) => <div key={category.label}>
          <div className="mb-2 flex items-baseline justify-between gap-4 text-xs"><span className="min-w-0 break-all font-medium">{category.label}</span><span className="shrink-0 text-muted-foreground tabular-nums">{category.count} <span className="ml-2 font-semibold text-foreground">{category.percent.toLocaleString("en-US", { maximumFractionDigits: 1 })}%</span></span></div>
          <div role="meter" aria-label={`${category.label}: ${category.count} samples`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={category.percent} className="h-3 overflow-hidden rounded-sm bg-muted/50" title={`${category.label}: ${category.count} of ${model.count} samples`}><div className="h-full rounded-sm motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${category.percent}%`, background: index % 2 === 0 ? "var(--chart-2)" : "var(--chart-1)" }} /></div>
        </div>)}
      </div>
      <div className="mt-3 flex justify-between text-[10px] text-muted-foreground" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
      <p className="mt-3 text-[11px] text-muted-foreground">Sample frequency, not duration in each state.</p>
    </section> : <ChartContainer config={{ value: { label: metric.label, color } }} className="aspect-auto h-56 w-full border-t pt-5">
      <ComposedChart accessibilityLayer data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 5" />
        <XAxis dataKey="received" type="number" domain={["dataMin", "dataMax"]} tickFormatter={value => time(Number(value))} tickLine={false} axisLine={false} minTickGap={65} />
        <YAxis width={48} tickLine={false} axisLine={false} domain={range ?? (kind === "count" ? [0, "auto"] : ["auto", "auto"])} allowDecimals={kind !== "count"} tickFormatter={value => Number(value).toLocaleString("en-US", { maximumSignificantDigits: 3 })} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => time(Number(payload?.[0]?.payload?.received))} formatter={value => <><span className="text-muted-foreground">{metric.label}</span><strong className="ml-auto tabular-nums">{format(value)} {metric.unit}</strong></>} />} />
        {kind === "count" ? <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} /> : <Area dataKey="value" type="linear" stroke={color} fill={color} fillOpacity={0.08} strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />}
      </ComposedChart>
    </ChartContainer> : <EmptyState className="h-56 justify-center border-0" icon={<Activity />} title="No readings in this session"><p>This field appears when the selected source reports it.</p></EmptyState>}
    {numbers.length > 0 && kind === "continuous" && <dl className="mt-5 grid grid-cols-3 gap-3 border-t pt-4 text-xs">{[["Min", Math.min(...numbers)], ["Sample average", numbers.reduce((sum, n) => sum + n, 0) / numbers.length], ["Max", Math.max(...numbers)]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{format(value)} {metric.unit}</dd></div>)}</dl>}
    {range && kind !== "state" && <p className="mt-3 text-xs text-muted-foreground">Range {range[0]}–{range[1]} {metric.unit}</p>}
    {(kind === "state" || kind === "category") && transitions.length > 0 && <div className="mt-5 border-t pt-4"><h5 className="mb-2 text-xs font-medium text-muted-foreground">Recent changes</h5><div className="divide-y">{transitions.slice(0, limit).map(reading => <div key={reading.id} className="flex justify-between gap-4 py-2 text-xs"><span className="text-muted-foreground">{time(reading.received)}</span><strong className="break-all text-right font-medium">{format(reading.readings[field])}</strong></div>)}</div>{transitions.length > 5 && <Button variant="ghost" size="sm" onClick={() => setLimit(limit >= transitions.length ? 5 : limit + 10)}>{limit >= transitions.length ? "Show less" : "Show more"}</Button>}</div>}
    <footer className="mt-4 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground"><span>{sessionLabel(state.session.mode)} session</span><span>{model.count} observations · gaps stay empty</span></footer>
  </article>;
}

export function Readings({ state }: { state: State }) {
  const [field, setField] = useState("all");
  const fields = Object.entries(state.project.graph.fields);
  return <div className="grid gap-5">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="text-base font-semibold">Live readings</h3><p className="mt-1 text-[13px] text-muted-foreground">Stored observations from the selected session. Missing samples remain gaps.</p></div><FormField id="readings-metric" label="Metric"><OptionSelect id="readings-metric" value={field} onValueChange={setField} className="sm:w-56" options={[{ value: "all", label: "All metrics" }, ...fields.map(([key, item]) => ({ value: key, label: `${item.label} ${item.unit}` }))]} /></FormField></div>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">{fields.filter(([key]) => field === "all" || field === key).map(([key]) => <ReadingCard key={`${state.session.id}:${key}`} state={state} field={key} />)}</div>
  </div>;
}
