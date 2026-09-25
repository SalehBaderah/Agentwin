import { useState } from "react";
import { Bell, Check, ShieldCheck, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeading } from "@/components/SectionHeading";
import { StatusBadge } from "@/components/StatusBadge";
import { emailStatus, summaryTime } from "@/lib/format";
import type { Event as ProjectEvent, State } from "@/types";
import { api, display, time } from "@/types";

const statusLabel = (event: ProjectEvent) => (event.recovered ? (event.evidence.close_reason ? "Closed" : "Recovered") : "Open");

export function Events({ state, refresh }: { state: State; refresh: () => void }) {
  const [selected, setSelected] = useState<ProjectEvent | null>(null), [error, setError] = useState("");
  const acknowledge = async (e: ProjectEvent) => {
    try {
      await api(`/projects/${state.project.id}/sessions/${state.session.id}/events/${e.id}/acknowledge`, {});
      refresh();
      setSelected({ ...e, acknowledged: Date.now() / 1000 });
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <div className="grid gap-4">
      <div><h3 className="pb-2 text-[13px] font-bold">Events & history</h3><p className="text-[13px] text-muted-foreground">Actual triggers, supporting readings, and recovery.</p></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {state.events.length ? state.events.map((e) => (
        <Card key={e.id} className="event-item gap-0 py-0">
          <button type="button" onClick={() => setSelected(e)} className="flex w-full items-center gap-3 rounded-t-xl px-4 py-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Bell className="size-4 text-warning" />
            <span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{e.kind === "missing_telemetry" ? "Device silent" : "Threshold breached"}</strong><small className="text-xs text-muted-foreground">{e.evidence.rule} · {time(e.created)}</small></span>
            <StatusBadge tone={e.recovered ? "success" : "warning"}>{statusLabel(e)}</StatusBadge>
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span>{e.recovered ? (e.evidence.close_reason ? "Closed " : "Recovery ") + time(e.recovered) : "Cause unknown"} · Email {emailStatus(e.email_status, state.project.monitoring.alert_email_enabled)}</span>
            <Button size="sm" variant="outline" disabled={!!e.acknowledged} onClick={() => acknowledge(e)}>{e.acknowledged ? <><Check />Acknowledged</> : "Acknowledge event"}</Button>
          </div>
        </Card>
      )) : <EmptyState className="border-0" icon={<ShieldCheck />} title="No events in this session"><p>Configured rules will record missing telemetry and sustained high readings.</p></EmptyState>}
      <section className="grid gap-3 border-t pt-8" aria-label="Scheduled live summaries">
        <SectionHeading level={3} title="Scheduled live summaries" aside="Informational, not open alerts" />
        {state.summaries?.length ? state.summaries.map((summary) => (
          <Card key={summary.id} className="gap-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-sm font-medium">{summaryTime(summary.period_end)}</strong><small className="text-xs text-muted-foreground">{Math.round((summary.period_end - summary.period_start) / 60)}-minute live window · {summary.source === "local_model" ? "AI-assisted" : "Evidence summary"}</small></div>
            <p className="text-sm">{summary.body}</p>
            <small className="text-xs text-muted-foreground">Email {emailStatus(summary.email_status, state.project.monitoring.summary_email_enabled)}</small>
          </Card>
        )) : <p className="text-sm text-muted-foreground">No scheduled live summaries yet.</p>}
      </section>
      {selected && (
        <Card className="gap-4 border-brand-border p-5 animate-in fade-in slide-in-from-bottom-2 duration-[var(--duration-fast)]">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Event evidence</h3><Button variant="ghost" size="icon" aria-label="Close evidence" onClick={() => setSelected(null)}><X /></Button></div>
          <div className="flex items-center gap-2 text-sm"><StatusBadge tone={selected.recovered ? "success" : "warning"}>{statusLabel(selected)}</StatusBadge><span className="text-muted-foreground">{selected.acknowledged ? "Acknowledged" : "Not acknowledged"}</span></div>
          <h4 className="font-medium">{selected.evidence.rule}</h4>
          <p className="text-sm text-muted-foreground">{selected.evidence.close_reason || (selected.kind === "missing_telemetry" ? "Telemetry stopped after this device had reported. The physical or network cause is not established." : "Two recent readings crossed the configured limit. The physical cause is not established.")}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["Detected", time(selected.created)], ["Recovered", selected.recovered ? time(selected.recovered) : "Not yet"], ["Duration", selected.recovered ? `${Math.max(1, Math.round(selected.recovered - selected.created))} seconds` : "Ongoing"], ["Source", selected.evidence.source_mode]].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted px-3 py-2"><span className="block text-xs text-muted-foreground">{label}</span><strong className="text-sm font-medium">{value}</strong></div>
            ))}
          </div>
          <small className="text-xs text-muted-foreground">Event {selected.id} · {selected.evidence.source_mode}</small>
          {selected.evidence.readings.map((r) => (
            <div key={r.id} className="rounded-lg border px-3 py-2 text-sm"><strong className="block font-medium">Reading #{r.id} · {time(r.received)}</strong><span className="text-muted-foreground">{Object.entries(r.readings).map(([k, v]) => `${k}: ${display(v)}`).join(" · ")}</span></div>
          ))}
        </Card>
      )}
    </div>
  );
}
