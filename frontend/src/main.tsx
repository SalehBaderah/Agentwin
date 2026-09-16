import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Link,
  Route,
  Routes,
  useParams,
  useNavigate,
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
  CircleHelp,
  Database,
  Droplets,
  FlaskConical,
  Gauge,
  Layers,
  LayoutDashboard,
  MessageSquare,
  MapPin,
  Plus,
  Radio,
  Router,
  Send,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wifi,
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
  CartesianGrid,
} from "recharts";
import type { Answer, Component, Event as ProjectEvent, Project, State } from "./types";
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
              path="/projects/new"
              element={<AddProject refresh={refresh} />}
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
        <Link className="button primary" to="/projects/new">
          <Plus size={17} />
          {strings.add}
        </Link>
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
        <Link className="new-card" to="/projects/new">
          <span>
            <Plus size={23} />
          </span>
          <h3>Connect another system</h3>
          <p>Choose a template and register a device.</p>
          <span className="text-link">
            Add project <ArrowRight size={15} />
          </span>
        </Link>
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
                Start a simulation to explore live readings and event detection.
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
    [sid, setSid] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("tab") || "readings",
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
    setSid("");
    setSelectedComponentId(null);
  }, [id]);
  useEffect(() => {
    refresh();
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?project=${id}${sid ? "&session=" + sid : ""}`,
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
  const p = state.project,
    base = `/projects/${p.id}/sessions/${state.session.id}`;
  const command = async (scenario: string) => {
    setBusy(true);
    try {
      await api(base + "/scenario", { scenario });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const replay = async () => {
    setBusy(true);
    try {
      const result = await api<{ id: string }>(`/projects/${p.id}/sessions`, {
        mode: "replay",
        recording_id: state.session.id,
      });
      setSid(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page project-page">
      <Link className="back" to="/projects">
        <ArrowDownRight size={14} /> All projects
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {p.template === "connectivity"
              ? "Connectivity showcase"
              : "Generic sensor project"}
          </div>
          <h1>{p.name}</h1>
          {p.arabic_title && (
            <p className="project-arabic" dir="rtl" lang="ar">
              {p.arabic_title}
            </p>
          )}
        </div>
        <div className="source-picker">
          <label htmlFor="source">Data source / session</label>
          <select
            id="source"
            value={state.session.id}
            onChange={(e) => setSid(e.target.value)}
          >
            {state.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.mode} · {time(s.created)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="status-line">
        <Badge tone={state.session.mode === "live" ? "success" : ""}>
          {state.session.mode}
          {state.session.mode === "replay"
            ? " · " + state.session.provenance.origin
            : ""}
        </Badge>
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
        <Stat
          label={
            p.template === "connectivity"
              ? "Arduino Wi-Fi RSSI"
              : "Source provenance"
          }
          value={
            p.template === "connectivity" ? (
              <>
                {display(state.latest?.readings.wifi_rssi_dbm)}
                <em>dBm</em>
              </>
            ) : (
              state.session.provenance.origin
            )
          }
          hint={
            p.template === "connectivity"
              ? state.latest?.readings.wifi_connected === true
                ? "Interface reports connected"
                : state.latest?.readings.wifi_connected === false
                  ? "Interface reports disconnected"
                  : "Network interface measurement unavailable"
              : "Synthetic until live hardware is connected"
          }
          icon={<Wifi />}
        />
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
      {state.session.mode === "simulated" ? (
        <section className="demo-bar">
          <div>
            <FlaskConical size={20} />
            <span>
              <strong>Simulation lab</strong>
              <small>Deterministic synthetic data · no physical device</small>
            </span>
          </div>
          <div className="demo-buttons">
            {[
              ["normal", "Start normal"],
              ["level-change", "Detector / level change"],
              ["pause", "Pause telemetry"],
              ["recovery", "Recover"],
            ].map(([s, label]) => (
              <button
                disabled={busy}
                key={s}
                className={state.session.scenario === s ? "selected" : ""}
                onClick={() => command(s)}
              >
                {label}
              </button>
            ))}
            <button disabled={busy || !state.readings.length} onClick={replay}>
              Replay recording
            </button>
          </div>
        </section>
      ) : (
        <div className="source-note">
          {state.session.mode === "live"
            ? "Live mode waits for registered hardware. It never falls back to simulation."
            : "Replay of stored data; original provenance and receipt times are preserved. Event detection is disabled for replay."}
          {state.session.mode === "live" && state.readings.length > 0 && (
            <button disabled={busy} onClick={replay}>
              Replay recording
            </button>
          )}
        </div>
      )}
      <div className="workspace-grid">
        <section className="workspace-main">
          <div className="tabs" role="tablist">
            {[
              ["readings", "Live readings"],
              ["twin", "Digital twin"],
              ["events", "Events & history"],
              ["settings", "Setup"],
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
            {tab === "readings" && <Readings state={state} />}{" "}
            {tab === "twin" && (
              <Twin state={state} selectedId={selectedComponentId} onSelect={setSelectedComponentId} refresh={refresh} />
            )}{" "}
            {tab === "events" && <Events state={state} refresh={refresh} />}{" "}
            {tab === "settings" && (
              <ProjectSettings project={p} refresh={refresh} />
            )}
          </div>
        </section>
        <Agent
          key={state.session.id}
          state={state}
          selectedComponent={p.graph.components.find((c) => c.id === selectedComponentId) || null}
        />
      </div>
    </main>
  );
}
function Readings({ state }: { state: State }) {
  const p = state.project,
    field = p.graph.primary_field,
    meta = p.graph.fields[field];
  const chart = useMemo(() => {
    const result: Record<string, unknown>[] = [];
    state.readings.forEach((r, i) => {
      if (
        i &&
        r.received - state.readings[i - 1].received > p.freshness_seconds
      )
        result.push({
          received: state.readings[i - 1].received + p.interval_seconds,
          [field]: null,
        });
      result.push({ received: r.received, ...r.readings });
    });
    return result;
  }, [state.readings, p, field]);
  return (
    <>
      <div className="chart-header">
        <div>
          <h3>{meta.label}</h3>
          <p>
            {state.session.mode} · {meta.unit} · Latest 180 samples
          </p>
        </div>
        <span className="chart-legend">
          <i />
          {meta.label}
        </span>
      </div>
      {chart.length ? (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chart}
              margin={{ top: 15, right: 16, bottom: 5, left: 0 }}
            >
              <CartesianGrid
                stroke="#332739"
                strokeDasharray="3 5"
                vertical={false}
              />
              <XAxis
                dataKey="received"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(n) =>
                  new Date(n * 1000).toLocaleTimeString([], { hour12: false })
                }
                tick={{ fill: "#A496AA", fontSize: 11 }}
                minTickGap={45}
              />
              <YAxis
                tick={{ fill: "#C4B8C7", fontSize: 11 }}
                width={48}
                domain={["auto", "auto"]}
                unit={" " + meta.unit}
              />
              <Tooltip
                labelFormatter={(n) => time(Number(n))}
                contentStyle={{
                  background: "#261B2B",
                  border: "1px solid #69536f",
                  borderRadius: 8,
                }}
              />
              <Line
                type="linear"
                dataKey={field}
                name={meta.label}
                stroke="#D0A7DC"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty">
          <Activity size={32} />
          <h3>Ready for the first reading</h3>
          <p>
            {state.session.mode === "simulated"
              ? "Select Start normal in the simulation lab."
              : "Connect the registered device to start receiving telemetry."}
          </p>
        </div>
      )}
      <div className="reading-table">
        <div className="section-heading">
          <h3>Measurement details</h3>
          <span className="secondary">{time(state.latest?.received)}</span>
        </div>
        {state.latest?.original && (
          <p>
            Original recording receipt: {time(state.latest.original.received)} ·
            Replayed {time(state.latest.received)}
          </p>
        )}
        {Object.entries(p.graph.fields).map(([key, meta]) => (
          <div className="measurement" key={key}>
            <span>{meta.label}</span>
            <strong>
              {display(state.latest?.readings[key])} <small>{meta.unit}</small>
            </strong>
            <span className="secondary">
              {state.latest?.readings[key] === null ||
              state.latest?.readings[key] === undefined
                ? "Unavailable"
                : state.status === "reporting"
                  ? "Received"
                  : "Historical"}
            </span>
          </div>
        ))}
        {p.template === "connectivity" && (
          <div className="measurement">
            <span>Estimated RF power</span>
            <strong>— dBm</strong>
            <span className="secondary">No validated calibration</span>
          </div>
        )}
      </div>
      {p.template === "connectivity" &&
        state.readings.some(
          (r) => typeof r.readings.wifi_rssi_dbm === "number",
        ) && (
          <>
            <div className="chart-header">
              <div>
                <h3>Arduino Wi-Fi RSSI</h3>
                <p>
                  Network interface · dBm · {state.session.mode} · Latest 180
                  samples
                </p>
              </div>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chart}
                  margin={{ top: 15, right: 16, bottom: 5, left: 8 }}
                >
                  <CartesianGrid
                    stroke="#332739"
                    strokeDasharray="3 5"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="received"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(n) =>
                      new Date(n * 1000).toLocaleTimeString([], {
                        hour12: false,
                      })
                    }
                    minTickGap={45}
                    tick={{ fill: "#A496AA", fontSize: 11 }}
                  />
                  <YAxis
                    width={56}
                    domain={["auto", "auto"]}
                    tick={{ fill: "#C4B8C7", fontSize: 11 }}
                  />
                  <Tooltip
                    labelFormatter={(n) => time(Number(n))}
                    contentStyle={{
                      background: "#261B2B",
                      border: "1px solid #69536f",
                    }}
                  />
                  <Line
                    dataKey="wifi_rssi_dbm"
                    name="Wi-Fi RSSI (dBm)"
                    stroke="#9CBFAF"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      <div className="insight-note">
        <CircleHelp size={18} />
        <p>
          {p.template === "connectivity"
            ? "The detector measures RF level at its input. A changed reading does not identify a frequency, interference source, or connection fault."
            : "This generic sensor uses the configured field and unit mapping. Simulated readings are demonstration data."}
        </p>
      </div>
    </>
  );
}
const componentRegistry: Record<
  string,
  { icon: typeof Box; label: string; accent: string }
> = {
  sensor: { icon: Gauge, label: "Sensor", accent: "#D4ADDF" },
  controller: { icon: Zap, label: "Controller", accent: "#AFC6E9" },
  actuator: { icon: Activity, label: "Actuator", accent: "#E49BA8" },
  gateway: { icon: Router, label: "Gateway", accent: "#AFC6E9" },
  passive: { icon: Cable, label: "Passive component", accent: "#D9B77A" },
  software: { icon: Server, label: "Software service", accent: "#BFA6CA" },
  asset: { icon: MapPin, label: "Physical asset", accent: "#9CBFAF" },
  generic: { icon: Box, label: "Component", accent: "#B8ACBC" },
};

const typeIcons: Record<string, typeof Box> = {
  temperature_sensor: Thermometer,
  water_level_sensor: Droplets,
  tank: Droplets,
  rf_antenna: Radio,
  rf_detector: Gauge,
  telemetry_gateway: Router,
};

const relationshipStyle: Record<string, { color: string; dash?: string }> = {
  physical: { color: "#D9B77A" },
  data: { color: "#D4ADDF", dash: "6 5" },
  control: { color: "#E49BA8" },
  context: { color: "#9CBFAF", dash: "2 5" },
  power: { color: "#DDBE78", dash: "10 4 2 4" },
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
  const selected = p.graph.components.find((component) => component.id === selectedId) || p.graph.components[0];
  useEffect(() => { if (!selectedId && p.graph.components[0]) onSelect(p.graph.components[0].id); }, [selectedId, p.graph.components, onSelect]);
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
  const askAgent = () => {
    onSelect(selected.id);
    window.dispatchEvent(new CustomEvent("agentwin:ask-component", { detail: { id: selected.id, name: selected.name || selected.label } }));
  };
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
          <button className="ask-component" onClick={askAgent}><Sparkles size={15}/>Ask agent about this component</button>
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
function Agent({ state, selectedComponent }: { state: State; selectedComponent: Component | null }) {
  const [question, setQuestion] = useState(""),
    [result, setResult] = useState<Answer | null>(null),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState(false),
    [previous, setPrevious] = useState<{ question: string; answer: Answer }[]>(
      [],
    );
  const base = `/projects/${state.project.id}/sessions/${state.session.id}`;
  useEffect(() => {
    api<{ agent_configured: boolean }>("/health")
      .then((h) => setConfigured(h.agent_configured))
      .catch(() => setConfigured(false));
    api<{ question: string; answer: Answer }[]>(base + "/conversations")
      .then(setPrevious)
      .catch(() => {});
  }, [base]);
  useEffect(() => {
    const prepareQuestion = (event: Event) => {
      const detail = (event as CustomEvent<{ name: string }>).detail;
      setQuestion(`How fresh are the measurements for ${detail.name}?`);
      requestAnimationFrame(() => document.getElementById("question")?.focus());
    };
    window.addEventListener("agentwin:ask-component", prepareQuestion);
    return () => window.removeEventListener("agentwin:ask-component", prepareQuestion);
  }, []);
  const ask = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setQuestion(text);
    try {
      setResult(await api<Answer>(base + "/agent", { question: text, component_id: selectedComponent?.id || null }));
    } catch {
      setResult({
        available: false,
        finding: "AI agent unavailable",
        uncertainty: "The backend could not be reached.",
        next_step: "Reconnect and retry.",
        evidence: [],
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="agent-panel">
      <div className="agent-heading">
        <span className="agent-icon">
          <Sparkles size={20} />
        </span>
        <div>
          <h3>Project agent</h3>
          <small>
            {selectedComponent ? `${selectedComponent.name || selectedComponent.label} selected` : configured
              ? "Provider configured · availability checked on request"
              : strings.unavailable}
          </small>
        </div>
        <span className="dot" />
      </div>
      <div className="agent-body">
        <span className="eyebrow">Project context</span>
        <h3>
          Understand what
          <br />
          your system is telling you.
        </h3>
        <p>
          A dedicated assistant with access to this project’s readings,
          components, and event evidence.
        </p>
        <div className="agent-scope">
          <ShieldCheck size={15} /> {state.session.mode} session · {selectedComponent ? `${selectedComponent.name || selectedComponent.label} context` : "Project scoped"}
        </div>
        <div className="suggestions">
          {(selectedComponent ? [
            "What changed recently?",
            "How fresh is this measurement?",
            "What actions are available?",
          ] : ["What changed recently?", "Is this device still reporting?", "What evidence supports this event?"]).map((q) => (
            <button key={q} disabled={busy} onClick={() => ask(q)}>
              {q}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
        {!configured && !result && (
          <div className="agent-notice">
            <MessageSquare size={17} />
            <p>
              Add server-side provider credentials to enable analysis.
              Monitoring works without an AI connection.
            </p>
          </div>
        )}
        {busy && <p role="status">Retrieving project evidence…</p>}
        {result && (
          <div className="agent-answer" aria-live="polite">
            <Badge tone={result.available ? "success" : "warning"}>
              {result.available ? "Agent response" : strings.unavailable}
            </Badge>
            <h4>Finding</h4>
            <p>{result.finding}</p>
            <h4>Uncertainty</h4>
            <p>{result.uncertainty}</p>
            <h4>Next step</h4>
            <p>{result.next_step}</p>
            {result.evidence.map((e) => (
              <details key={e.id}>
                <summary>
                  {e.id} · {time(e.timestamp)}
                </summary>
                <p>
                  {e.trigger ||
                    Object.entries(e.readings || {})
                      .map(([k, v]) => `${k}: ${display(v)}`)
                      .join(", ")}
                </p>
              </details>
            ))}
          </div>
        )}
        {previous.length > 0 && (
          <details>
            <summary>Previous conversation ({previous.length})</summary>
            {previous.map((p, i) => (
              <div className="prior-answer" key={i}>
                <strong>{p.question}</strong>
                <p>{p.answer.finding}</p>
              </div>
            ))}
          </details>
        )}
      </div>
      <form
        className="agent-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label className="sr-only" htmlFor="question">
          Ask the project agent
        </label>
        <input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this system…"
          maxLength={2000}
        />
        <button aria-label="Send question" disabled={busy || !question.trim()}>
          <Send size={17} />
        </button>
      </form>
      <div className="agent-footnote">
        Read-only analysis. Physical control unavailable.
      </div>
    </aside>
  );
}
function AddProject({ refresh }: { refresh: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    template: "generic",
    device_id: "sensor-01",
    connector: "usb",
    mapping: { field: "sensor_value", unit: "°C" },
    freshness_seconds: 8,
    interval_seconds: 1,
    high_limit: 30,
    attenuator_inserted: false,
    cable_description: "SMA cable; verify actual arrangement",
  });
  const steps = [
    "Project identity",
    "Template",
    "Device & connector",
    "Fields & freshness",
  ];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const p = await api<Project>("/projects", form);
      refresh();
      navigate("/projects/" + p.id + "?tab=settings");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page">
      <Link className="back" to="/">
        All projects
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">New connected system</div>
          <h1>Give your system a workspace.</h1>
          <p>A reusable template. A dedicated view. Its own agent.</p>
        </div>
      </div>
      <div className="setup-layout">
        <ol className="steps">
          {steps.map((s, i) => (
            <li className={step === i ? "active" : ""} key={s}>
              <span>{i < step ? <Check size={16} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <form className="panel setup-form" onSubmit={submit}>
          <h2>{steps[step]}</h2>
          {step === 0 && (
            <label>
              Project name
              <input
                required
                autoFocus
                value={form.name}
                maxLength={100}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Water level monitor"
              />
            </label>
          )}
          {step === 1 && (
            <div className="template-options">
              {[
                [
                  "generic",
                  "Generic sensor",
                  "One numeric reading with your own field and unit.",
                ],
                [
                  "connectivity",
                  "Smart Systems Connectivity",
                  "AD8313 detector and Arduino telemetry.",
                ],
                [
                  "temperature",
                  "Temperature monitoring",
                  "A temperature sensor associated with a room.",
                ],
                [
                  "water",
                  "Water monitoring",
                  "A level sensor associated with a tank.",
                ],
              ].map(([key, label, detail]) => (
                <button
                  type="button"
                  className={form.template === key ? "selected" : ""}
                  key={key}
                  onClick={() =>
                    setForm({
                      ...form,
                      template: key,
                      mapping:
                        key === "temperature"
                          ? { field: "temperature_c", unit: "°C" }
                          : key === "water"
                            ? { field: "water_level_cm", unit: "cm" }
                            : key === "connectivity"
                              ? { field: "rf_detector_v", unit: "V" }
                              : { field: "sensor_value", unit: "°C" },
                      high_limit:
                        key === "connectivity" ? 1.6 : key === "water" ? 80 : 30,
                    })
                  }
                >
                  <Radio size={22} />
                  <strong>{label}</strong>
                  <p>{detail}</p>
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <>
              <label>
                Device identity
                <input
                  required
                  pattern="[a-z0-9\-]{1,64}"
                  value={form.device_id}
                  onChange={(e) =>
                    setForm({ ...form, device_id: e.target.value })
                  }
                />
                <small>Lowercase letters, numbers, and hyphens.</small>
              </label>
              <label>
                Live connector
                <select
                  value={form.connector}
                  onChange={(e) =>
                    setForm({ ...form, connector: e.target.value })
                  }
                >
                  <option value="usb">USB serial gateway → MQTT</option>
                  <option value="mqtt">Direct Wi-Fi → MQTT</option>
                </select>
              </label>
              <div className="insight-note">
                A separate simulated session is included. No hardware connection
                is assumed.
              </div>
            </>
          )}
          {step === 3 && (
            <>
              {form.template === "generic" ? (
                <div className="form-row">
                  <label>
                    Telemetry field
                    <input
                      required
                      pattern="[a-z][a-z0-9_]{0,39}"
                      value={form.mapping.field}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          mapping: { ...form.mapping, field: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <input
                      required
                      value={form.mapping.unit}
                      maxLength={20}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          mapping: { ...form.mapping, unit: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              ) : form.template === "connectivity" ? (
                <p>
                  Configured fields: rf_adc_raw (counts), rf_detector_v (V),
                  wifi_connected, wifi_rssi_dbm (dBm).
                </p>
              ) : (
                <p>
                  Configured field: {form.mapping.field} ({form.mapping.unit}).
                  The Digital Twin will bind it to the template sensor.
                </p>
              )}
              <div className="form-row">
                <label>
                  Sample interval (s)
                  <input
                    required
                    type="number"
                    min={1}
                    max={600}
                    value={form.interval_seconds}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        interval_seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Stale after (s)
                  <input
                    required
                    type="number"
                    min={form.interval_seconds * 2}
                    max={3600}
                    value={form.freshness_seconds}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        freshness_seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                High reading threshold (
                {form.template === "connectivity" ? "V" : form.mapping.unit})
                <input
                  required
                  type="number"
                  step="any"
                  value={form.high_limit}
                  onChange={(e) =>
                    setForm({ ...form, high_limit: Number(e.target.value) })
                  }
                />
                <small>
                  Creates an event after three consecutive readings above this
                  limit.
                </small>
              </label>
            </>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="form-actions">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button disabled={busy} className="primary" type="submit">
              {busy ? "Creating…" : step === 3 ? "Create project" : "Continue"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
function ProjectSettings({
  project: p,
  refresh,
}: {
  project: Project;
  refresh: () => void;
}) {
  const [fresh, setFresh] = useState(p.freshness_seconds),
    [limit, setLimit] = useState(p.high_limit),
    [inserted, setInserted] = useState(p.attenuator_inserted),
    [cable, setCable] = useState(p.cable_description),
    [message, setMessage] = useState("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(
        "/projects/" + p.id + "/settings",
        {
          freshness_seconds: fresh,
          high_limit: limit,
          attenuator_inserted: inserted,
          cable_description: cable,
        },
        "PUT",
      );
      setMessage("Settings saved");
      refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };
  return (
    <div className="settings-content">
      <h3>Device connection</h3>
      <p>
        Use these values when connecting hardware after the platform is ready.
      </p>
      <label>
        Telemetry topic
        <code>
          agentwin/{p.id}/{p.device_id}/telemetry
        </code>
      </label>
      <label>
        Host gateway command
        <code>
          python -m gateway.serial_gateway --port COM3 --project {p.id} --device{" "}
          {p.device_id}
        </code>
      </label>
      <p>
        Connector: {p.connector} · Sampling interval: {p.interval_seconds}s
        (configure firmware to match).
      </p>
      <form onSubmit={save}>
        <div className="form-row">
          <label>
            Freshness (s)
            <input
              type="number"
              min={p.interval_seconds * 2}
              max={3600}
              value={fresh}
              onChange={(e) => setFresh(Number(e.target.value))}
            />
          </label>
          <label>
            High limit
            <input
              type="number"
              step="any"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
        </div>
        {p.template === "connectivity" && (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={inserted}
                onChange={(e) => setInserted(e.target.checked)}
              />
              10 dB attenuator physically inserted
            </label>
            <label>
              Cable arrangement
              <input
                maxLength={300}
                value={cable}
                onChange={(e) => setCable(e.target.value)}
              />
            </label>
            <p>
              Calibration: unavailable. RF power remains unavailable until a
              validated calibration workflow is added.
            </p>
          </>
        )}
        <button className="primary">Save settings</button>
        <p role="status">{message}</p>
      </form>
    </div>
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
            Latest simulated sessions. Open a project to inspect another source.
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
