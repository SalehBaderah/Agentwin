import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/OptionSelect";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Activity, Cable, CircleAlert, Radio } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { useTabIndicator } from "@/components/useTabIndicator";
import { cn } from "@/lib/utils";
import type { State } from "../../types";
import { time } from "../../types";
import { useTwinState } from "./hooks/useTwinState";
import { TwinInspector } from "./TwinInspector";
import "./live-twin.css";

const TopologyTwin = lazy(() => import("./topology/TopologyTwin").then((module) => ({ default: module.TopologyTwin })));
const PhysicalWorkspace = lazy(() => import("./physical/PhysicalWorkspace").then((module) => ({ default: module.PhysicalWorkspace })));
const DataFlowTwin = lazy(() => import("./view2d/DataFlowTwin").then((module) => ({ default: module.DataFlowTwin })));

type View = "physical" | "topology" | "flow";

const views: [View, string][] = [["physical", "Physical 2D"], ["topology", "Topology"], ["flow", "Data Flow"]];

function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const { listRef, indicatorRef } = useTabIndicator(view);
  return (
    <Tabs value={view} onValueChange={(value) => onChange(value as View)} className="shrink-0 gap-0 max-[760px]:w-full">
      <TabsList ref={listRef} aria-label="Digital Twin view" className="relative gap-[3px] rounded-full bg-background p-[3px] group-data-horizontal/tabs:h-auto max-[760px]:w-full">
        <span ref={indicatorRef} aria-hidden="true" className="absolute top-[3px] left-0 h-[30px] rounded-full bg-surface-elevated transition-[transform,width] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" />
        {views.map(([key, label]) => (
          <TabsTrigger key={key} value={key} className="relative z-10 h-[30px] flex-none rounded-full border-0 px-3 py-1 text-[13px] font-normal text-muted-foreground transition-colors duration-[250ms] hover:text-foreground data-active:bg-transparent data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-none max-[760px]:flex-1 dark:data-active:bg-transparent">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const age = (received?: number) => {
  if (!received) return "No telemetry";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - received));
  if (seconds < 1) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 172800) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export function DigitalTwin({ state, selectedId, onSelect, refresh }: { state: State; selectedId: string | null; onSelect: (id: string) => void; refresh: () => void }) {
  const twin = useTwinState(state);
  const [view, setView] = useState<View>(() => (["physical", "topology", "flow"].includes(localStorage.getItem("agentwin-twin-view") || "") ? localStorage.getItem("agentwin-twin-view") as View : "physical"));
  const [query, setQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [mobile, setMobile] = useState(() => matchMedia("(max-width:760px)").matches);
  useEffect(() => { const media = matchMedia("(max-width:760px)"); const update = () => setMobile(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { localStorage.setItem("agentwin-twin-view", view); }, [view]);
  const matches = twin.components.filter(c => (deviceFilter === "all" || c.deviceId === deviceFilter || deviceFilter === "unassigned" && !twin.devices.some(d => d.id === c.deviceId)) && (c.label + " " + c.type + " " + (c.pin || "")).toLowerCase().includes(query.toLowerCase()));
  const visibleIds = new Set(matches.map(c => c.id));
  const filteredTwin = { ...twin, components: matches, layout: twin.layout.filter(c => visibleIds.has(c.id)), edges: twin.edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)), devices: twin.devices.filter(d => deviceFilter === "all" || d.id === deviceFilter) };
  const inspectorOpener = useRef<HTMLElement | SVGElement | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const defaultComponent = twin.components.find((component) => component.type === "actuator") || twin.components[0];
  const selected = twin.components.find((component) => component.id === selectedId) || defaultComponent;
  useEffect(() => { if (!selectedId && defaultComponent) onSelect(defaultComponent.id); }, [defaultComponent, onSelect, selectedId]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setInspectorOpen(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const choose = (id: string) => { inspectorOpener.current = document.activeElement as HTMLElement | SVGElement; onSelect(id); setInspectorOpen(true); };
  const activity = useMemo(() => [
    ...state.readings.slice(-4).map((reading) => ({ id: `r-${reading.id}`, at: reading.received, type: "Telemetry", label: reading.device || "Packet" })),
    ...state.actions.slice(0, 3).map((action) => ({ id: action.id, at: action.created, type: "Command", label: action.status.replaceAll("_", " ") })),
    ...state.events.slice(0, 3).map((event) => ({ id: event.id, at: event.created, type: "Event", label: event.kind.replaceAll("_", " ") })),
  ].sort((a, b) => b.at - a.at).slice(0, 6), [state.actions, state.events, state.readings]);
  if (!selected) return <EmptyState icon={<Cable />} title="No configured Twin"><p>Add a device or component to create the operational representation.</p></EmptyState>;
  const relationshipKinds = [...new Set(twin.edges.map((edge) => edge.category))];
  const reporting = twin.freshness === "fresh" || twin.freshness === "aging";
  return <section className="live-twin-workspace relative min-w-0 overflow-hidden rounded-[14px] border bg-card max-[430px]:rounded-none max-[430px]:border-x-0">
    <header className="flex min-h-[82px] items-center justify-between gap-5 border-b px-[18px] py-[15px] max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-3 max-[430px]:px-3.5">
      <div>
        <span className={cn("session-kicker text-[10px] font-[750] tracking-[.1em]", twin.sessionLabel.toLowerCase(), twin.sessionLabel === "LIVE" ? "text-success" : twin.sessionLabel === "SESSION" ? "text-muted-foreground" : "text-warning")}>{twin.sessionLabel}</span>
        <h3 className="mt-[3px] mb-0.5 text-[17px] leading-normal font-bold">Digital Twin</h3>
        <p className="text-xs leading-[1.65] text-muted-foreground">Configured structure enriched with session-scoped observations.</p>
      </div>
      <ViewSwitch view={view} onChange={setView} />
    </header>
    <div className="flex min-h-[43px] items-center gap-[18px] overflow-x-auto border-b bg-background px-[18px] py-[9px] text-[11px] text-muted-foreground tabular-nums [scrollbar-width:thin] max-[1024px]:gap-[13px] max-[760px]:px-3.5 [&_svg]:size-3.5 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5 [&>span]:whitespace-nowrap" role="status" aria-live="polite">
      <span className="font-bold text-foreground"><i className={cn("size-[7px] rounded-full", reporting ? "bg-success" : twin.freshness === "stale" ? "bg-warning" : "bg-muted-foreground")} />{reporting ? "Reporting" : twin.freshness === "stale" ? "Stale" : "Data unavailable"}</span>
      <span><Radio />{twin.reportingDevices}/{state.devices.length} devices reporting</span>
      <span><Activity />Last telemetry <time dateTime={twin.lastReceivedAt ? new Date(twin.lastReceivedAt * 1000).toISOString() : undefined} title={twin.lastReceivedAt ? new Date(twin.lastReceivedAt * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" }) : "No telemetry received"}>{age(twin.lastReceivedAt)}</time></span>
      <span><Cable />{state.session.mode} session · {time(state.session.created)}</span>
      <span><CircleAlert />{twin.openEvents} open events</span>
    </div>
    {view !== "physical" && <div className="flex flex-wrap items-center gap-2 border-b p-3">
      <Input className="w-full sm:w-48" aria-label="Find component" placeholder="Find component or pin…" value={query} onChange={e => setQuery(e.target.value)} />
      <OptionSelect className="w-full sm:w-40" aria-label="Filter device" value={deviceFilter} onValueChange={setDeviceFilter} options={[{value:"all",label:"All devices"}, ...twin.devices.map(d => ({value:d.id,label:d.id})), {value:"unassigned",label:"Unassigned"}]} />
      <OptionSelect className="w-full sm:w-48" aria-label="Select component" value={selected.id} onValueChange={choose} options={matches.map(c => ({value:c.id,label:c.label}))} />
      <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("agentwin-focus-component", { detail: selected.id }))}>Focus selected</Button>
      <span className="text-xs text-muted-foreground">{matches.length} components</span>
    </div>}
    <div className={`twin-view-frame is-${view}`}>
      <div className={`live-twin-stage ${inspectorOpen ? "inspector-open" : ""}`}>
        <Suspense fallback={<EmptyState icon={<Activity />} title={`Loading ${view === "physical" ? "hardware" : view === "flow" ? "data paths" : "topology"}`} className="h-full justify-center rounded-none border-0"><p>Preparing the view.</p></EmptyState>}>
          {view === "physical" ? <PhysicalWorkspace twin={twin} selectedId={selected.id} onSelect={onSelect} onInspect={choose} refresh={refresh}/> : !matches.length ? <EmptyState title="No matching components"><p>Clear the search or select another device.</p></EmptyState> : view === "flow" ? <DataFlowTwin twin={filteredTwin} selectedId={selected.id} onSelect={choose}/> : <TopologyTwin key={state.project.id} twin={filteredTwin} selectedId={selected.id} onSelect={choose}/>}
        </Suspense>
        {!mobile && view !== "physical" && <TwinInspector component={selected} state={state} refresh={refresh} open={inspectorOpen} onClose={() => setInspectorOpen(false)}/>}
        {mobile && <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}><SheetContent onCloseAutoFocus={event => { event.preventDefault(); if (inspectorOpener.current?.isConnected) inspectorOpener.current.focus(); }} side="bottom" showCloseButton={false} className="max-h-[85dvh] overflow-auto p-0"><SheetTitle className="sr-only">Component inspector</SheetTitle><TwinInspector component={selected} state={state} refresh={refresh} open={inspectorOpen} onClose={() => setInspectorOpen(false)}/></SheetContent></Sheet>}
      </div>
    </div>
    <footer className="grid min-h-[84px] grid-cols-[140px_minmax(0,1fr)] items-center gap-3.5 border-t bg-card px-[18px] py-[13px] max-[760px]:grid-cols-1 max-[430px]:px-3.5">
      <div><strong className="block text-xs font-bold">Recent activity</strong><span className="mt-[3px] block text-[10px] text-muted-foreground">Selected session only</span></div>
      {activity.length ? <ol className="flex gap-1.5 overflow-x-auto [scrollbar-width:thin]">{activity.map((item) => <li key={item.id} className="grid min-w-[126px] grid-cols-[7px_1fr] gap-1.5 border-l px-[9px] py-2 text-[10px]"><i className={cn("mt-[3px] size-1.5 rounded-full", item.type === "Command" ? "bg-warning" : item.type === "Event" ? "bg-[var(--relationship-control)]" : "bg-operational")}/><span className="text-subtle-foreground">{item.type}<small className="block text-[9px] text-muted-foreground">{item.label}</small></span><time className="col-start-2 block text-[9px] text-muted-foreground">{time(item.at)}</time></li>)}</ol> : <p className="mt-[3px] text-[10px] leading-[1.65] text-muted-foreground">No observations, commands, or events in this session.</p>}
    </footer>
    <div className="flex flex-wrap items-center gap-3 border-t bg-background px-[18px] py-[9px] max-[430px]:px-3.5" aria-label="Relationship legend">{relationshipKinds.map((kind) => <span key={kind} className="inline-flex items-center gap-[5px] text-[10px] text-muted-foreground capitalize"><i className={cn("h-0.5 w-3.5", kind === "physical" ? "bg-[var(--relationship-physical)]" : kind === "control" ? "h-0 border-t border-dashed border-[var(--relationship-control)]" : kind === "power" ? "bg-[var(--relationship-power)]" : "bg-operational")}/>{kind === "data" ? "Observed data" : kind === "control" ? "Command" : kind}</span>)}</div>
  </section>;
}
