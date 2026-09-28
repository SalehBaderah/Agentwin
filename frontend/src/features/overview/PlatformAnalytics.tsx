import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { isVisibleMetric } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { State } from "@/types";
import { ReadingCard } from "@/features/workspace/Readings";

export function PlatformAnalytics({ states }: { states: State[] }) {
  const [projectId, setProjectId] = useState(states[0]?.project.id || "");
  const [metricKey, setMetricKey] = useState("");
  const [windowSize, setWindowSize] = useState("30");
  const selected = states.find((state) => state.project.id === projectId) || states[0];
  if (!selected) return null;
  const visibleFields = Object.entries(selected.project.graph.fields).filter(([key]) => isVisibleMetric(key));
  const field = selected.project.graph.fields[metricKey] && isVisibleMetric(metricKey) ? metricKey : visibleFields[0]?.[0] || selected.project.graph.primary_field;
  const limit = windowSize === "all" ? selected.readings.length : Number(windowSize);
  const historyState = { ...selected, readings: selected.readings.slice(-limit) };
  const allDevices = states.flatMap((state) => state.devices);
  const reporting = allDevices.filter((device) => device.reporting).length;
  const pending = states.flatMap((state) => state.actions).filter((action) => action.status === "requested").length;
  return (
    <section className="grid gap-4 mb-2 min-[1180px]:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)] md:mb-4.5">
      <Card className="min-w-0 gap-4">
        <CardHeader className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>Telemetry history</CardTitle>
            <CardDescription>Stored observations only; missing samples remain gaps.</CardDescription>
          </div>
          <div className="grid w-full gap-3 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-2">
            <FormField id="analytics-project" label="Project"><OptionSelect size="sm" id="analytics-project" value={selected.project.id} onValueChange={(value) => { setProjectId(value); setMetricKey(""); }} options={states.map((state) => ({ value: state.project.id, label: state.project.name }))} className="sm:w-44" /></FormField>
            <FormField id="analytics-metric" label="Metric"><OptionSelect size="sm" id="analytics-metric" value={field} onValueChange={setMetricKey} options={visibleFields.map(([key, item]) => ({ value: key, label: item.label }))} className="sm:w-40" /></FormField>
            <FormField id="analytics-window" label="Window"><OptionSelect size="sm" id="analytics-window" value={windowSize} onValueChange={setWindowSize} options={[{ value: "30", label: "Latest 30" }, { value: "90", label: "Latest 90" }, { value: "all", label: "All stored" }]} className="sm:w-32" /></FormField>
          </div>
        </CardHeader>
        <div className="px-6">
          <ReadingCard key={`${selected.project.id}:${selected.session.id}:${field}:${windowSize}`} state={historyState} field={field} embedded />
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
