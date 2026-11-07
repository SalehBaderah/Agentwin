import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronDown, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompactId } from "@/components/CopyId";
import { StatusBadge } from "@/components/StatusBadge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { controlReady, metricValue } from "@/lib/format";
import type { ControlProposal, State } from "@/types";
import { api } from "@/types";

export function ControlProposals({ state, latest, hiddenIds, refresh }: { state: State; latest?: ControlProposal; hiddenIds?: ReadonlySet<string>; refresh?: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const root = useRef<HTMLElement>(null);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [, setClock] = useState(0);
  const receivedClock = useMemo(() => ({ server: state.server_time, local: performance.now() }), [state.server_time]);
  const now = Number.isFinite(receivedClock.server) ? receivedClock.server + (performance.now() - receivedClock.local) / 1000 : Date.now() / 1000;
  useEffect(() => {
    const timer = window.setInterval(() => setClock(clock => clock + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const section = root.current;
    const viewport = section?.closest<HTMLElement>("[data-slot=scroll-area-viewport]");
    if (!latest || !section || !viewport) return;
    viewport.scrollTo({ top: viewport.scrollTop + section.getBoundingClientRect().top - viewport.getBoundingClientRect().top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [latest?.id]);
  const proposals = state.actions.filter(action => action.proposal && !hiddenIds?.has(action.id)).map(action => ({ ...action.proposal!, status: action.status }));
  if (latest && !hiddenIds?.has(latest.id)) {
    const index = proposals.findIndex(proposal => proposal.id === latest.id);
    // Reused drafts keep the snapshot's current status and remain the focused reply.
    proposals.unshift(index < 0 ? latest : proposals.splice(index, 1)[0]);
  }
  if (!proposals.length) return null;
  const handle = async (proposal: ControlProposal, operation: "confirm" | "cancel") => {
    if (busyId) return;
    setBusyId(proposal.id); setError("");
    try {
      const result = await api<{ status: string }>(`/projects/${state.project.id}/sessions/${state.session.id}/actions/${proposal.id}/${operation}`, {});
      if (mounted.current) setUpdates(previous => ({ ...previous, [proposal.id]: result.status }));
    } catch (failure) { if (mounted.current) setError((failure as Error).message); }
    finally { if (mounted.current) { setBusyId(null); refresh?.(); } }
  };
  const commandCard = (proposal: ControlProposal) => {
      const component = state.project.graph.components.find(item => item.id === proposal.component_id);
      const control = component?.controls?.find(item => item.action === proposal.action);
      const snapshotStatus = proposal.status === "awaiting_confirmation" ? updates[proposal.id] || proposal.status : proposal.status;
      const status = snapshotStatus === "awaiting_confirmation" && proposal.expires_at <= now ? "expired" : snapshotStatus;
      const pending = state.actions.some(action => action.target === proposal.component_id && action.status === "requested");
      const ready = !!control && controlReady(state, state.project, control) && !pending;
      const observed = control && [...state.readings].reverse().find(reading => reading.device === proposal.device_id && Object.hasOwn(reading.readings, control.expected.field));
      const fresh = control && state.field_status[control.expected.field]?.fresh;
      return <Collapsible key={proposal.id} className="rounded-lg border border-brand-border bg-brand-subtle p-2.5" aria-label={`${proposal.label} device command`}>
        <div className="flex items-center gap-2">
          <Power className="size-3.5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1"><strong className="block break-words text-xs font-semibold">{proposal.control_label || proposal.action.replaceAll("_", " ")}: {metricValue(proposal.value, 3)}</strong><small className="block truncate text-[11px] text-muted-foreground" title={proposal.label}>{proposal.label}</small></div>
          <StatusBadge className="shrink-0 text-[10px]" tone={status === "completed" ? "success" : ["awaiting_confirmation", "requested"].includes(status) ? "warning" : "neutral"}>{status === "awaiting_confirmation" ? "Draft" : status === "requested" ? "Awaiting device" : status.replaceAll("_", " ")}</StatusBadge>
          <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="icon" className="group size-7 shrink-0" aria-label={`Command details for ${proposal.label}`} title="Command details"><ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2.5 grid gap-2 border-t pt-2.5">
        <dl className="grid gap-1 text-xs"><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Device</dt><dd className="break-all font-medium">{proposal.device_id}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Component</dt><dd className="break-all font-medium">{proposal.component_id}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{fresh ? "Reported state" : "Last known state"}</dt><dd>{metricValue(observed && control ? observed.readings[control.expected.field] : undefined, 0)}</dd></div></dl>
        <CompactId value={proposal.id} />
        {status === "requested" && <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Activity className="mt-0.5 size-3.5 shrink-0" />Command sent. Waiting for the expected state and matching command ID; reported values remain unchanged until telemetry arrives.</p>}
        {status === "completed" && <p className="text-xs leading-relaxed text-muted-foreground">Matching device telemetry confirmed the request. Physical behavior is not independently verified.</p>}
        {["timed_out", "failed", "expired", "invalidated"].includes(status) && <p className="text-xs text-muted-foreground">{status === "timed_out" ? "Matching telemetry did not arrive within the command timeout." : status === "failed" ? "The command could not be sent." : "This proposal cannot be sent."} Review the device and ask Win for a new proposal.</p>}
        {status === "cancelled" && <p className="text-xs text-muted-foreground">Cancelled before dispatch. No command was sent.</p>}
        </CollapsibleContent>
        {status === "awaiting_confirmation" && <div className="mt-2.5 grid gap-2 border-t pt-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">Nothing has been sent. Confirming sends this command to the configured Live device.</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!ready || !!busyId || state.session.mode !== "live"} onClick={() => void handle(proposal, "confirm")}>{busyId === proposal.id ? "Working…" : "Confirm & send"}</Button><Button size="sm" variant="outline" disabled={!!busyId} onClick={() => void handle(proposal, "cancel")}>Cancel proposal</Button></div>
          <p className="text-[11px] text-muted-foreground">Expires in {Math.max(0, Math.ceil(proposal.expires_at - now))}s.{!ready ? " Connect the Live device and wait for pending commands." : ""}</p>
        </div>}
      </Collapsible>;
  };
  return <section ref={root} className="grid gap-2" aria-label="Win device commands" aria-live="polite">
    {commandCard(proposals[0])}
    {proposals.length > 1 && <Collapsible className="grid gap-2">
      <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="group h-7 justify-start gap-1.5 px-1 text-xs text-muted-foreground"><ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />Earlier commands ({proposals.length - 1})</Button></CollapsibleTrigger>
      <CollapsibleContent className="grid gap-2">{proposals.slice(1).map(commandCard)}</CollapsibleContent>
    </Collapsible>}
    {error && <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle p-2 text-xs text-destructive">{error}</p>}
  </section>;
}
