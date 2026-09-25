import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { isVisibleMetric, metricValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { State } from "@/types";
import { display, time } from "@/types";

export function PlatformAnalytics({ states }: { states: State[] }) {
  const [projectId, setProjectId] = useState(states[0]?.project.id || "");
  const [metricKey, setMetricKey] = useState("");
  const [windowSize, setWindowSize] = useState("30");
  const selected = states.find((state) => state.project.id === projectId) || states[0];
  if (!selected) return null;
  const visibleFields = Object.entries(selected.project.graph.fields).filter(([key]) => isVisibleMetric(key));
  const field = selected.project.graph.fields[metricKey] && isVisibleMetric(metricKey) ? metricKey : visibleFields[0]?.[0] || selected.project.graph.primary_field;
  const metric = selected.project.graph.fields[field];
  const numeric = metric.data_type === "number";
  const limit = windowSize === "all" ? selected.readings.length : Number(windowSize);
  const rows = selected.readings.slice(-limit).map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const transitions = rows.filter((row, index, all) => index === 0 || row.value !== all[index - 1].value);
  const allDevices = states.flatMap((state) => state.devices);
  const reporting = allDevices.filter((device) => device.reporting).length;
  const pending = states.flatMap((state) => state.actions).filter((action) => action.status === "requested").length;
  const chartConfig = { value: { label: metric.label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <section className="grid gap-4 mb-2 min-[1180px]:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)] md:mb-4.5">
      <Card className="min-w-0 gap-4">
        <CardHeader className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>Telemetry history</CardTitle>
            <CardDescription>Stored observations only; missing samples remain gaps.</CardDescription>
          </div>
          <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-2">
            <FormField id="analytics-project" label="Project"><OptionSelect id="analytics-project" value={selected.project.id} onValueChange={(value) => { setProjectId(value); setMetricKey(""); }} options={states.map((state) => ({ value: state.project.id, label: state.project.name }))} className="sm:w-44" /></FormField>
            <FormField id="analytics-metric" label="Metric"><OptionSelect id="analytics-metric" value={field} onValueChange={setMetricKey} options={visibleFields.map(([key, item]) => ({ value: key, label: item.label }))} className="sm:w-40" /></FormField>
            <FormField id="analytics-window" label="Window"><OptionSelect id="analytics-window" value={windowSize} onValueChange={setWindowSize} options={[{ value: "30", label: "Latest 30" }, { value: "90", label: "Latest 90" }, { value: "all", label: "All stored" }]} className="sm:w-32" /></FormField>
          </div>
        </CardHeader>
        <div className="px-6">
          {numeric && rows.length ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-[290px] w-full">
              <LineChart data={rows} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="received" tickFormatter={(value) => time(Number(value))} minTickGap={40} tickLine={false} axisLine={false} />
                <YAxis width={48} unit={metric.unit} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => time(Number(payload?.[0]?.payload?.received))} formatter={(value) => <><span className="text-muted-foreground">{metric.label}</span><span className="ml-auto font-mono font-medium text-foreground tabular-nums">{display(value)} {metric.unit}</span></>} />} />
                <Line dataKey="value" stroke="var(--color-value)" isAnimationActive={false} strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ChartContainer>
          ) : rows.length ? (
            <div className="min-h-[290px] space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[["Current state", metricValue(rows.at(-1)?.value, metric.precision)], ["State changes", Math.max(0, transitions.length - 1)], ["Samples in view", rows.length]].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-muted p-3"><span className="block text-xs text-muted-foreground">{label}</span><strong className="text-lg font-semibold">{value}</strong></div>
                ))}
              </div>
              <div className="flex h-6 gap-px overflow-hidden rounded-md" aria-label={`${metric.label} state history`}>
                {rows.map((row, index) => <i key={`${row.received}-${index}`} className={cn("flex-1", row.value === true ? "bg-success" : row.value === false ? "bg-muted" : "bg-info")} title={`${time(row.received)} · ${metricValue(row.value, metric.precision)}`} />)}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>{time(rows[0].received)}</span><span>{time(rows.at(-1)?.received)}</span></div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Recent changes</h3>
                {transitions.slice().reverse().slice(0, 5).map((row, index) => <div key={`${row.received}-${index}`} className="flex justify-between border-b py-1.5 text-sm last:border-b-0"><span className="text-muted-foreground">{time(row.received)}</span><strong className="font-medium">{metricValue(row.value, metric.precision)}</strong></div>)}
              </div>
            </div>
          ) : (
            <EmptyState className="h-[290px] justify-center border-0" icon={<Activity />} title="No readings yet"><p>The visualization appears after the selected project reports telemetry.</p></EmptyState>
          )}
        </div>
      </Card>
      <Card className="gap-4">
        <CardHeader><CardTitle>Operational status</CardTitle><CardDescription>Across configured projects.</CardDescription></CardHeader>
        <div className="px-6">
          <div className="grid border-b pt-2 pb-5"><strong className="font-heading text-[42px] leading-none font-semibold tabular-nums">{reporting}/{allDevices.length}</strong><span className="mt-2 text-[13px] text-muted-foreground">devices reporting</span></div>
          <div className="mt-2 mb-[22px] grid text-[13px] [&>div]:min-h-[42px] [&>div]:border-b">
            {[["Reporting", reporting, "bg-success"], ["Unavailable", allDevices.length - reporting, "bg-muted-foreground"], ["Pending actions", pending, "bg-warning"]].map(([label, value, dot]) => (
              <div key={String(label)} className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><i className={cn("size-2 rounded-full", String(dot))} />{label}</span><b className="font-semibold">{value}</b></div>
            ))}
          </div>
          <Button asChild variant="outline" className="w-full"><Link to="/events">Review operational events<ArrowRight /></Link></Button>
        </div>
      </Card>
    </section>
  );
}
