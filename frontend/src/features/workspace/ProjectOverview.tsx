import { Activity, Power } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CompactId } from "@/components/CopyId";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import { humanAction } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { State } from "@/types";
import { display, time } from "@/types";

function presentMetric(key: string, value: unknown, unit: string) {
  if (typeof value === "boolean") return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm", value ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground")}><Power className="size-3.5" />{value ? "On" : "Off"}</span>;
  if (key.includes("command_id") && typeof value === "string") return <CompactId value={value} />;
  return <>{display(value)}<em>{unit}</em></>;
}

export function ProjectOverview({ state }: { state: State }) {
  const p = state.project;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {Object.entries(p.graph.fields).map(([key, field]) => <Stat key={key} label={field.label} value={presentMetric(key, state.latest?.readings[key], field.unit)} hint={state.field_status[key]?.received ? `Received ${time(state.field_status[key].received)}` : "No reported value"} icon={<Activity />} />)}
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card className="min-h-64 gap-0 rounded-[14px] p-[18px]">
          <CardHeader className="flex items-center justify-between gap-3 px-0 pb-2.5"><CardTitle><h3 className="text-sm font-bold">Devices</h3></CardTitle><span className="text-xs text-muted-foreground">{state.devices.filter((device) => device.reporting).length}/{state.devices.length} reporting</span></CardHeader>
          {state.devices.map((device) => (
            <div key={device.id} className="flex items-center justify-between gap-3.5 border-t py-2.5">
              <div><strong className="block text-sm font-medium">{device.id}</strong><small className="text-xs text-muted-foreground">{device.connector.toUpperCase()} connector</small></div>
              <StatusBadge tone={device.reporting ? "success" : device.online ? "warning" : "neutral"}>{device.reporting ? "Reporting" : device.online ? "Connected" : "Unavailable"}</StatusBadge>
            </div>
          ))}
        </Card>
        <Card className="min-h-64 gap-0 rounded-[14px] p-[18px]">
          <CardHeader className="flex items-center justify-between gap-3 px-0 pb-2.5"><CardTitle><h3 className="text-sm font-bold">Recent actions</h3></CardTitle><span className="text-xs text-muted-foreground">Latest {Math.min(state.actions.length, 5)}</span></CardHeader>
          {state.actions.length ? state.actions.slice(0, 5).map((action) => (
            <div key={action.id} className="flex items-center justify-between gap-3.5 border-t py-2.5">
              <div><strong className="block text-sm font-medium">{humanAction(action.action)}</strong><CompactId value={action.id} /></div>
              <StatusBadge tone={action.status === "completed" ? "success" : action.status === "requested" ? "warning" : "neutral"}>{action.status.replaceAll("_", " ")}</StatusBadge>
            </div>
          )) : <p className="text-[13px] text-muted-foreground">No commands have been requested.</p>}
        </Card>
      </div>
    </div>
  );
}
