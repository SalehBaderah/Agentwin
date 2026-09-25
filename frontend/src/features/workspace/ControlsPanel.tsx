import { useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { controlReady, metricValue } from "@/lib/format";
import type { Component, State } from "@/types";
import { api } from "@/types";

export function ControlsPanel({ state, refresh }: { state: State; refresh: () => void }) {
  const [message, setMessage] = useState("");
  const controls = state.project.graph.components.flatMap((component) => (component.controls || []).map((control) => ({ component, control })));
  const run = async (component: Component, action: string, value: boolean) => {
    try {
      const result = await api<{ id: string; status: string }>(`/projects/${state.project.id}/sessions/${state.session.id}/actions`, { component_id: component.id, action, value });
      setMessage(`Action ${result.id.slice(0, 8)} is ${result.status}. It completes only after matching telemetry.`);
      refresh();
    } catch (error) { setMessage((error as Error).message); }
  };
  return (
    <div className="grid gap-4">
      <div><h3 className="mb-2 pb-[5px] text-[17px] font-bold tracking-[-0.3px]">Hardware controls</h3><p className="text-[13px] leading-[1.65] text-muted-foreground">Commands remain pending until the target device reports the expected state.</p></div>
      {controls.length ? controls.map(({ component, control }) => {
        const latestAction = state.actions.find((action) => action.target === component.id);
        const ready = controlReady(state, state.project, control);
        const pending = latestAction?.status === "requested";
        return (
          <Card key={`${component.id}-${control.action}`} className="control-card gap-0 rounded-[14px] p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h4 className="pb-1 text-[15px] font-bold">{component.name}</h4><p className="text-[13px] text-muted-foreground">{control.label}</p></div>
              <StatusBadge tone={latestAction?.status === "completed" ? "success" : pending ? "warning" : "neutral"}>{latestAction?.status?.replace("_", " ") || "ready"}</StatusBadge>
            </div>
            <div className="control-state my-[18px] grid border-y sm:grid-cols-3 sm:divide-x max-sm:divide-y">
              {[["Reported state", metricValue(state.latest?.readings[control.expected.field], 0)], ["Verification field", control.expected.field], ["Last request", latestAction ? latestAction.action.replace(":", " ") : "None"]].map(([label, value]) => (
                <span key={label} className="grid gap-1.5 px-2.5 py-3.5 text-[13px] text-muted-foreground">{label}<strong className="block text-sm font-semibold text-foreground">{value}</strong></span>
              ))}
            </div>
            <div className="flex gap-2.5 *:flex-1">
              <Button size="lg" disabled={!ready || pending} onClick={() => run(component, control.action, true)}>Turn on</Button>
              <Button size="lg" variant="secondary" disabled={!ready || pending} onClick={() => run(component, control.action, false)}>Turn off</Button>
            </div>
            {pending && <p className="mt-3 flex items-center gap-2 text-[13px] text-warning"><Activity className="size-3.5" />Waiting for matching device telemetry. The reported state has not been confirmed yet.</p>}
            {!ready && <p className="mt-3 text-[13px] text-muted-foreground">Connect the configured live transport before controlling this component.</p>}
          </Card>
        );
      }) : <EmptyState icon={<ShieldCheck />} title="No hardware controls configured"><p>This project is read-only until a device capability and verification contract are registered.</p></EmptyState>}
      <p role="status" className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
