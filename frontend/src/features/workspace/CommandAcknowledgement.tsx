import { Link2 } from "lucide-react";
import { CompactId } from "@/components/CopyId";
import { StatusBadge } from "@/components/StatusBadge";
import { humanAction, sessionLabel } from "@/lib/format";
import type { State } from "@/types";
import { time } from "@/types";
import { commandAcknowledgementModel } from "./commandAcknowledgementModel";

export { isCommandAcknowledgement } from "./commandAcknowledgementModel";

export function CommandAcknowledgementCard({ state, field, embedded = false }: { state: State; field: string; embedded?: boolean }) {
  const metric = state.project.graph.fields[field];
  const { latest, commandId, action, fresh } = commandAcknowledgementModel(state, field);
  return <article className={embedded ? "min-w-0" : "min-w-0 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"} aria-label={`${metric.label} reading`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold">{metric.label}</h4>
        <p className="mt-1 text-xs text-muted-foreground">Command evidence</p>
      </div>
      <StatusBadge tone={fresh ? "success" : latest ? "warning" : "neutral"}>{fresh ? state.session.mode === "live" ? "Live" : "Fresh" : latest ? "Stale" : "Awaiting telemetry"}</StatusBadge>
    </header>
    <div className="my-5 flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Link2 className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Last device-acknowledged request</p>
        <div className="mt-1.5">{commandId ? <CompactId value={commandId} /> : <strong className="text-sm font-medium">No acknowledgement reported</strong>}</div>
        <p className="mt-1 text-xs text-muted-foreground" title={latest ? new Date(latest.received * 1000).toLocaleString() : undefined}>{latest ? `${fresh ? "Received" : "Last known"} ${time(latest.received)}` : "Awaiting a report in this session"}</p>
      </div>
    </div>
    {action ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y py-3">
      <div><p className="text-[11px] text-muted-foreground">Matching request</p><p className="mt-1 text-sm font-medium">{humanAction(action.action)}</p></div>
      <StatusBadge tone={action.status === "completed" ? "success" : action.status === "requested" ? "warning" : "neutral"}>{action.status.replaceAll("_", " ")}</StatusBadge>
    </div> : commandId ? <p className="mb-4 text-xs text-muted-foreground">This ID is not in the selected session&apos;s recent requests.</p> : null}
    <p className="text-xs leading-relaxed text-muted-foreground">The device reports this ID after its firmware applies a command. Agentwin completes the request only when telemetry also matches the expected state.</p>
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">This confirms reported state, not independently verified physical behavior.</p>
    <footer className="mt-5 flex flex-wrap justify-between gap-2 border-t pt-3 text-[10px] text-muted-foreground"><span>{sessionLabel(state.session.mode)} session</span><span>Command metadata</span></footer>
  </article>;
}
