import { Activity } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CompactId } from "@/components/CopyId";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import { humanAction } from "@/lib/format";
import type { State } from "@/types";
import { display, time } from "@/types";
import { ReadingCard } from "./Readings";
import { isCommandAcknowledgement } from "./CommandAcknowledgement";

export function ProjectOverview({ state }: { state: State }) {
  const p = state.project;
  const fields = Object.entries(p.graph.fields);
  const stateFields = fields.filter(([key, field]) => field.data_type !== "number" && !isCommandAcknowledgement(state, key));
  const commandFields = fields.filter(([key]) => isCommandAcknowledgement(state, key));
  return (
    <div className="grid gap-4">
      {fields.some(([, field]) => field.data_type === "number") && <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-4">
        {fields.filter(([, field]) => field.data_type === "number").map(([key, field]) => <Stat key={key} label={field.label} value={<>{display(state.latest?.readings[key])}<em>{field.unit}</em></>} hint={state.field_status[key]?.received ? `${state.field_status[key].fresh ? "Received" : "Last known"} ${time(state.field_status[key].received)}` : "No reported value"} icon={<Activity />} />)}
      </div>}
      {stateFields.length > 0 && <section aria-label="State readings" className="grid gap-4">
        <div><h3 className="text-base font-semibold">State readings</h3><p className="mt-1 text-[13px] text-muted-foreground">History from the selected session, with reporting gaps preserved.</p></div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
          {stateFields.map(([key]) => <ReadingCard key={`${state.session.id}:${key}`} state={state} field={key} />)}
        </div>
      </section>}
      {commandFields.map(([key]) => <ReadingCard key={`${state.session.id}:${key}`} state={state} field={key} />)}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card className="min-h-64 gap-0 rounded-[14px] p-[18px]">
          <CardHeader className="flex items-center justify-between gap-3 px-0 pb-2.5"><CardTitle><h3 className="mb-2 text-sm font-bold">Devices</h3></CardTitle><span className="text-xs text-muted-foreground">{state.devices.filter((device) => device.reporting).length}/{state.devices.length} reporting</span></CardHeader>
          {state.devices.map((device) => (
            <div key={device.id} className="flex items-center justify-between gap-3.5 border-t py-2.5">
              <div><strong className="block text-sm font-medium">{device.id}</strong><small className="text-xs text-muted-foreground">{device.connector.toUpperCase()} connector</small></div>
              <StatusBadge tone={device.reporting ? "success" : device.online ? "warning" : "neutral"}>{device.reporting ? "Reporting" : device.online ? "Connected" : "Unavailable"}</StatusBadge>
            </div>
          ))}
        </Card>
        <Card className="min-h-64 gap-0 rounded-[14px] p-[18px]">
          <CardHeader className="flex items-center justify-between gap-3 px-0 pb-2.5"><CardTitle><h3 className="mb-2 text-sm font-bold">Recent actions</h3></CardTitle><span className="text-xs text-muted-foreground">Latest {Math.min(state.actions.length, 5)}</span></CardHeader>
          {state.actions.length ? state.actions.slice(0, 5).map((action) => (
            <div key={action.id} className="flex items-center justify-between gap-3.5 border-t py-2.5">
              <div><strong className="block text-sm font-medium">{humanAction(action.action)}</strong><CompactId value={action.id} /></div>
              <StatusBadge tone={action.status === "completed" ? "success" : action.status === "requested" ? "warning" : "neutral"}>{action.status.replaceAll("_", " ")}</StatusBadge>
            </div>
          )) : <p className="text-[13px] leading-[1.65] text-muted-foreground">No commands have been requested.</p>}
        </Card>
      </div>
    </div>
  );
}
