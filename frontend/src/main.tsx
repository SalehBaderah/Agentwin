import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Link,
  Route,
  Routes,
  useNavigate,
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
  Plus,
  MessageSquare,
  Menu,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  Zap,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { Answer, Component, Event as ProjectEvent, Project, State } from "./types";
import { api, display, strings, time } from "./types";
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
  const [menuOpen, setMenuOpen] = useState(false);
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
        <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button>
        <nav className={menuOpen ? "open" : ""} onClick={() => setMenuOpen(false)}>
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
            <Route path="/projects/new" element={<AddProject />} />
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
        <Link className="button primary" to="/projects/new"><Plus size={16}/> Add project</Link>
      </div>
      {!projectOnly && (
        <>
          <section className="overview-signal">
            <div className="signal-mark">
              <Activity size={24} />
            </div>
            <div>
              <h2>
                {!states.length
                  ? "Create your first project"
                  : events.length
                  ? `${events.length} event${events.length === 1 ? "" : "s"} need attention`
                  : "No open events"}
              </h2>
              <p>
                {states.length
                  ? `${states.filter((s) => s.status === "reporting").length} of ${states.length} projects are reporting from their current data source.`
                  : "Start with a template, then connect one or more real devices."}
              </p>
            </div>
            <Link
              to={events.length ? "/events" : states.length ? `/projects/${states[0].project.id}` : "/projects/new"}
            >
              {events.length ? "Review events" : states.length ? "Open project" : "Add project"}{" "}
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
          {states.length > 0 && <PlatformAnalytics states={states} />}
        </>
      )}
      <div className="section-heading">
        <h2>
          Your projects <span>{states.length}</span>
        </h2>
        <span className="secondary">
          Independent live and test sessions
        </span>
      </div>
      <div className="project-grid">
        {!states.length && <div className="empty"><Layers/><h3>No projects yet</h3><p>Create a project to define its devices, telemetry, Twin, and controls.</p><Link className="button primary" to="/projects/new"><Plus size={16}/> Add your first project</Link></div>}
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
              {s.project.template.replaceAll("_", " ")} template
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
                {s.session.mode === "live" ? <Cable size={13} /> : <FlaskConical size={13} />} {s.devices.filter((device) => device.reporting).length}/{s.devices.length} reporting
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
                Connect a configured device to receive live telemetry and operational evidence.
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
function PlatformAnalytics({ states }: { states: State[] }) {
  const [projectId, setProjectId] = useState(states[0]?.project.id || "");
  const [metricKey, setMetricKey] = useState("");
  const [windowSize, setWindowSize] = useState("30");
  const selected = states.find((state) => state.project.id === projectId) || states[0];
  if (!selected) return null;
  const field = selected.project.graph.fields[metricKey] ? metricKey : selected.project.graph.primary_field;
  const metric = selected.project.graph.fields[field];
  const numeric = metric.data_type === "number";
  const limit = windowSize === "all" ? selected.readings.length : Number(windowSize);
  const rows = selected.readings.slice(-limit).map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const reporting = states.flatMap((state) => state.devices).filter((device) => device.reporting).length;
  const devices = states.flatMap((state) => state.devices).length;
  const pending = states.flatMap((state) => state.actions).filter((action) => action.status === "requested").length;
  return <section className="analytics-grid"><div className="panel analytics-primary"><div className="panel-heading"><div><h2>Telemetry history</h2><p>Stored observations only; missing samples remain gaps.</p></div><div className="compact-filters"><label>Project<select value={selected.project.id} onChange={(event) => { setProjectId(event.target.value); setMetricKey(""); }}><option value={selected.project.id}>{selected.project.name}</option>{states.filter((state) => state.project.id !== selected.project.id).map((state) => <option value={state.project.id} key={state.project.id}>{state.project.name}</option>)}</select></label><label>Metric<select value={field} onChange={(event) => setMetricKey(event.target.value)}>{Object.entries(selected.project.graph.fields).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}</select></label><label>Window<select value={windowSize} onChange={(event) => setWindowSize(event.target.value)}><option value="30">Latest 30</option><option value="90">Latest 90</option><option value="all">All stored</option></select></label></div></div>{numeric && rows.length ? <div className="overview-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid vertical={false} stroke="rgba(225,201,232,.07)"/><XAxis dataKey="received" tickFormatter={(value) => time(Number(value))} minTickGap={40}/><YAxis width={48} unit={metric.unit}/><Tooltip labelFormatter={(value) => time(Number(value))} formatter={(value) => [`${display(value)} ${metric.unit}`, metric.label]}/><Line dataKey="value" stroke="#d0a7dc" strokeWidth={2} dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div> : <div className="chart-empty"><Activity/><strong>{rows.length ? "This metric is discrete" : "No readings yet"}</strong><p>{rows.length ? "Open the project to inspect state transitions." : "The chart will appear after the selected project reports numeric telemetry."}</p></div>}</div><aside className="panel operations-panel"><div className="panel-heading"><div><h2>Operational status</h2><p>Across configured projects.</p></div></div><div className="operation-count"><strong>{reporting}/{devices}</strong><span>devices reporting</span></div><div className="status-breakdown"><div><span><i className="status-dot good"/>Reporting</span><b>{reporting}</b></div><div><span><i className="status-dot"/>Unavailable</span><b>{devices-reporting}</b></div><div><span><i className="status-dot pending"/>Pending actions</span><b>{pending}</b></div></div><Link className="button tertiary" to="/events">Review operational events <ArrowRight size={15}/></Link></aside></section>;
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
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [sid, setSid] = useState(""),
    [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("tab") || "twin",
  );
  const refresh = useCallback(() => {
    api<State>("/projects/" + id + (sid ? "?session=" + sid : ""))
      .then((s) => {
        setState(s);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [id, sid]);
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
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?project=${id}${sid ? `&session=${sid}` : ""}`,
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
  }, [refresh, id, sid]);
  if (!state)
    return (
      <main className="page">
        <div className="empty">{error || "Loading project…"}</div>
      </main>
    );
  const p = state.project;
  const removeProject = async () => {
    if (!window.confirm(`Delete ${p.name} and all of its stored sessions, readings, events, and actions?`)) return;
    try { await api(`/projects/${p.id}`, {}, "DELETE"); navigate("/projects"); }
    catch (failure) { setError((failure as Error).message); }
  };
  return (
    <main className="page project-page">
      <Link className="back" to="/projects">
        <ArrowDownRight size={14} /> All projects
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{p.template.replaceAll("_", " ")} project</div>
          <h1>{p.name}</h1>
          {p.arabic_title && (
            <p className="project-arabic" dir="rtl" lang="ar">
              {p.arabic_title}
            </p>
          )}
        </div>
        <div className="project-actions"><label className="source-picker">Session<select value={state.session.id} onChange={(event) => setSid(event.target.value)}>{state.sessions.map((session) => <option key={session.id} value={session.id}>{session.mode} · {time(session.created)}</option>)}</select></label><button className="danger" onClick={removeProject}>Delete project</button></div>
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
        <span>{p.devices.map((device) => device.id).join(", ")}</span>
        <span>Freshness: {p.freshness_seconds}s</span>
        <span>Connector status: {state.gateway_status}</span>
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
        <Stat label="Devices reporting" value={`${state.devices.filter((device) => device.reporting).length}/${state.devices.length}`} hint="Configured devices" icon={<Cable />} />
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
      <div className="source-note">{state.session.mode === "live" ? "Live data is scoped to this project and its registered devices." : "Test data is isolated from live device state and never routes physical commands."}</div>
      <div className="workspace-grid">
        <section className="workspace-main">
          <div className="tabs" role="tablist">
            {[
              ["overview", "Overview"],
              ["readings", "Live readings"],
              ["twin", "Digital twin"],
              ["events", "Events & history"],
              ["controls", "Controls"],
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
            {tab === "overview" && <ProjectOverview state={state} />}
            {tab === "readings" && <Readings state={state} />}
            {tab === "twin" && (
              <Twin state={state} selectedId={selectedComponentId} onSelect={setSelectedComponentId} refresh={refresh} />
            )}{" "}
            {tab === "events" && <Events state={state} refresh={refresh} />}{" "}
            {tab === "controls" && <ControlsPanel state={state} refresh={refresh} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function ProjectOverview({ state }: { state: State }) {
  const p = state.project;
  return <div className="project-overview"><div className="stats">{Object.entries(p.graph.fields).map(([key, field]) => <Stat key={key} label={field.label} value={<>{display(state.latest?.readings[key])}<em>{field.unit}</em></>} hint={state.latest ? `Received ${time(state.latest.received)}` : "No reported value"} icon={<Activity />}/>)}</div><div className="overview-split"><section className="panel"><h3>Devices</h3>{state.devices.map((device) => <div className="detail-relation" key={device.id}><span>{device.id} · {device.connector}</span><strong>{device.reporting ? "reporting" : device.online ? "connected" : "unavailable"}</strong></div>)}</section><section className="panel"><h3>Recent actions</h3>{state.actions.length ? state.actions.slice(0, 5).map((action) => <div className="detail-relation" key={action.id}><span>{action.action.replace(":", " ")}</span><strong>{action.status.replace("_", " ")}</strong></div>) : <p className="detail-empty">No commands have been requested.</p>}</section></div><AgentPanel state={state}/></div>;
}

function Readings({ state }: { state: State }) {
  const [field, setField] = useState(state.project.graph.primary_field);
  const metric = state.project.graph.fields[field];
  const rows = state.readings.map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  return <div className="readings-view"><div className="chart-header"><div><h3>Readings</h3><p>Stored observations for this project and selected session.</p></div><label>Metric<select value={field} onChange={(event) => setField(event.target.value)}>{Object.entries(state.project.graph.fields).map(([key, item]) => <option value={key} key={key}>{item.label} {item.unit}</option>)}</select></label></div>{metric.data_type === "number" ? <div className="metric-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><Line dataKey="value" stroke="#d4addf" dot={false} connectNulls={false}/><XAxis dataKey="received" tickFormatter={(value) => time(Number(value))}/><YAxis/><Tooltip labelFormatter={(value) => time(Number(value))}/></LineChart></ResponsiveContainer></div> : <div className="transition-list">{state.readings.slice().reverse().map((reading) => <div key={reading.id}><span>{time(reading.received)}</span><strong>{metricValue(reading.readings[field], metric.precision)}</strong></div>)}</div>}</div>;
}

function ControlsPanel({ state, refresh }: { state: State; refresh: () => void }) {
  const [message, setMessage] = useState("");
  const controls = state.project.graph.components.flatMap((component) => (component.controls || []).map((control) => ({ component, control })));
  const run = async (component: Component, action: string, value: boolean) => { try { const result = await api<{ id: string; status: string }>(`/projects/${state.project.id}/sessions/${state.session.id}/actions`, { component_id: component.id, action, value }); setMessage(`Action ${result.id.slice(0, 8)} is ${result.status}. It completes only after matching telemetry.`); refresh(); } catch (error) { setMessage((error as Error).message); } };
  return <div className="controls-view"><div className="view-heading"><div><h3>Hardware controls</h3><p>Commands remain pending until the target device reports the expected state.</p></div></div>{controls.length ? controls.map(({ component, control }) => { const latestAction = state.actions.find((action) => action.target === component.id); const current = state.latest?.readings[control.expected.field]; const ready = controlReady(state, state.project, control); return <section className="panel control-card" key={`${component.id}-${control.action}`}><div className="control-heading"><div><h4>{component.name}</h4><p>{control.label}</p></div><Badge tone={latestAction?.status === "completed" ? "success" : latestAction?.status === "requested" ? "warning" : ""}>{latestAction?.status?.replace("_", " ") || "ready"}</Badge></div><div className="control-state"><span>Reported state<strong>{metricValue(current, 0)}</strong></span><span>Verification field<strong>{control.expected.field}</strong></span><span>Last request<strong>{latestAction ? latestAction.action.replace(":", " ") : "None"}</strong></span></div><div className="component-actions"><button className="primary" disabled={!ready || latestAction?.status === "requested"} onClick={() => run(component, control.action, true)}>Turn on</button><button className="secondary-button" disabled={!ready || latestAction?.status === "requested"} onClick={() => run(component, control.action, false)}>Turn off</button></div>{latestAction?.status === "requested" && <p className="verification-note"><Activity size={14}/> Waiting for matching device telemetry. The reported state has not been confirmed yet.</p>}{!ready && <p className="detail-empty">Connect the configured live transport before controlling this component.</p>}</section>; }) : <div className="empty"><ShieldCheck/><h3>No hardware controls configured</h3><p>This project is read-only until a device capability and verification contract are registered.</p></div>}<p role="status">{message}</p></div>;
}

function AgentPanel({ state }: { state: State }) {
  const [question, setQuestion] = useState(""), [answer, setAnswer] = useState<Answer | null>(null), [busy, setBusy] = useState(false);
  const ask = async () => { if (!question.trim()) return; setBusy(true); try { setAnswer(await api<Answer>(`/projects/${state.project.id}/sessions/${state.session.id}/agent`, { question })); } finally { setBusy(false); } };
  return <section className="panel agent-mini"><div><MessageSquare size={18}/><h3>Project agent</h3><p>Evidence is limited to this project and session.</p></div><div className="agent-question"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this project"/><button onClick={ask} disabled={busy || !question.trim()} aria-label="Ask project agent"><Send size={16}/></button></div>{answer && <p>{answer.finding}<br/><small>{answer.uncertainty}</small></p>}</section>;
}

function AddProject() {
  type AddedDevice = { device_id: string; connector: "usb" | "mqtt"; serial_port: string };
  const steps = ["Name", "Devices", "Telemetry", "Review"];
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", template: "generic", device_id: "device-01", connector: "usb", serial_port: "", field: "sensor_value", unit: "value", freshness_seconds: 8 });
  const [devices, setDevices] = useState<AddedDevice[]>([]);
  const [message, setMessage] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step < steps.length - 1) { setStep(step + 1); return; }
    const { field, unit, ...payload } = form;
    setSaving(true); setMessage("");
    try {
      const project = await api<Project>("/projects", { ...payload, serial_port: form.serial_port || null, freshness_seconds: Number(form.freshness_seconds), interval_seconds: 1, mapping: { field, unit } });
      await Promise.all(devices.map((device) => api(`/projects/${project.id}/devices`, { ...device, serial_port: device.serial_port || null })));
      navigate(`/projects/${project.id}`);
    } catch (error) { setMessage((error as Error).message); setSaving(false); }
  };
  const updateDevice = (index: number, patch: Partial<AddedDevice>) => setDevices(devices.map((device, current) => current === index ? { ...device, ...patch } : device));
  return <main className="page onboarding-page"><div className="page-heading"><div><h1>Add a project</h1><p>Define the system once. Device identity, telemetry, Twin, and history stay scoped to it.</p></div></div><ol className="stepper" aria-label="Project setup progress">{steps.map((label, index) => <li className={index === step ? "active" : index < step ? "complete" : ""} key={label}><span>{index < step ? <Check size={14}/> : index + 1}</span>{label}</li>)}</ol><form className="panel onboarding" onSubmit={save}>{step === 0 && <div className="form-step"><div className="form-step-heading"><h2>Name the system</h2><p>Choose a reusable starting structure. Nothing is created until the final step.</p></div><label>Project name<input required autoFocus value={form.name} placeholder="North tank" onChange={(event) => setForm({...form, name: event.target.value})}/><small>Use the name operators recognize.</small></label><label>Template<select value={form.template} onChange={(event) => setForm({...form, template: event.target.value})}><option value="generic">Generic sensor</option><option value="led">LED or digital output</option><option value="temperature">Temperature monitoring</option><option value="water">Water level monitoring</option><option value="connectivity">Connectivity/RF monitoring</option></select><small>Templates define fields, components, and available controls.</small></label></div>}{step === 1 && <div className="form-step"><div className="form-step-heading"><h2>Register devices</h2><p>Identifiers must match the firmware or serial gateway exactly.</p></div><div className="device-form"><label>Primary device identity<input required autoFocus value={form.device_id} onChange={(event) => setForm({...form, device_id: event.target.value})}/></label><label>Connector<select value={form.connector} onChange={(event) => setForm({...form, connector: event.target.value})}><option value="usb">USB serial gateway</option><option value="mqtt">Direct Wi-Fi MQTT</option></select></label>{form.connector === "usb" && <label>Serial port<input placeholder="COM5" value={form.serial_port} onChange={(event) => setForm({...form, serial_port: event.target.value})}/></label>}</div>{devices.map((device, index) => <div className="extra-device" key={index}><label>Device identity<input required value={device.device_id} onChange={(event) => updateDevice(index, {device_id: event.target.value})}/></label><label>Connector<select value={device.connector} onChange={(event) => updateDevice(index, {connector: event.target.value as AddedDevice["connector"]})}><option value="usb">USB serial gateway</option><option value="mqtt">Direct Wi-Fi MQTT</option></select></label>{device.connector === "usb" && <label>Serial port<input placeholder="COM9" value={device.serial_port} onChange={(event) => updateDevice(index, {serial_port: event.target.value})}/></label>}<button className="tertiary" type="button" onClick={() => setDevices(devices.filter((_, current) => current !== index))}>Remove</button></div>)}<button className="secondary-button" type="button" onClick={() => setDevices([...devices, {device_id: `device-${devices.length + 2}`, connector: "usb", serial_port: ""}])}><Plus size={15}/> Add device</button></div>}{step === 2 && <div className="form-step"><div className="form-step-heading"><h2>Define telemetry</h2><p>Built-in templates use fixed field contracts. Generic projects use your field and unit.</p></div>{form.template === "generic" ? <div className="mapping-fields"><label>Telemetry field<input required autoFocus value={form.field} onChange={(event) => setForm({...form, field: event.target.value})}/><small>Lowercase JSON key, for example humidity.</small></label><label>Unit<input required value={form.unit} onChange={(event) => setForm({...form, unit: event.target.value})}/></label></div> : <div className="preset-note"><ShieldCheck/><div><strong>Template-managed fields</strong><p>The {form.template.replaceAll("_", " ")} template supplies its telemetry field names and units.</p></div></div>}<label>Freshness threshold<input type="number" min="3" value={form.freshness_seconds} onChange={(event) => setForm({...form, freshness_seconds: Number(event.target.value)})}/><small>Agentwin marks data stale after this many seconds without a sample.</small></label></div>}{step === 3 && <div className="form-step"><div className="form-step-heading"><h2>Review configuration</h2><p>Confirm the operational identity before creating the project.</p></div><dl className="config-summary"><div><dt>Project</dt><dd>{form.name}</dd></div><div><dt>Template</dt><dd>{form.template.replaceAll("_", " ")}</dd></div><div><dt>Devices</dt><dd>{1 + devices.length}</dd></div><div><dt>Primary transport</dt><dd>{form.connector === "usb" ? `${form.connector}${form.serial_port ? ` on ${form.serial_port}` : ""}` : "Wi-Fi MQTT"}</dd></div><div><dt>Freshness</dt><dd>{form.freshness_seconds} seconds</dd></div>{form.template === "generic" && <div><dt>Mapping</dt><dd>{form.field} ({form.unit})</dd></div>}</dl></div>}<div className="form-actions">{step > 0 && <button className="tertiary" type="button" onClick={() => setStep(step - 1)}>Back</button>}<button className="primary" disabled={saving}>{step === steps.length - 1 ? saving ? "Creating project…" : "Create project" : "Continue"}</button></div><p role="status">{message}</p></form></main>;
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

const relationshipStyle: Record<string, { color: string }> = {
  physical: { color: "#d9b77a" }, control: { color: "#e49ba8" }, data: { color: "#d4addf" }, power: { color: "#ddbe78" }, context: { color: "#9cbfaf" },
};

function metricValue(value: unknown, precision: number) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: precision });
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

function controlReady(state: State, project: Project, control: { expected: { field: string } }) {
  if (state.session.mode !== "live") return false;
  const deviceId = project.graph.fields[control.expected.field]?.device_id;
  const device = state.devices.find((item) => item.id === deviceId);
  return !!device && (device.connector === "usb" ? device.online : device.reporting);
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
  const selectedMetrics = Object.entries(p.graph.fields).filter(([, metric]) => metric.component_id === selected.id);
  const categoricalMetric = selectedMetrics.find(([, metric]) => metric.data_type !== "number");
  const relations = p.graph.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id);
  const relatedEvents = state.events.filter((event) => event.evidence.readings.some((reading) => selectedMetrics.some(([key]) => key in reading.readings)));
  const legend = [...new Map(p.graph.edges.map((edge) => [edge.category, edge])).values()];
  const runControl = async (action: string, value: boolean) => {
    setActionBusy(true);
    setActionError("");
    try {
      await api(`/projects/${p.id}/sessions/${state.session.id}/actions`, { component_id: selected.id, action, value });
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
        <div className="twin twin-canvas" aria-label="Component representation">
          {[...new Set(p.graph.components.map((component) => component.group || "System"))].map((group) => <section className="twin-group" key={group}><h4>{group}</h4><div>{p.graph.components.filter((component) => (component.group || "System") === group).map((component) => <button key={component.id} className="twin-card-button" onClick={() => onSelect(component.id)} aria-pressed={component.id === selected.id}><TwinNode component={component} state={state} selected={component.id === selected.id}/></button>)}</div></section>)}
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
          <div className="detail-section"><h4>Events and actions</h4><p className="detail-empty">{relatedEvents.length ? `${relatedEvents.length} related event${relatedEvents.length === 1 ? "" : "s"}` : "No related events in this session."}</p>{selected.controls?.length ? <>{selected.controls.map((control) => <div className="component-actions" key={control.action}><button disabled={actionBusy || !controlReady(state, p, control)} onClick={() => runControl(control.action, true)}>{control.action === "set_led" ? "Turn on" : control.label}</button><button disabled={actionBusy || !controlReady(state, p, control)} onClick={() => runControl(control.action, false)}>{control.action === "set_led" ? "Turn off" : "Disable"}</button></div>)}{!selected.controls.every((control) => controlReady(state, p, control)) && <p className="detail-empty">Connect the configured live transport before controlling this component.</p>}{actionError && <p className="error">{actionError}</p>}{selectedActions.slice(0, 3).map((action) => <div className="detail-relation" key={action.id}><span>{action.action.replace(":", " ")}</span><strong>{action.status.replace("_", " ")}</strong></div>)}</> : <p className="detail-empty">No hardware controls are configured for this component.</p>}</div>
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
