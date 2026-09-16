import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Link,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  Box,
  Cable,
  Check,
  ChevronRight,
  Database,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Radio,
  Router,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Zap,
  X,
} from "lucide-react";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { Component, Event as ProjectEvent, Project, State } from "./types";
import { api, display, strings, time } from "./types";
import "@xyflow/react/dist/style.css";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";

function Mark() {
  return (
    <svg
      viewBox="0 0 40 40"
      width="32"
      height="32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 9h13l9 11-9 11H9l9-11L9 9Z"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="m9 9 9 11-9 11M22 9l-9 11 9 11"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={"badge " + tone}>
      <span className="dot" />
      {children}
    </span>
  );
}
function App() {
  const [states, setStates] = useState<State[]>([]),
    [connected, setConnected] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(() => {
    api<State[]>("/projects")
      .then((s) => {
        setStates(s);
        setLoaded(true);
        setError("");
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);
  useEffect(() => {
    refresh();
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`,
      );
      socket.onopen = () => {
        setConnected(true);
        refresh();
      };
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "snapshot") {
          setStates(m.projects);
          setLoaded(true);
          setError("");
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [refresh]);
  const active = states
    .flatMap((s) => s.events)
    .filter((e) => !e.recovered).length;
  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <Mark />
          {strings.brand}
          <span className="version">MVP</span>
        </Link>
        <nav>
          <NavLink to="/" end>
            <LayoutDashboard size={18} />
            {strings.overview}
          </NavLink>
          <NavLink to="/projects">
            <Layers size={18} />
            {strings.projects}
            <span className="nav-count">{states.length}</span>
          </NavLink>
          <NavLink to="/events">
            <Bell size={18} />
            {strings.events}
            {active > 0 && <span className="nav-count">{active}</span>}
          </NavLink>
          <NavLink to="/settings">
            <SettingsIcon size={18} />
            {strings.settings}
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={18} />
            <div>
              Local workspace<small>Monitoring runs on this device</small>
            </div>
          </div>
          <small>Agent questions use the configured provider.</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Agentwin <ChevronRight size={14} /> <span>Operations</span>
          </div>
          <Badge tone={connected ? "success" : "warning"}>
            {connected ? "Backend connected" : "Reconnecting"}
          </Badge>
        </header>
        {error && (
          <div className="error" role="alert">
            {error} <button onClick={refresh}>Retry</button>
          </div>
        )}
        {!loaded ? (
          <div className="empty">Loading your workspace…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Overview states={states} />} />
            <Route
              path="/projects"
              element={<Overview states={states} projectOnly />}
            />
            <Route
              path="/projects/:id"
              element={<Workspace connected={connected} />}
            />
            <Route path="/events" element={<GlobalEvents states={states} />} />
            <Route path="/settings" element={<GlobalSettings />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  Page not found. <Link to="/">Return to overview</Link>
                </div>
              }
            />
          </Routes>
        )}
      </div>
    </div>
  );
}
function Overview({
  states,
  projectOnly = false,
}: {
  states: State[];
  projectOnly?: boolean;
}) {
  const events = states.flatMap((s) =>
    s.events
      .filter((e) => !e.recovered)
      .map((e) => ({ ...e, project: s.project })),
  );
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>{projectOnly ? "Projects" : "Systems at a glance"}</h1>
          <p>
            Current state, recent evidence, and anything that needs attention.
          </p>
        </div>
      </div>
      {!projectOnly && (
        <>
          <section className="overview-signal">
            <div className="signal-mark">
              <Activity size={24} />
            </div>
            <div>
              <h2>
                {events.length
                  ? `${events.length} event${events.length === 1 ? "" : "s"} need attention`
                  : "No open events"}
              </h2>
              <p>
                {states.filter((s) => s.status === "reporting").length} of{" "}
                {states.length} projects are reporting from their current data source.
              </p>
            </div>
            <Link
              to={events.length ? "/events" : "/projects/smart-connectivity"}
            >
              {events.length ? "Review events" : "Open showcase"}{" "}
              <ArrowRight size={16} />
            </Link>
          </section>
          <div className="stats overview-stats">
            <Stat
              label="Total projects"
              value={states.length}
              hint="Configured workspaces"
              icon={<Layers />}
            />
            <Stat
              label="Reporting now"
              value={states.filter((s) => s.status === "reporting").length}
              hint="Current selected sources"
              icon={<Activity />}
            />
            <Stat
              label="Open events"
              value={events.length}
              hint="Across current sessions"
              icon={<Bell />}
            />
          </div>
        </>
      )}
      <div className="section-heading">
        <h2>
          Your projects <span>{states.length}</span>
        </h2>
        <span className="secondary">
          Live hardware sessions by default
        </span>
      </div>
      <div className="project-grid">
        {states.map((s) => (
          <Link
            className="project-card"
            key={s.project.id}
            to={"/projects/" + s.project.id}
          >
            <div className="card-top">
              <span className="project-icon">
                {s.project.template === "connectivity" ? (
                  <Radio />
                ) : (
                  <AudioLines />
                )}
              </span>
              <Badge tone={s.status === "reporting" ? "success" : ""}>
                {s.status}
              </Badge>
            </div>
            <div className="project-type">
              {s.project.template === "connectivity"
                ? "Connectivity template"
                : "Generic sensor template"}
            </div>
            <h3>{s.project.name}</h3>
            {s.project.arabic_title && (
              <div className="arabic" dir="rtl" lang="ar">
                {s.project.arabic_title}
              </div>
            )}
            <p>{s.project.description}</p>
            <div className="card-metric">
              <span>
                {s.project.graph.fields[s.project.graph.primary_field].label}
              </span>
              <strong>
                {display(s.latest?.readings[s.project.graph.primary_field])}
                <small>
                  {" "}
                  {s.project.graph.fields[s.project.graph.primary_field].unit}
                </small>
              </strong>
            </div>
            <div className="card-footer">
              <span>
                {s.session.mode === "live" ? <Cable size={13} /> : <FlaskConical size={13} />} {s.session.mode} · 1 device
              </span>
              <span>
                {time(s.latest?.received)} <ArrowUpRight size={16} />
              </span>
            </div>
          </Link>
        ))}
      </div>
      <div className="section-heading">
        <h2>Needs attention</h2>
        <Link to="/events">
          View all events <ArrowRight size={14} />
        </Link>
      </div>
      <section className="panel">
        {events.length ? (
          events.slice(0, 4).map((e) => (
            <Link
              className="event-row"
              key={e.id}
              to={"/projects/" + e.project.id + "?tab=events"}
            >
              <span className="event-icon">
                <Bell size={17} />
              </span>
              <div>
                <strong>
                  {e.kind === "missing_telemetry"
                    ? "Telemetry is missing"
                    : "Reading above configured limit"}
                </strong>
                <small>
                  {e.project.name} · {e.evidence.rule}
                </small>
              </div>
              <Badge tone="warning">Open</Badge>
              <time>{time(e.created)}</time>
              <ChevronRight size={16} />
            </Link>
          ))
        ) : (
          <div className="quiet">
            <ShieldCheck />
            <div>
              <strong>No open events in these sessions</strong>
              <p>
                Connect the UNO R4 and USB gateway to receive live LED telemetry.
              </p>
            </div>
          </div>
        )}
      </section>
      <footer className="page-footer">
        <span>
          <span className="dot green" /> Local-first monitoring
        </span>
        <span>Evidence-backed monitoring</span>
      </footer>
    </main>
  );
}
function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div>
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function Workspace({ connected }: { connected: boolean }) {
  const { id } = useParams();
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("tab") || "twin",
  );
  const refresh = useCallback(() => {
    api<State>("/projects/" + id)
      .then((s) => {
        setState(s);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    setState(null);
    setSelectedComponentId(null);
  }, [id]);
  useEffect(() => {
    refresh();
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?project=${id}`,
      );
      socket.onopen = refresh;
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "project_snapshot") {
          setState(m.state);
          setError("");
        }
      };
      socket.onclose = () => {
        if (!stopped) timer = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [refresh, id]);
  if (!state)
    return (
      <main className="page">
        <div className="empty">{error || "Loading project…"}</div>
      </main>
    );
  const p = state.project;
  return (
    <main className="page project-page">
      <Link className="back" to="/projects">
        <ArrowDownRight size={14} /> All projects
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Physical LED project</div>
          <h1>{p.name}</h1>
          {p.arabic_title && (
            <p className="project-arabic" dir="rtl" lang="ar">
              {p.arabic_title}
            </p>
          )}
        </div>
        <Badge tone="success">Live hardware only</Badge>
      </div>
      <div className="status-line">
        <Badge tone="success">live</Badge>
        <Badge
          tone={
            connected && state.status === "reporting" ? "success" : "warning"
          }
        >
          {connected ? state.status : "Backend disconnected · snapshot only"}
        </Badge>
        <span>{p.device_id}</span>
        <span>Freshness: {p.freshness_seconds}s</span>
        {state.session.mode === "live" && p.connector === "usb" && (
          <span>USB gateway: {state.gateway_status}</span>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="stats">
        <Stat
          label={p.graph.fields[p.graph.primary_field].label}
          value={
            <>
              {display(state.latest?.readings[p.graph.primary_field])}
              <em>{p.graph.fields[p.graph.primary_field].unit}</em>
            </>
          }
          hint={
            state.status === "reporting"
              ? "Latest received sample"
              : "Last stored value · check freshness"
          }
          icon={<Activity />}
        />
        <Stat label="USB gateway" value={state.gateway_status} hint="Serial transport" icon={<Cable />} />
        <Stat
          label="Last telemetry"
          value={time(state.latest?.received)}
          hint="Server receipt time · local timezone"
          icon={<Database />}
        />
        <Stat
          label="Open events"
          value={state.events.filter((e) => !e.recovered).length}
          hint="Acknowledgement does not mean recovery"
          icon={<Bell />}
        />
      </div>
      <div className="source-note">Live mode waits for the registered UNO R4. No generated or fallback values are used.</div>
      <div className="workspace-grid">
        <section className="workspace-main">
          <div className="tabs" role="tablist">
            {[
              ["twin", "Digital twin"],
              ["events", "Events & history"],
            ].map(([key, label]) => (
              <button
                role="tab"
                aria-selected={tab === key}
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="tab-content">
            {tab === "twin" && (
              <Twin state={state} selectedId={selectedComponentId} onSelect={setSelectedComponentId} refresh={refresh} />
            )}{" "}
            {tab === "events" && <Events state={state} refresh={refresh} />}{" "}
          </div>
        </section>
      </div>
    </main>
  );
}
const componentRegistry: Record<string, { icon: typeof Box; label: string; accent: string }> = {
  controller: { icon: Zap, label: "Controller", accent: "#AFC6E9" },
  actuator: { icon: Activity, label: "Actuator", accent: "#E49BA8" },
  gateway: { icon: Router, label: "Gateway", accent: "#AFC6E9" },
  passive: { icon: Cable, label: "Wired component", accent: "#D9B77A" },
  power: { icon: Zap, label: "Ground", accent: "#DDBE78" },
  software: { icon: Server, label: "Application", accent: "#BFA6CA" },
  generic: { icon: Box, label: "Component", accent: "#B8ACBC" },
};

const typeIcons: Record<string, typeof Box> = {
  edge_controller: Zap,
  indicator_led: Activity,
  telemetry_gateway: Router,
  resistor: Cable,
  ground: Zap,
  operations_service: Server,
};

const relationshipStyle: Record<string, { color: string; dash?: string }> = {
  physical: { color: "#D9B77A" },
  data: { color: "#D4ADDF", dash: "6 5" },
  control: { color: "#E49BA8" },
  power: { color: "#DDBE78", dash: "10 4 2 4" },
  context: { color: "#9CBFAF", dash: "2 5" },
};

function graphLayout(components: Component[], edges: Project["graph"]["edges"]) {
  const rank = new Map(components.map((c) => [c.id, 0]));
  for (let pass = 0; pass < components.length; pass += 1) {
    edges.forEach((edge) => {
      rank.set(edge.target, Math.max(rank.get(edge.target) || 0, (rank.get(edge.source) || 0) + 1));
    });
  }
  const originalOrder = new Map(components.map((component, index) => [component.id, index]));
  const ordered = [...components].sort((a, b) =>
    (rank.get(a.id) || 0) - (rank.get(b.id) || 0) || (originalOrder.get(a.id) || 0) - (originalOrder.get(b.id) || 0),
  );
  const columnCount = Math.min(3, Math.max(1, components.length));
  const positions = new Map<string, { x: number; y: number }>();
  ordered.forEach((component, index) => positions.set(component.id, { x: (index % columnCount) * 250, y: Math.floor(index / columnCount) * 148 }));
  return positions;
}

function metricValue(value: unknown, precision: number) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: precision });
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

function TwinNode({ component, state, selected }: { component: Component; state: State; selected: boolean }) {
  const registry = componentRegistry[component.category] || componentRegistry.generic;
  const Icon = typeIcons[component.type] || registry.icon;
  const metrics = Object.entries(state.project.graph.fields).filter(([, metric]) => metric.component_id === component.id).slice(0, 2);
  const passive = component.category === "passive";
  const freshnessLimit = metrics.length ? Math.min(...metrics.map(([, metric]) => metric.freshness_seconds || state.project.freshness_seconds)) : state.project.freshness_seconds;
  const fresh = !!state.latest && Date.now() / 1000 - state.latest.received <= freshnessLimit;
  const stateLabel = passive ? "Configured" : !state.latest ? "Waiting for data" : fresh ? "Fresh" : "Stale";
  return (
    <div className={`twin-node ${selected ? "is-selected" : ""}`} style={{ "--node-accent": registry.accent } as React.CSSProperties}>
      <div className="twin-node-heading"><span className="twin-node-icon"><Icon size={16}/></span><span>{registry.label}</span>{component.group && <em>{component.group}</em>}</div>
      <strong>{component.name || component.label}</strong>
      <div className="twin-node-values">
        {metrics.length ? metrics.map(([key, metric]) => <span key={key}><b>{metricValue(state.latest?.readings[key], metric.precision)}</b>{metric.unit && ` ${metric.unit}`}</span>) : <span>{component.group || "No live measurements"}</span>}
      </div>
      <small className={`node-state ${stateLabel.toLowerCase().replaceAll(" ", "-")}`}>{stateLabel}</small>
    </div>
  );
}

function Twin({ state, selectedId, onSelect, refresh }: { state: State; selectedId: string | null; onSelect: (id: string) => void; refresh: () => void }) {
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const p = state.project;
  const defaultComponent = p.graph.components.find((component) => component.id === "led") || p.graph.components[0];
  const selected = p.graph.components.find((component) => component.id === selectedId) || defaultComponent;
  useEffect(() => { if (!selectedId && defaultComponent) onSelect(defaultComponent.id); }, [selectedId, defaultComponent, onSelect]);
  const layoutKey = JSON.stringify({ components: p.graph.components.map((c) => c.id), edges: p.graph.edges.map((e) => [e.source, e.target]) });
  const positions = useMemo(() => graphLayout(p.graph.components, p.graph.edges), [layoutKey]);
  const nodes = p.graph.components.map((component) => ({
    id: component.id, position: positions.get(component.id) || { x: 0, y: 0 },
    data: { label: <TwinNode component={component} state={state} selected={component.id === selected.id}/> },
    style: { background: "transparent", border: 0, padding: 0, width: 210 }, ariaLabel: component.name || component.label,
  }));
  const edges = p.graph.edges.map((edge) => {
    const visual = relationshipStyle[edge.category] || relationshipStyle.context;
    return { id: edge.id, source: edge.source, target: edge.target, label: edge.label,
      ariaLabel: `${edge.label}: ${edge.source} to ${edge.target}`,
      style: { stroke: visual.color, strokeWidth: 1.5, strokeDasharray: visual.dash },
      labelStyle: { fill: "#C4B8C7", fontSize: 10 }, labelBgStyle: { fill: "#19141D", fillOpacity: 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color: visual.color } };
  });
  const selectedMetrics = Object.entries(p.graph.fields).filter(([, metric]) => metric.component_id === selected.id);
  const categoricalMetric = selectedMetrics.find(([, metric]) => metric.data_type !== "number");
  const relations = p.graph.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id);
  const relatedEvents = state.events.filter((event) => event.evidence.readings.some((reading) => selectedMetrics.some(([key]) => key in reading.readings)));
  const legend = [...new Map(p.graph.edges.map((edge) => [edge.category, edge])).values()];
  const setLed = async (value: boolean) => {
    setActionBusy(true);
    setActionError("");
    try {
      await api(`/projects/${p.id}/sessions/${state.session.id}/actions`, { component_id: selected.id, action: "set_led", value });
      refresh();
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setActionBusy(false);
    }
  };
  const selectedActions = state.actions.filter((action) => action.target === selected.id);
  return (
    <div className="twin-workspace">
      <div className="twin-toolbar">
        <div><h3>System topology</h3><p>{p.graph.components.length} components · {p.graph.edges.length} relationships · schema v{p.graph.schema_version}</p></div>
        <div className="twin-legend" aria-label="Relationship legend">{legend.map((edge) => <span key={edge.category}><i style={{ background: relationshipStyle[edge.category]?.color }}/>{edge.category}</span>)}</div>
      </div>
      <div className="twin-stage">
        <div className="twin">
          <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.18 }} nodesDraggable={false} nodesConnectable={false}
            elementsSelectable onNodeClick={(_, node) => onSelect(node.id)} minZoom={0.25} maxZoom={1.8}>
            <Background color="#48344e" gap={22}/><Controls showInteractive={false}/>
          </ReactFlow>
        </div>
        <aside className="twin-details" aria-label="Selected component details">
          <div className="detail-heading"><span>{componentRegistry[selected.category]?.label || "Component"}{selected.group ? ` / ${selected.group}` : ""}</span><h3>{selected.name || selected.label}</h3><p>{selected.description || "No description provided."}</p></div>
          <div className="detail-section"><h4>Current state</h4>
            {selectedMetrics.length ? selectedMetrics.map(([key, metric]) => {
              const value = state.latest?.readings[key];
              const freshFor = metric.freshness_seconds || p.freshness_seconds;
              const fresh = !!state.latest && Date.now() / 1000 - state.latest.received <= freshFor;
              return <div className="detail-metric" key={key}><span>{metric.label}<small>{metric.source} · {fresh ? "fresh" : state.latest ? "stale" : "waiting"}</small></span><strong>{metricValue(value, metric.precision)} {value !== null && value !== undefined ? metric.unit : ""}</strong>{!metric.calibrated && <small>Calibration unavailable</small>}</div>;
            }) : <p className="detail-empty">This component has static configuration only.</p>}
          </div>
          {selectedMetrics.some(([, metric]) => metric.data_type === "number") && state.readings.length > 1 && <div className="detail-section"><h4>Recent history</h4><div className="detail-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={state.readings.map((r) => ({ received: r.received, ...r.readings }))}><Line dataKey={selectedMetrics.find(([, m]) => m.data_type === "number")?.[0]} stroke="#D4ADDF" dot={false} isAnimationActive={false}/><XAxis dataKey="received" hide/><YAxis hide domain={["auto", "auto"]}/><Tooltip labelFormatter={(n) => time(Number(n))}/></LineChart></ResponsiveContainer></div></div>}
          {categoricalMetric && state.readings.length > 0 && <div className="detail-section"><h4>Recent transitions</h4><div className="transition-list">{state.readings.slice(-5).reverse().map((reading) => <div key={`${reading.received}-${categoricalMetric[0]}`}><span>{time(reading.received)}</span><strong>{metricValue(reading.readings[categoricalMetric[0]], categoricalMetric[1].precision)}</strong></div>)}</div></div>}
          <div className="detail-section"><h4>Relationships</h4>{relations.length ? relations.map((edge) => <div className="detail-relation" key={edge.id}><span>{edge.label}</span><strong>{edge.source === selected.id ? p.graph.components.find((c) => c.id === edge.target)?.name : p.graph.components.find((c) => c.id === edge.source)?.name}</strong></div>) : <p className="detail-empty">No relationships defined.</p>}</div>
          {!!Object.keys(selected.configuration).length && <div className="detail-section"><h4>Configuration</h4>{Object.entries(selected.configuration).map(([key, value]) => <div className="detail-relation" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{display(value)}</strong></div>)}</div>}
          <div className="detail-section"><h4>Events and actions</h4><p className="detail-empty">{relatedEvents.length ? `${relatedEvents.length} related event${relatedEvents.length === 1 ? "" : "s"}` : "No related events in this session."}</p>{selected.capabilities.includes("action:set_led") ? <><div className="component-actions"><button disabled={actionBusy || state.session.mode !== "live" || state.gateway_status !== "online"} onClick={() => setLed(true)}>Turn LED on</button><button disabled={actionBusy || state.session.mode !== "live" || state.gateway_status !== "online"} onClick={() => setLed(false)}>Turn LED off</button></div>{state.session.mode !== "live" && <p className="detail-empty">Select the live session to control hardware.</p>}{state.session.mode === "live" && state.gateway_status !== "online" && <p className="detail-empty">Connect the USB gateway to enable controls.</p>}{actionError && <p className="error">{actionError}</p>}{selectedActions.slice(0, 3).map((action) => <div className="detail-relation" key={action.id}><span>{action.action.replace(":", " ")}</span><strong>{action.status}</strong></div>)}</> : <p className="detail-empty">No implemented actions.</p>}</div>
          <p className="detail-footnote">{state.session.mode} source · last update {time(state.latest?.received)}. This is a live operational representation, not a predictive model.</p>
        </aside>
      </div>
    </div>
  );
}
function Events({ state, refresh }: { state: State; refresh: () => void }) {
  const [selected, setSelected] = useState<ProjectEvent | null>(null),
    [error, setError] = useState("");
  const acknowledge = async (e: ProjectEvent) => {
    try {
      await api(
        `/projects/${state.project.id}/sessions/${state.session.id}/events/${e.id}/acknowledge`,
        {},
      );
      refresh();
      setSelected({ ...e, acknowledged: Date.now() / 1000 });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <div className="chart-header">
        <div>
          <h3>Events & history</h3>
          <p>Actual triggers, supporting readings, and recovery.</p>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {state.events.length ? (
        state.events.map((e) => (
          <div className="event-item" key={e.id}>
            <button className="event-select" onClick={() => setSelected(e)}>
              <Bell size={17} />
              <span>
                <strong>{e.kind.replaceAll("_", " ")}</strong>
                <small>
                  {e.evidence.rule} · {time(e.created)}
                </small>
              </span>
              <Badge tone={e.recovered ? "success" : "warning"}>
                {e.recovered ? "Recovered" : "Open"}
              </Badge>
            </button>
            <div className="event-actions">
              <span>
                {e.recovered
                  ? "Recovery " + time(e.recovered)
                  : "Cause unknown"}
              </span>
              <button
                disabled={!!e.acknowledged}
                onClick={() => acknowledge(e)}
              >
                {e.acknowledged ? (
                  <>
                    <Check size={14} /> Acknowledged
                  </>
                ) : (
                  "Acknowledge event"
                )}
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="empty">
          <ShieldCheck />
          <h3>No events in this session</h3>
          <p>
            Configured rules will record missing telemetry and sustained high
            readings.
          </p>
        </div>
      )}
      {selected && (
        <div className="evidence-detail">
          <div className="section-heading">
            <h3>Event evidence</h3>
            <button
              aria-label="Close evidence"
              className="icon-button"
              onClick={() => setSelected(null)}
            >
              <X size={16} />
            </button>
          </div>
          <p>{selected.evidence.rule}</p>
          <p>{selected.evidence.cause}</p>
          <small>
            Event {selected.id} · {selected.evidence.source_mode}
          </small>
          {selected.evidence.readings.map((r) => (
            <div className="evidence-reading" key={r.id}>
              <strong>
                Reading #{r.id} · {time(r.received)}
              </strong>
              <span>
                {Object.entries(r.readings)
                  .map(([k, v]) => `${k}: ${display(v)}`)
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function GlobalEvents({ states }: { states: State[] }) {
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Evidence and recovery</div>
          <h1>Events across your systems.</h1>
          <p>
            Events from the live LED hardware session.
          </p>
        </div>
      </div>
      {states.map((s) => (
        <section className="panel global-event" key={s.project.id}>
          <div className="section-heading">
            <h2>{s.project.name}</h2>
            <Link to={"/projects/" + s.project.id + "?tab=events"}>
              Investigate <ArrowRight size={15} />
            </Link>
          </div>
          {s.events.length ? (
            s.events.map((e) => (
              <div className="event-row" key={e.id}>
                <Bell size={17} />
                <div>
                  <strong>{e.evidence.rule}</strong>
                  <small>
                    {time(e.created)} ·{" "}
                    {e.acknowledged ? "Acknowledged" : "Not acknowledged"}
                  </small>
                </div>
                <Badge tone={e.recovered ? "success" : "warning"}>
                  {e.recovered ? "Recovered" : "Open"}
                </Badge>
              </div>
            ))
          ) : (
            <p>No recorded events.</p>
          )}
        </section>
      ))}
    </main>
  );
}
function GlobalSettings() {
  const [health, setHealth] = useState<{
    mqtt: boolean;
    agent_configured: boolean;
    mqtt_rejections: number;
  } | null>(null);
  useEffect(() => {
    api<{ mqtt: boolean; agent_configured: boolean; mqtt_rejections: number }>(
      "/health",
    )
      .then(setHealth)
      .catch(() => {});
  }, []);
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Workspace configuration</div>
          <h1>Ready when your hardware is.</h1>
          <p>
            Local monitoring works independently of the broker and AI provider.
          </p>
        </div>
      </div>
      <section className="panel settings-content">
        <h2>Service availability</h2>
        <div className="measurement">
          <span>MQTT broker</span>
          <Badge tone={health?.mqtt ? "success" : "warning"}>
            {health?.mqtt ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <div className="measurement">
          <span>AI provider</span>
          <span>
            {health?.agent_configured
              ? "Configured · request needed to verify availability"
              : strings.unavailable}
          </span>
        </div>
        <div className="measurement">
          <span>Rejected MQTT messages</span>
          <span>{health?.mqtt_rejections ?? "—"}</span>
        </div>
        <h3>Setup notes</h3>
        <p>
          Configure credentials in the backend .env file. Device identity, field
          mapping, freshness, and inventory are available under each project's
          Setup tab.
        </p>
        <p>
          The MVP binds to loopback. See docs/hardware.md before connecting a
          device or exposing the broker to a private network.
        </p>
        <p>
          Physical control, RF calibration, trained anomaly models, and
          behavioral simulation are unavailable.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
