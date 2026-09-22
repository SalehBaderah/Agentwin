import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Cable, CircleAlert, Radio } from "lucide-react";
import type { State } from "../../types";
import { time } from "../../types";
import { useTwinState } from "./hooks/useTwinState";
import { TwinInspector } from "./TwinInspector";
import "./live-twin.css";

const TopologyTwin = lazy(() => import("./topology/TopologyTwin").then((module) => ({ default: module.TopologyTwin })));
const PhysicalTwin = lazy(() => import("./view2d/PhysicalTwin").then((module) => ({ default: module.PhysicalTwin })));
const DataFlowTwin = lazy(() => import("./view2d/DataFlowTwin").then((module) => ({ default: module.DataFlowTwin })));

type View = "physical" | "topology" | "flow";

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
  const [view, setView] = useState<View>("physical");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const defaultComponent = twin.components.find((component) => component.type === "actuator") || twin.components[0];
  const selected = twin.components.find((component) => component.id === selectedId) || defaultComponent;
  useEffect(() => { if (!selectedId && defaultComponent) onSelect(defaultComponent.id); }, [defaultComponent, onSelect, selectedId]);
  useEffect(() => {
    const move = (animate: boolean) => {
      const active = bar.current?.querySelector<HTMLElement>(`[aria-selected="true"]`);
      if (!active || !pill.current) return;
      const previous = pill.current.style.transition;
      if (!animate) pill.current.style.transition = "none";
      pill.current.style.transform = `translateX(${active.offsetLeft}px)`;
      pill.current.style.width = `${active.offsetWidth}px`;
      if (!animate) { void pill.current.offsetWidth; pill.current.style.transition = previous; }
    };
    const frame = requestAnimationFrame(() => move(false));
    const resize = () => move(false);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  useEffect(() => {
    const active = bar.current?.querySelector<HTMLElement>(`[aria-selected="true"]`);
    if (active && pill.current) { pill.current.style.transform = `translateX(${active.offsetLeft}px)`; pill.current.style.width = `${active.offsetWidth}px`; }
  }, [view]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setInspectorOpen(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const choose = (id: string) => { onSelect(id); setInspectorOpen(true); };
  const activity = useMemo(() => [
    ...state.readings.slice(-4).map((reading) => ({ id: `r-${reading.id}`, at: reading.received, type: "Telemetry", label: reading.device || "Packet" })),
    ...state.actions.slice(0, 3).map((action) => ({ id: action.id, at: action.created, type: "Command", label: action.status.replaceAll("_", " ") })),
    ...state.events.slice(0, 3).map((event) => ({ id: event.id, at: event.created, type: "Event", label: event.kind.replaceAll("_", " ") })),
  ].sort((a, b) => b.at - a.at).slice(0, 6), [state.actions, state.events, state.readings]);
  if (!selected) return <div className="empty"><Cable/><h3>No configured Twin</h3><p>Add a device or component to create the operational representation.</p></div>;
  const relationshipKinds = [...new Set(twin.edges.map((edge) => edge.category))];
  return <section className="live-twin-workspace">
    <header className="live-twin-header">
      <div><span className={`session-kicker ${twin.sessionLabel.toLowerCase()}`}>{twin.sessionLabel}</span><h3>Digital Twin</h3><p>Configured structure enriched with session-scoped observations.</p></div>
      <div ref={bar} className="t-tabs twin-view-switch" role="tablist" aria-label="Digital Twin view">
        <span ref={pill} className="t-tabs-pill" aria-hidden="true"/>
        <button type="button" className="t-tab" role="tab" aria-selected={view === "physical"} onClick={() => setView("physical")}>Physical 2D</button>
        <button type="button" className="t-tab" role="tab" aria-selected={view === "topology"} onClick={() => setView("topology")}>Topology</button>
        <button type="button" className="t-tab" role="tab" aria-selected={view === "flow"} onClick={() => setView("flow")}>Data Flow</button>
      </div>
    </header>
    <div className="twin-status-bar" role="status" aria-live="polite">
      <span className={`twin-health ${twin.freshness}`}><i/>{twin.freshness === "fresh" || twin.freshness === "aging" ? "Reporting" : twin.freshness === "stale" ? "Stale" : "Data unavailable"}</span>
      <span><Radio size={14}/>{twin.reportingDevices}/{state.devices.length} devices reporting</span>
      <span><Activity size={14}/>Last telemetry <time dateTime={twin.lastReceivedAt ? new Date(twin.lastReceivedAt * 1000).toISOString() : undefined} title={twin.lastReceivedAt ? new Date(twin.lastReceivedAt * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" }) : "No telemetry received"}>{age(twin.lastReceivedAt)}</time></span>
      <span><Cable size={14}/>{state.session.mode} session · {time(state.session.created)}</span>
      <span><CircleAlert size={14}/>{twin.openEvents} open events</span>
    </div>
    <div className={`twin-view-frame is-${view}`}>
      <div className={`live-twin-stage ${inspectorOpen ? "inspector-open" : ""}`}>
        <Suspense fallback={<div className="chart-empty"><Activity/><strong>Loading {view === "physical" ? "hardware" : view === "flow" ? "data paths" : "topology"}</strong><p>Preparing the view.</p></div>}>
          {view === "physical" ? <PhysicalTwin twin={twin} selectedId={selected.id} onSelect={choose}/> : view === "flow" ? <DataFlowTwin twin={twin} selectedId={selected.id} onSelect={choose}/> : <TopologyTwin key={state.project.id} twin={twin} selectedId={selected.id} onSelect={choose}/>}
        </Suspense>
        <TwinInspector component={selected} state={state} refresh={refresh} open={inspectorOpen} onClose={() => setInspectorOpen(false)}/>
        {inspectorOpen && <button className="inspector-backdrop" aria-label="Close component inspector" onClick={() => setInspectorOpen(false)}/>}
      </div>
    </div>
    <footer className="twin-activity"><div><strong>Recent activity</strong><span>Selected session only</span></div>{activity.length ? <ol>{activity.map((item) => <li key={item.id}><i className={item.type.toLowerCase()}/><span>{item.type}<small>{item.label}</small></span><time>{time(item.at)}</time></li>)}</ol> : <p>No observations, commands, or events in this session.</p>}</footer>
    <div className="twin-legend" aria-label="Relationship legend">{relationshipKinds.map((kind) => <span key={kind} className={kind}><i/>{kind === "data" ? "Observed data" : kind === "control" ? "Command" : kind}</span>)}</div>
  </section>;
}
