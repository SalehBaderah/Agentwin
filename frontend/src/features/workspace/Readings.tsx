import { useState } from "react";
import { Activity } from "lucide-react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { metricValue } from "@/lib/format";
import type { State } from "@/types";
import { time } from "@/types";

export function Readings({ state }: { state: State }) {
  const [field, setField] = useState(state.project.graph.primary_field);
  const [transitionLimit, setTransitionLimit] = useState(5);
  const metric = state.project.graph.fields[field];
  const rows = state.readings.map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const transitions = state.readings.filter((reading, index, all) => index === 0 || reading.readings[field] !== all[index - 1].readings[field]).reverse();
  const chartConfig = { value: { label: metric.label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h3 className="mb-2 pb-2 text-[13px] font-bold">Readings</h3><p className="text-[13px] leading-[1.65] text-muted-foreground">{metric.data_type === "number" ? "Stored observations for this project and selected session." : "State changes only; repeated samples with the same value are collapsed."}</p></div>
        <FormField id="readings-metric" label="Metric"><OptionSelect id="readings-metric" value={field} onValueChange={(value) => { setField(value); setTransitionLimit(5); }} className="sm:w-56" options={Object.entries(state.project.graph.fields).map(([key, item]) => ({ value: key, label: `${item.label} ${item.unit}` }))} /></FormField>
      </div>
      {!rows.length ? (
        <EmptyState className="h-[290px] justify-center border-0" icon={<Activity />} title="No readings in this session"><p>Readings appear here when the selected source reports telemetry. Stored values from other sessions remain separate.</p></EmptyState>
      ) : metric.data_type === "number" ? (
        <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
          <LineChart data={rows}>
            <XAxis dataKey="received" tickFormatter={(value) => time(Number(value))} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tickLine={false} axisLine={false} width={48} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => time(Number(payload?.[0]?.payload?.received))} />} />
            <Line dataKey="value" stroke="var(--color-value)" isAnimationActive={false} dot={false} connectNulls={false} strokeWidth={2} />
          </LineChart>
        </ChartContainer>
      ) : (
        <>
          <div className="transition-list divide-y rounded-lg border">
            {transitions.slice(0, transitionLimit).map((reading) => <div key={reading.id} className="flex justify-between px-4 py-2.5 text-sm"><span className="text-muted-foreground">{time(reading.received)}</span><strong className="font-medium">{metricValue(reading.readings[field], metric.precision)}</strong></div>)}
          </div>
          {transitions.length > 5 && <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setTransitionLimit(transitionLimit >= transitions.length ? 5 : Math.min(transitionLimit + 10, transitions.length))}>{transitionLimit >= transitions.length ? "Show less" : `Show more (${transitions.length - transitionLimit})`}</Button>}
        </>
      )}
    </div>
  );
}
