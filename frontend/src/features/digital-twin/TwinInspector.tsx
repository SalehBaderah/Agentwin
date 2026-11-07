import { useState } from "react";
import { metricValue } from "@/lib/format";
import { ReadingCard } from "@/features/workspace/Readings";
import { Link } from "react-router-dom";
import { Activity, Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Project, State } from "../../types";
import { api, display, time } from "../../types";
import type { TwinComponentState } from "./model/twin.types";

const age = (value?: number) => value === undefined ? "Unavailable" : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;

function controlReady(state: State, project: Project, field: string) {
  if (state.session.mode !== "live") return false;
  const deviceId = project.graph.fields[field]?.device_id;
  const device = state.devices.find((item) => item.id === deviceId);
  return Boolean(device && (device.connector === "usb" ? device.online : device.reporting));
}

function Section({ title, defaultOpen = false, className, children }: { title: string; defaultOpen?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-b">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-[18px] py-[13px] text-[11px] font-[750] text-foreground hover:text-foreground">
        {title}
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-[var(--duration-quick)] group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("px-[18px] pb-[15px]", className)}>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Relation({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[46px] items-start justify-between gap-2.5 border-t py-2 text-[13px] first:border-t-0">
      <span className="text-subtle-foreground">{label}</span>
      <strong className="max-w-[55%] text-right font-medium text-foreground tabular-nums [overflow-wrap:anywhere]">{children}</strong>
    </div>
  );
}

const actionTone: Record<string, string> = { completed: "bg-success-subtle text-success", requested: "bg-warning-subtle text-warning", failed: "bg-danger-subtle text-danger" };

export function TwinInspector({ component, state, refresh, open, onClose }: { component: TwinComponentState; state: State; refresh: () => void; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const relations = state.project.graph.edges.filter((edge) => edge.source === component.id || edge.target === component.id);
  const run = async (action: string, value: boolean) => {
    setBusy(true); setError("");
    try {
      await api(`/projects/${state.project.id}/sessions/${state.session.id}/actions`, { component_id: component.id, action, value });
      refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <aside className="live-twin-inspector animate-in fade-in slide-in-from-bottom-[18px] duration-[var(--duration-fast)]" data-open={open ? "true" : "false"} aria-label="Selected component details">
    <Button type="button" variant="outline" size="icon" className="absolute top-3 right-3 z-[2] size-8 rounded-[7px] border-border bg-surface-elevated text-muted-foreground dark:border-border dark:bg-surface-elevated [&_svg:not([class*='size-'])]:size-[17px]" onClick={onClose} aria-label="Close component inspector"><X /></Button>
    <header className="border-b pt-[19px] pr-12 pb-[17px] pl-[18px] text-base leading-6">
      <span className="text-[11px] text-brand capitalize">{component.type}</span>
      <h3 className="my-[5px] text-base leading-normal font-bold">{component.label}</h3>
      <p className="text-xs leading-normal text-muted-foreground">{component.source.description || "Configured component."}</p>
    </header>
    <Section title="State" defaultOpen>
      {component.observed.metrics.length ? component.observed.metrics.map((metric) => <div key={metric.key} className="flex justify-between gap-3 border-t py-[9px] text-xs leading-normal first:border-t-0"><span className="text-subtle-foreground">{metric.label}<small className="mt-[3px] block text-[10px] font-normal text-muted-foreground">{metric.key} · {metric.source}</small></span><strong className="text-right font-bold text-foreground tabular-nums">{metricValue(metric.value, metric.precision)} {metric.value !== null && metric.value !== undefined ? metric.unit : ""}<small className="mt-[3px] block text-[10px] font-normal text-muted-foreground">{metric.isLastKnown ? "Last known · " : ""}{metric.freshness} · {age(metric.ageMs)}</small></strong></div>) : <p className="text-[13px] text-muted-foreground">Configured component with no bound live readings.</p>}
      {component.deviceId && <Relation label="Device">{component.deviceId}</Relation>}
      {component.pin && <Relation label="Pin">{component.pin}</Relation>}
      {component.transport && <Relation label="Transport">{component.transport.toUpperCase()}</Relation>}
      {component.health.transportAvailable !== undefined && <Relation label="Gateway availability">{component.health.transportAvailable ? "Connected" : "Unavailable"}</Relation>}
      {component.observed.bootId && <Relation label="Boot session">{component.observed.bootId}</Relation>}
      {component.observed.sequence !== undefined && <Relation label="Sequence">#{component.observed.sequence}</Relation>}
      {component.observed.receivedAt && <Relation label="Last received">{time(component.observed.receivedAt)}</Relation>}
      <Relation label="Freshness">{component.health.freshness} · {age(component.health.ageMs)}</Relation>
    </Section>
    <Section title="Reading history">{component.observed.metrics.map(metric => <ReadingCard key={`${state.session.id}:${metric.key}`} state={state} field={metric.key} embedded />)}</Section>
    <Section title="Evidence" defaultOpen className="grid gap-2.5 [&>p]:grid [&>p]:text-xs [&>p]:leading-[1.65] [&>p]:grid-cols-[16px_1fr] [&>p]:gap-2 [&_p>span]:text-muted-foreground [&_p_strong]:mb-0.5 [&_p_strong]:block [&_p_strong]:text-foreground">
      <p className="text-success"><Check className="size-3.5" /><span><strong>Configured</strong>{component.pin ? `${component.label} bound to ${component.pin}.` : `${component.label} exists in project configuration.`}</span></p>
      <p className={component.evidence.level === "reported" ? "text-success" : "text-muted-foreground"}>{component.evidence.level === "reported" ? <Check className="size-3.5" /> : <span aria-hidden="true">—</span>}<span><strong>Reported</strong>{component.evidence.level === "reported" ? `Firmware telemetry received ${age(component.health.ageMs)} ago.` : "No telemetry observed in this session."}</span></p>
      <p className="text-muted-foreground"><span aria-hidden="true">—</span><span><strong>Physical verification</strong>Not independently verified.</span></p>
    </Section>
    {relations.length > 0 && <Section title="Relationships">{relations.map((edge) => <Relation key={edge.id} label={edge.label}>{edge.source === component.id ? state.project.graph.components.find((item) => item.id === edge.target)?.name : state.project.graph.components.find((item) => item.id === edge.source)?.name}</Relation>)}</Section>}
    {Object.keys(component.configured.values).length > 0 && <Section title="Configuration">{Object.entries(component.configured.values).map(([key, value]) => <Relation key={key} label={key.replaceAll("_", " ")}>{display(value)}</Relation>)}</Section>}
    {(component.events.length > 0 || component.source.controls?.length || component.actions.length > 0) && <Section title="Events & actions" defaultOpen>
      {component.events.filter((event) => !event.recovered).map((event) => <div key={event.id} className="flex gap-2 rounded-lg border border-warning-border bg-warning-subtle p-2.5 text-[11px] text-warning"><Activity className="size-3.5 shrink-0" /><span><strong className="block text-foreground capitalize">{event.kind.replaceAll("_", " ")}</strong>{event.evidence.cause}<Link className="mt-2 block underline" to="/events">View operational events</Link></span></div>)}
      {component.source.controls?.map((control) => {
        const ready = controlReady(state, state.project, control.expected.field);
        return <div key={control.action}>
          <div className="my-2.5 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="lg" className="h-[42px] border-border font-normal" disabled={busy || !ready} onClick={() => run(control.action, true)}>Turn on</Button>
            <Button type="button" variant="secondary" size="lg" className="h-[42px] border-border font-normal" disabled={busy || !ready} onClick={() => run(control.action, false)}>Turn off</Button>
          </div>
          {!ready && <p className="text-[13px] text-muted-foreground">Controls require the configured live transport.</p>}
        </div>;
      })}
      {component.actions.slice(0, 4).map((action) => <div key={action.id} className="flex min-h-[46px] items-start justify-between gap-2.5 border-t py-2 text-[13px] first:border-t-0"><span className="text-subtle-foreground">{action.action.replaceAll("_", " ")}<small className="mt-[3px] block text-[10px] text-muted-foreground">{time(action.created)}</small></span><strong className={cn("inline-flex w-fit items-center rounded-full px-2 py-[5px] text-[13px] font-bold whitespace-nowrap capitalize", actionTone[action.status] ?? "bg-accent text-subtle-foreground")}>{action.status.replaceAll("_", " ")}</strong></div>)}
      {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
    </Section>}
    <p className="px-[18px] py-[15px] text-xs leading-normal text-muted-foreground">{state.session.mode} source. Reported firmware state is not proof of a physical effect.</p>
  </aside>;
}
