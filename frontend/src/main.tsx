import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Link,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  Cable,
  Check,
  Copy,
  ChevronRight,
  Database,
  FlaskConical,
  Info,
  Layers,
  LayoutDashboard,
  Radio,
  Plus,
  Power,
  Menu,
  MoreHorizontal,
  PanelRightClose,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
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
import "@xyflow/react/dist/style.css";
import type { Answer, Component, Event as ProjectEvent, Project, State } from "./types";
import { api, display, strings, time } from "./types";
import { ProjectMonitoringSettings } from "./MonitoringSettings";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./index.css";
import { ThemeProvider, ThemeSwitcher } from "./theme";
import { Dialog, Tabs } from "./ui";

const summaryTime = (value: number) => new Date(value * 1000).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const emailStatus = (status: string, enabled: boolean) => status === "not_configured" && !enabled ? "off" : status.replace("_", " ");

const DigitalTwin = lazy(() => import("./features/digital-twin/DigitalTwin").then((module) => ({ default: module.DigitalTwin })));

function Mark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 48 40"
      width="32"
      height="32"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="brand-mark-physical"
        d="M2.5 36 17.6 4.3A2 2 0 0 1 19.4 3H24l-4.2 9L8.9 36H2.5Z"
      />
      <path
        className="brand-mark-digital"
        d="M24.1 3h4.5a2 2 0 0 1 1.8 1.2L45.5 36h-6.4L20.2 12l3.9-9Z"
      />
      <path className="brand-mark-physical" d="M9.8 24h10.7v3H8.4l1.4-3Z" />
      <path className="brand-mark-digital" d="M27.5 24h10.7l1.4 3H27.5v-3Z" />
      <path className="brand-mark-physical" d="m17.5 25.5 5-5v10l-5-5Z" />
      <path className="brand-mark-digital" d="m23.5 20.5 5 5-5 5v-10Z" />
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

type ServiceHealth = {
  mqtt: boolean;
  agent_configured: boolean;
  agent_available: boolean;
  email_configured: boolean;
  email_default_recipient_configured: boolean;
  mqtt_rejections: number;
};

type ProjectContext = { projectId: string; mode: string };

type CommandItem = {
  id: string;
  label: string;
  meta: string;
  path: string;
  kind: "project" | "device" | "event" | "settings";
};

const sessionLabel = (mode: string) =>
  mode === "live" ? "Live" : mode === "simulated" ? "Simulation" : mode === "replay" ? "Replay" : mode;

function useDropdownClass(open: boolean) {
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      setClosing(false);
    } else if (wasOpen.current) {
      setClosing(true);
      const closeMs = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur"),
      ) || 150;
      timer = setTimeout(() => setClosing(false), closeMs);
    }
    wasOpen.current = open;
    return () => clearTimeout(timer);
  }, [open]);
  return open ? "is-open" : closing ? "is-closing" : "";
}

function SystemSwitcher({
  open,
  onToggle,
  onClose,
  states,
  selectedProjectId,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  states: State[];
  selectedProjectId: string | null;
}) {
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const navigate = useNavigate();
  const dropdownClass = useDropdownClass(open);
  const selected = states.find((state) => state.project.id === selectedProjectId);
  const searchable = states.length > 7;
  const projects = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? states.filter((state) => `${state.project.name} ${state.project.id} ${state.devices.map((device) => device.id).join(" ")}`.toLowerCase().includes(value)) : states;
  }, [query, states]);
  const selectedOptionIndex = selectedProjectId ? Math.max(1, states.findIndex((state) => state.project.id === selectedProjectId) + 1) : 0;
  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => {
      if (searchable) search.current?.focus();
      else options.current[selectedOptionIndex]?.focus();
    });
  }, [open, searchable, selectedOptionIndex]);
  const choose = (path: string) => {
    navigate(path);
    onClose();
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const moveFocus = (event: React.KeyboardEvent, direction: 1 | -1) => {
    event.preventDefault();
    const available = options.current.filter((option): option is HTMLButtonElement => Boolean(option));
    if (!available.length) return;
    const current = available.indexOf(document.activeElement as HTMLButtonElement);
    available[(current + direction + available.length) % available.length]?.focus();
  };
  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") moveFocus(event, 1);
    if (event.key === "ArrowUp") moveFocus(event, -1);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      trigger.current?.focus();
    }
  };
  const projectState = (state: State) => {
    if (state.devices.some((device) => device.reporting)) return { label: "Live", tone: "live" };
    if (state.latest) return { label: "Stale", tone: "stale" };
    return { label: "Unavailable", tone: "unavailable" };
  };
  return <div className="system-switcher">
    <button ref={trigger} className="system-switcher-trigger" type="button" onClick={onToggle} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); if (!open) onToggle(); } }} aria-haspopup="menu" aria-expanded={open}>
      <span className="system-switcher-mark"><Mark/></span>
      <span>{selected?.project.name || "All Systems"}</span>
      <ChevronRight size={14}/>
    </button>
    {(open || dropdownClass === "is-closing") && (
      <button className="topbar-popover-dismiss" type="button" aria-label="Close system switcher" onClick={onClose}/>
    )}
    <section className={`t-dropdown topbar-popover system-switcher-menu ${dropdownClass}`} data-origin="top-left" role="menu" aria-label="System and project navigation" aria-hidden={!open} inert={!open ? true : undefined} onKeyDown={onMenuKeyDown}>
      {searchable && <label className="system-switcher-search"><Search size={15}/><input ref={search} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") moveFocus(event, 1); }} placeholder="Find a project" aria-label="Find a project"/></label>}
      <span className="switcher-group-label">All systems</span>
      <button ref={(element) => { options.current[0] = element; }} className={`system-switcher-option ${!selectedProjectId ? "selected" : ""}`} type="button" role="menuitemradio" aria-checked={!selectedProjectId} onClick={() => choose("/")}>
        <span className="switcher-option-icon"><LayoutDashboard size={15}/></span>
        <span><strong>All Systems</strong><small>{states.length} configured {states.length === 1 ? "project" : "projects"}</small></span>
        {!selectedProjectId && <Check size={15}/>}
      </button>
      <span className="switcher-group-label">Projects</span>
      <div className="system-switcher-projects">
        {projects.length ? projects.map((state, index) => {
          const status = projectState(state);
          const isSelected = state.project.id === selectedProjectId;
          return <button key={state.project.id} ref={(element) => { options.current[index + 1] = element; }} className={`system-switcher-option ${isSelected ? "selected" : ""}`} type="button" role="menuitemradio" aria-checked={isSelected} onClick={() => choose(`/projects/${state.project.id}`)}>
            <span className={`switcher-status ${status.tone}`}/>
            <span><strong>{state.project.name}</strong><small>{status.label} · {state.devices.length} {state.devices.length === 1 ? "device" : "devices"}</small></span>
            {isSelected && <Check size={15}/>}
          </button>;
        }) : <p className="switcher-empty">No projects match “{query}”.</p>}
      </div>
      <Link className="system-switcher-add" to="/projects/new" onClick={onClose}><Plus size={15}/>Add project</Link>
    </section>
  </div>;
}

function CommandLauncher({
  open,
  onOpen,
  onClose,
  states,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  states: State[];
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const dropdownClass = useDropdownClass(open);
  const items = useMemo<CommandItem[]>(() => {
    const projects = states.map((state) => ({
      id: `project-${state.project.id}`,
      label: state.project.name,
      meta: "Project",
      path: `/projects/${state.project.id}`,
      kind: "project" as const,
    }));
    const devices = states.flatMap((state) =>
      state.devices.map((device) => ({
        id: `device-${state.project.id}-${device.id}`,
        label: device.id,
        meta: `Device in ${state.project.name}`,
        path: `/projects/${state.project.id}`,
        kind: "device" as const,
      })),
    );
    const events = states.flatMap((state) =>
      state.events.map((event) => ({
        id: `event-${state.project.id}-${event.id}`,
        label: event.kind.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
        meta: `${event.recovered ? "Recovered" : "Open"} event in ${state.project.name}`,
        path: "/events",
        kind: "event" as const,
      })),
    );
    return [
      ...projects,
      ...devices,
      ...events,
      { id: "settings", label: "Settings", meta: "Appearance and service availability", path: "/settings", kind: "settings" },
    ];
  }, [states]);
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return items.filter((item) => item.kind === "project" || item.kind === "settings").slice(0, 7);
    return items.filter((item) => `${item.label} ${item.meta} ${item.kind}`.toLowerCase().includes(value)).slice(0, 10);
  }, [items, query]);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  const choose = (path: string) => {
    navigate(path);
    onClose();
  };
  return (
    <div className="topbar-search-wrap">
      <button className="topbar-search-trigger" type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}>
        <Search size={16} /><span>Search</span><kbd>Ctrl K</kbd>
      </button>
      {(open || dropdownClass === "is-closing") && <button className="topbar-popover-dismiss" type="button" aria-label="Close command launcher" onClick={onClose} />}
      <div className="command-launcher-shell">
        <section className={`t-dropdown command-launcher ${dropdownClass}`} data-origin="top-right" role="dialog" aria-label="Search Agentwin" aria-hidden={!open} inert={!open ? true : undefined}>
          <label className="command-search"><Search size={18}/><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, devices, events, settings" aria-label="Search projects, devices, events, and settings"/><kbd>Esc</kbd></label>
          <div className="command-results" role="listbox" aria-label="Search results">
            {results.length ? results.map((item) => (
              <button key={item.id} type="button" role="option" aria-selected="false" onClick={() => choose(item.path)}>
                <span className={`command-kind ${item.kind}`}>{item.kind === "project" ? <Layers size={15}/> : item.kind === "device" ? <Radio size={15}/> : item.kind === "event" ? <Bell size={15}/> : <SettingsIcon size={15}/>}</span>
                <span><strong>{item.label}</strong><small>{item.meta}</small></span>
                <ChevronRight size={15}/>
              </button>
            )) : <p className="command-empty">No matching projects, devices, events, or settings.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function HealthRows({ connected, health, reporting, devices }: { connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  return <div className="system-status-rows">
    <div><span><i className={connected ? "healthy" : "down"}/>Backend</span><strong>{connected ? "Connected" : "Reconnecting"}</strong></div>
    <div><span><i className={health?.mqtt ? "healthy" : "warning"}/>MQTT broker</span><strong>{health === null ? "Checking" : health.mqtt ? "Connected" : "Disconnected"}</strong></div>
    <div><span><i className={devices > 0 && reporting < devices ? "warning" : "healthy"}/>Devices</span><strong>{devices ? `${reporting}/${devices} reporting` : "None configured"}</strong></div>
    <div><span><i className={health?.agent_available ? "healthy" : health?.agent_configured ? "down" : "warning"}/>Agent</span><strong>{health === null ? "Checking" : health.agent_available ? "Available" : health.agent_configured ? "Unreachable" : "Not configured"}</strong></div>
  </div>;
}

function SystemStatus({ open, onToggle, onClose, connected, health, reporting, devices }: { open: boolean; onToggle: () => void; onClose: () => void; connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  const dropdownClass = useDropdownClass(open);
  const healthy = connected && health?.mqtt === true && health.agent_available && (devices === 0 || reporting === devices);
  return <div className="topbar-control-wrap system-status-control">
    <button className={`topbar-system-trigger ${connected ? healthy ? "healthy" : "warning" : "down"}`} type="button" onClick={onToggle} aria-haspopup="dialog" aria-expanded={open}>
      <span className="system-status-dot"/><span>System status</span><ChevronRight size={14}/>
    </button>
    {(open || dropdownClass === "is-closing") && (
      <button className="topbar-popover-dismiss" type="button" aria-label="Close system status" onClick={onClose}/>
    )}
    <section className={`t-dropdown topbar-popover system-status-popover ${dropdownClass}`} data-origin="top-right" role="dialog" aria-label="System status details" aria-hidden={!open} inert={!open ? true : undefined}>
      <div className="popover-heading"><strong>System status</strong><span>{healthy ? "Operational" : "Attention needed"}</span></div>
      <HealthRows connected={connected} health={health} reporting={reporting} devices={devices}/>
    </section>
  </div>;
}
function App() {
  const [states, setStates] = useState<State[]>([]),
    [connected, setConnected] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [topbarPanel, setTopbarPanel] = useState<"context" | "search" | "status" | "overflow" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const route = useLocation();
  const updateProjectContext = useCallback((context: ProjectContext) => setProjectContext(context), []);
  useEffect(() => {
    if (!/^\/projects\/[^/]+$/.test(route.pathname)) setProjectContext(null);
    setTopbarPanel(null);
  }, [route.pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setTopbarPanel("search");
      } else if (event.key === "Escape") {
        setTopbarPanel(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    let stopped = false;
    const check = () => api<ServiceHealth>("/health").then((value) => { if (!stopped) setHealth(value); }).catch(() => { if (!stopped) setHealth(null); });
    check();
    const timer = window.setInterval(check, 10000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = document.querySelector("main.page");
    const motion = getComputedStyle(document.documentElement);
    const animation = page?.animate([{ opacity: .5, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: parseFloat(motion.getPropertyValue("--duration-fast")), easing: motion.getPropertyValue("--ease-smooth-out").trim() });
    return () => animation?.cancel();
  }, [route.pathname]);
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
  const devices = states.reduce((total, state) => total + state.devices.length, 0);
  const reporting = states.reduce((total, state) => total + state.devices.filter((device) => device.reporting).length, 0);
  const contextMode = projectContext ? sessionLabel(projectContext.mode) : null;
  const selectedProjectId = route.pathname.match(/^\/projects\/([^/]+)$/)?.[1] || null;
  const overflowClass = useDropdownClass(topbarPanel === "overflow");
  return (
    <div className={`app ${collapsed ? "rail-collapsed" : ""}`}><a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <Mark />
          {strings.brand}
          
        </Link>
        <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={19}/> : <Menu size={19}/>}</button>
        <nav aria-label="Main navigation" className="desktop-navigation">
          <NavLink to="/" end aria-label="Overview" title="Overview">
            <LayoutDashboard size={18} />
            <span className="nav-label">{strings.overview}</span>
          </NavLink>
          <NavLink to="/projects" aria-label="Projects" title="Projects">
            <Layers size={18} />
            <span className="nav-label">{strings.projects}</span>
            <span className="nav-count">{states.length}</span>
          </NavLink>
          <NavLink to="/events" aria-label="Events" title="Events">
            <Bell size={18} />
            <span className="nav-label">{strings.events}</span>
            {active > 0 && <span className="nav-count">{active}</span>}
          </NavLink>
          <NavLink to="/settings" aria-label="Settings" title="Settings">
            <SettingsIcon size={18} />
            <span className="nav-label">{strings.settings}</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-about"><Info size={15}/><span>About Agentwin</span></div>
          <div className="sidebar-identity">
            <Mark/>
            <div><strong>Agentwin MVP</strong><span>Every system.<br/>Its own agent.</span></div>
          </div>
          <button className="rail-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed}><Menu size={18}/><span className="nav-label">Collapse navigation</span></button>
        </div>
      </aside>
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Workspace navigation"><nav className="mobile-navigation" aria-label="Mobile navigation" onClick={() => setMenuOpen(false)}><NavLink to="/" end><LayoutDashboard size={20}/>Overview</NavLink><NavLink to="/projects"><Layers size={20}/>Projects</NavLink><NavLink to="/events"><Bell size={20}/>Events</NavLink><NavLink to="/settings"><SettingsIcon size={20}/>Settings</NavLink></nav><ThemeSwitcher/></Dialog>
      <div className="main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <SystemSwitcher open={topbarPanel === "context"} onToggle={() => setTopbarPanel(topbarPanel === "context" ? null : "context")} onClose={() => setTopbarPanel(null)} states={states} selectedProjectId={selectedProjectId}/>
          <div className="topbar-actions">
            <CommandLauncher open={topbarPanel === "search"} onOpen={() => setTopbarPanel("search")} onClose={() => setTopbarPanel(null)} states={states}/>
            <div className="topbar-desktop-actions">
              {contextMode && <span className={`session-context ${projectContext?.mode || ""}`}><Radio size={14}/>{contextMode}</span>}
              {active > 0 && <Link className="topbar-events" to="/events" aria-label={`${active} open events`}><Bell size={15}/><span>Events</span><b>{active}</b></Link>}
              <SystemStatus open={topbarPanel === "status"} onToggle={() => setTopbarPanel(topbarPanel === "status" ? null : "status")} onClose={() => setTopbarPanel(null)} connected={connected} health={health} reporting={reporting} devices={devices}/>
              <ThemeSwitcher compact/>
            </div>
            <div className="topbar-mobile-actions">
              <div className="topbar-control-wrap">
                <button className="topbar-overflow-trigger" type="button" aria-label="More workspace status" aria-haspopup="dialog" aria-expanded={topbarPanel === "overflow"} onClick={() => setTopbarPanel(topbarPanel === "overflow" ? null : "overflow")}><MoreHorizontal size={18}/>{active > 0 && <span>{active}</span>}</button>
                {(topbarPanel === "overflow" || overflowClass === "is-closing") && (
                  <button className="topbar-popover-dismiss" type="button" aria-label="Close workspace status" onClick={() => setTopbarPanel(null)}/>
                )}
                <section className={`t-dropdown topbar-popover mobile-topbar-popover ${overflowClass}`} data-origin="top-right" role="dialog" aria-label="Workspace status and preferences" aria-hidden={topbarPanel !== "overflow"} inert={topbarPanel !== "overflow" ? true : undefined}>
                  {contextMode && <div className="mobile-context-row"><span>Current source</span><strong><Radio size={14}/>{contextMode}</strong></div>}
                  {active > 0 && <Link className="mobile-event-row" to="/events"><span><Bell size={15}/>Open events</span><strong>{active}</strong></Link>}
                  <div className="popover-heading"><strong>System status</strong></div>
                  <HealthRows connected={connected} health={health} reporting={reporting} devices={devices}/>
                  <div className="mobile-theme-row"><span>Appearance</span><ThemeSwitcher compact/></div>
                </section>
              </div>
            </div>
          </div>
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
              element={<Workspace connected={connected} onContextChange={updateProjectContext} />}
            />
            <Route path="/projects/new" element={<AddProject />} />
            <Route path="/events" element={<GlobalEvents states={states} />} />
            <Route path="/settings" element={<GlobalSettings states={states} />} />
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
        <h2>{events.length ? "Needs attention" : "All systems clear"}</h2>
        <Link to="/events">
          {events.length ? "View all events" : "View event history"} <ArrowRight size={14} />
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
                    ? "Device telemetry is missing"
                    : "Configured limit breached"}
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
                {states.some(state => state.devices.some(device => device.reporting)) ? "Connected devices are reporting and no active rule currently requires attention." : states.length ? "No active event is open. Connect a registered device to begin live monitoring." : "Add a project and connect a device to begin live monitoring."}
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
  const visibleFields = Object.entries(selected.project.graph.fields).filter(([key]) => isVisibleMetric(key));
  const field = selected.project.graph.fields[metricKey] && isVisibleMetric(metricKey) ? metricKey : visibleFields[0]?.[0] || selected.project.graph.primary_field;
  const metric = selected.project.graph.fields[field];
  const numeric = metric.data_type === "number";
  const limit = windowSize === "all" ? selected.readings.length : Number(windowSize);
  const rows = selected.readings.slice(-limit).map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const discreteTransitions = rows.filter((row,index,all)=>index===0 || row.value!==all[index-1].value);
  const reporting = states.flatMap((state) => state.devices).filter((device) => device.reporting).length;
  const devices = states.flatMap((state) => state.devices).length;
  const pending = states.flatMap((state) => state.actions).filter((action) => action.status === "requested").length;
  return <section className="analytics-grid"><div className="panel analytics-primary"><div className="panel-heading"><div><h2>Telemetry history</h2><p>Stored observations only; missing samples remain gaps.</p></div><div className="compact-filters"><label>Project<select value={selected.project.id} onChange={(event) => { setProjectId(event.target.value); setMetricKey(""); }}><option value={selected.project.id}>{selected.project.name}</option>{states.filter((state) => state.project.id !== selected.project.id).map((state) => <option value={state.project.id} key={state.project.id}>{state.project.name}</option>)}</select></label><label>Metric<select value={field} onChange={(event) => setMetricKey(event.target.value)}>{visibleFields.map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}</select></label><label>Window<select value={windowSize} onChange={(event) => setWindowSize(event.target.value)}><option value="30">Latest 30</option><option value="90">Latest 90</option><option value="all">All stored</option></select></label></div></div>{numeric && rows.length ? <div className="overview-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="received" tickFormatter={(value) => time(Number(value))} minTickGap={40}/><YAxis width={48} unit={metric.unit}/><Tooltip labelFormatter={(value) => time(Number(value))} formatter={(value) => [`${display(value)} ${metric.unit}`, metric.label]}/><Line dataKey="value" stroke="var(--chart-line)" isAnimationActive={false} strokeWidth={2} dot={false} connectNulls={false}/></LineChart></ResponsiveContainer></div> : rows.length ? <div className="discrete-history"><div className="discrete-summary"><div><span>Current state</span><strong>{metricValue(rows.at(-1)?.value,metric.precision)}</strong></div><div><span>State changes</span><strong>{Math.max(0,discreteTransitions.length-1)}</strong></div><div><span>Samples in view</span><strong>{rows.length}</strong></div></div><div className="state-track" aria-label={`${metric.label} state history`}>{rows.map((row,index)=><i key={`${row.received}-${index}`} className={row.value===true?"on":row.value===false?"off":"categorical"} title={`${time(row.received)} · ${metricValue(row.value,metric.precision)}`}/>)}</div><div className="state-track-labels"><span>{time(rows[0].received)}</span><span>{time(rows.at(-1)?.received)}</span></div><div className="discrete-changes"><h3>Recent changes</h3>{discreteTransitions.slice().reverse().slice(0,5).map((row,index)=><div key={`${row.received}-${index}`}><span>{time(row.received)}</span><strong>{metricValue(row.value,metric.precision)}</strong></div>)}</div></div> : <div className="chart-empty"><Activity/><strong>No readings yet</strong><p>The visualization appears after the selected project reports telemetry.</p></div>}</div><aside className="panel operations-panel"><div className="panel-heading"><div><h2>Operational status</h2><p>Across configured projects.</p></div></div><div className="operation-count"><strong>{reporting}/{devices}</strong><span>devices reporting</span></div><div className="status-breakdown"><div><span><i className="status-dot good"/>Reporting</span><b>{reporting}</b></div><div><span><i className="status-dot"/>Unavailable</span><b>{devices-reporting}</b></div><div><span><i className="status-dot pending"/>Pending actions</span><b>{pending}</b></div></div><Link className="button tertiary" to="/events">Review operational events <ArrowRight size={15}/></Link></aside></section>;
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
function Workspace({ connected, onContextChange }: { connected: boolean; onContextChange: (context: ProjectContext) => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [agentWidth, setAgentWidth] = useState(() => Number(localStorage.getItem("agentwin-agent-width")) || 380);
  const [agentCollapsed, setAgentCollapsed] = useState(() => window.matchMedia("(max-width: 760px)").matches || localStorage.getItem("agentwin-collapsed") === "true");
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
  useEffect(() => {
    if (state) onContextChange({ projectId: state.project.id, mode: state.session.mode });
  }, [state?.project.id, state?.session.mode, onContextChange]);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 760px)");
    const adapt = () => setAgentCollapsed(mobile.matches || localStorage.getItem("agentwin-collapsed") === "true");
    mobile.addEventListener("change", adapt);
    return () => mobile.removeEventListener("change", adapt);
  }, []);
  useEffect(() => {
    if (agentCollapsed) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.matchMedia("(max-width: 760px)").matches) setAgentCollapsed(true);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [agentCollapsed]);
  if (!state)
    return (
      <main className="page">
        <div className="empty">{error || "Loading project…"}</div>
      </main>
    );
  const p = state.project;
  const removeProject = async () => {
    setDeleting(true);
    try { await api(`/projects/${p.id}`, {}, "DELETE"); navigate("/projects"); }
    catch (failure) { setError((failure as Error).message); setDeleteOpen(false); } finally { setDeleting(false); }
  };
  const startAgentResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = agentWidth;
    let currentWidth = agentWidth;
    document.body.classList.add("resizing-agent");
    const move = (moveEvent: PointerEvent) => {
      currentWidth = Math.max(320, Math.min(640, startWidth + startX - moveEvent.clientX));
      setAgentWidth(currentWidth);
    };
    const stop = () => {
      document.body.classList.remove("resizing-agent");
      localStorage.setItem("agentwin-agent-width", String(currentWidth));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const nudgeAgentWidth = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextWidth = Math.max(320, Math.min(640, agentWidth + (event.key === "ArrowLeft" ? 20 : -20)));
    setAgentWidth(nextWidth);
    localStorage.setItem("agentwin-agent-width", String(nextWidth));
  };
  const toggleAgent = () => {
    const next = !agentCollapsed;
    setAgentCollapsed(next);
    if (!window.matchMedia("(max-width: 760px)").matches) localStorage.setItem("agentwin-collapsed", String(next));
  };
  return (
    <main className="page project-page"><Dialog open={deleteOpen} onClose={() => { if (!deleting) setDeleteOpen(false); }} title="Delete project?"><p>Delete {p.name} and all of its stored sessions, readings, events, and actions?</p><p className="danger-note">This cannot be undone.</p><div className="dialog-actions"><button autoFocus onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</button><button className="danger" disabled={deleting} onClick={removeProject}>{deleting ? "Deleting?" : "Delete project"}</button></div></Dialog>
      <Link className="back" to="/projects">
        <ArrowDownRight size={14} /> All projects
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{p.template.replaceAll("_", " ")} project</div>
          <h1>{p.name}</h1>
          <ProjectId value={p.id} />
          {p.arabic_title && (
            <p className="project-arabic" dir="rtl" lang="ar">
              {p.arabic_title}
            </p>
          )}
        </div>
        <div className="project-actions">
          <label className="source-picker">Session<select value={state.session.id} onChange={(event) => setSid(event.target.value)}>{state.sessions.map((session) => <option key={session.id} value={session.id}>{session.mode} · {time(session.created)}</option>)}</select></label>
          <Link className="button ghost project-manage" to={`/settings?project=${p.id}`}>Monitoring settings</Link>
          <button className="ghost project-manage" onClick={() => setDeleteOpen(true)}>Manage project</button>
        </div>
      </div>
      <div className="status-line">
        <Badge>{state.session.mode} session</Badge>
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
      <div className={`workspace-grid ${agentCollapsed ? "win-collapsed" : ""}`} style={{ "--agent-width": `${agentWidth}px` } as React.CSSProperties}>
        <section className="workspace-main">
          <Tabs value={tab} onChange={setTab} items={[["overview", "Overview"], ["readings", "Live readings"], ["twin", "Digital twin"], ["events", "Events & history"], ["controls", "Controls"]]}/>
          <div className="tab-content" id="project-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {tab === "overview" && <ProjectOverview state={state} />}
            {tab === "readings" && <Readings state={state} />}
            {tab === "twin" && (
              <Suspense fallback={<div className="chart-empty"><Activity/><strong>Loading Live Twin</strong><p>Preparing the operational scene.</p></div>}><DigitalTwin state={state} selectedId={selectedComponentId} onSelect={setSelectedComponentId} refresh={refresh} /></Suspense>
            )}{" "}
            {tab === "events" && <Events state={state} refresh={refresh} />}{" "}
            {tab === "controls" && <ControlsPanel state={state} refresh={refresh} />}
          </div>
        </section>
        {!agentCollapsed && <button className="workspace-resizer" type="button" aria-label="Resize agent panel" title="Drag to resize; use arrow keys; double-click to reset" onPointerDown={startAgentResize} onKeyDown={nudgeAgentWidth} onDoubleClick={() => { setAgentWidth(380); localStorage.setItem("agentwin-agent-width", "380"); }} />}
        <aside className={`workspace-agent ${agentCollapsed ? "is-collapsed" : "is-expanded"}`} aria-label="Win project assistant" onKeyDown={(event) => { if (event.key === "Escape" && !agentCollapsed) toggleAgent(); }}>
          {!agentCollapsed && <button className="win-drawer-backdrop" type="button" aria-label="Close Win" onClick={toggleAgent}/>}
          {agentCollapsed && <button className="win-rail" type="button" aria-label="Open Win assistant" aria-expanded="false" onClick={toggleAgent}><img src="/assets/win.webp" alt=""/><strong>Win</strong></button>}
          <div className="win-panel-wrap" hidden={agentCollapsed}><AgentPanel key={`${state.project.id}:${state.session.id}`} state={state} onCollapse={toggleAgent}/></div>
        </aside>
      </div>
    </main>
  );
}

export function LegacyProjectOverview({ state }: { state: State }) {
  const p = state.project;
  return <div className="project-overview"><div className="stats">{Object.entries(p.graph.fields).map(([key, field]) => <Stat key={key} label={field.label} value={<>{display(state.latest?.readings[key])}<em>{field.unit}</em></>} hint={state.latest ? `Received ${time(state.latest.received)}` : "No reported value"} icon={<Activity />}/>)}</div><div className="overview-split"><section className="panel"><h3>Devices</h3>{state.devices.map((device) => <div className="detail-relation" key={device.id}><span>{device.id} · {device.connector}</span><strong>{device.reporting ? "reporting" : device.online ? "connected" : "unavailable"}</strong></div>)}</section><section className="panel"><h3>Recent actions</h3>{state.actions.length ? state.actions.slice(0, 5).map((action) => <div className="detail-relation" key={action.id}><span>{action.action.replace(":", " ")}</span><strong>{action.status.replace("_", " ")}</strong></div>) : <p className="detail-empty">No commands have been requested.</p>}</section></div><AgentPanel state={state}/></div>;
}

function ProjectOverview({ state }: { state: State }) {
  const p = state.project;
  const presentMetric = (key: string, value: unknown, unit: string) => {
    if (typeof value === "boolean") return <span className={`state-pill ${value ? "on" : "off"}`}><Power size={13}/>{value ? "On" : "Off"}</span>;
    if (key.includes("command_id") && typeof value === "string") return <CompactId value={value}/>;
    return <>{display(value)}<em>{unit}</em></>;
  };
  return <div className="project-overview"><div className="overview-main"><div className="stats overview-metrics">{Object.entries(p.graph.fields).map(([key, field]) => <Stat key={key} label={field.label} value={presentMetric(key, state.latest?.readings[key], field.unit)} hint={state.field_status[key]?.received ? `Received ${time(state.field_status[key].received)}` : "No reported value"} icon={<Activity />}/>)}</div><div className="overview-split"><section className="panel overview-card"><div className="overview-card-heading"><h3>Devices</h3><span>{state.devices.filter(device=>device.reporting).length}/{state.devices.length} reporting</span></div>{state.devices.map((device) => <div className="overview-row" key={device.id}><div><strong>{device.id}</strong><small>{device.connector.toUpperCase()} connector</small></div><span className={`status-pill ${device.reporting ? "good" : device.online ? "waiting" : "offline"}`}><i/>{device.reporting ? "Reporting" : device.online ? "Connected" : "Unavailable"}</span></div>)}</section><section className="panel overview-card"><div className="overview-card-heading"><h3>Recent actions</h3><span>Latest {Math.min(state.actions.length,5)}</span></div>{state.actions.length ? state.actions.slice(0, 5).map((action) => <div className="overview-row action-row" key={action.id}><div><strong>{humanAction(action.action)}</strong><CompactId value={action.id}/></div><span className={`action-status ${action.status}`}>{action.status.replaceAll("_", " ")}</span></div>) : <p className="detail-empty">No commands have been requested.</p>}</section></div></div></div>;
}

function humanAction(value: string) {
  const [action, raw] = value.split(":");
  if (action === "set_led") return raw === "true" ? "Turn LED on" : "Turn LED off";
  if (action === "acknowledge_event") return "Acknowledge event";
  return action.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

function CompactId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  return <span className="compact-id" title={value}><code>{value.slice(0, 8)}…</code><button type="button" onClick={copy} aria-label={`Copy ${value}`} title="Copy full ID"><Copy size={12}/></button>{copied&&<small>Copied</small>}</span>;
}

function ProjectId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  return <div className="project-id-line"><span>Project ID</span><code>{value}</code><button type="button" onClick={copy} aria-label="Copy project ID" title="Copy project ID"><Copy size={13}/>{copied ? "Copied" : "Copy"}</button></div>;
}

function Readings({ state }: { state: State }) {
  const [field, setField] = useState(state.project.graph.primary_field);
  const [transitionLimit, setTransitionLimit] = useState(5);
  const metric = state.project.graph.fields[field];
  const rows = state.readings.map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const transitions = state.readings.filter((reading,index,all)=>index===0 || reading.readings[field]!==all[index-1].readings[field]).reverse();
  return <div className="readings-view"><div className="chart-header"><div><h3>Readings</h3><p>{metric.data_type === "number" ? "Stored observations for this project and selected session." : "State changes only; repeated samples with the same value are collapsed."}</p></div><label>Metric<select value={field} onChange={(event) => {setField(event.target.value);setTransitionLimit(5);}}>{Object.entries(state.project.graph.fields).map(([key, item]) => <option value={key} key={key}>{item.label} {item.unit}</option>)}</select></label></div>{!rows.length ? <div className="chart-empty"><Activity/><strong>No readings in this session</strong><p>Readings appear here when the selected source reports telemetry. Stored values from other sessions remain separate.</p></div> : metric.data_type === "number" ? <div className="metric-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><Line dataKey="value" stroke="var(--chart-line)" isAnimationActive={false} dot={false} connectNulls={false}/><XAxis dataKey="received" tickFormatter={(value) => time(Number(value))}/><YAxis/><Tooltip labelFormatter={(value) => time(Number(value))}/></LineChart></ResponsiveContainer></div> : <><div className="transition-list">{transitions.slice(0,transitionLimit).map((reading) => <div key={reading.id}><span>{time(reading.received)}</span><strong>{metricValue(reading.readings[field], metric.precision)}</strong></div>)}</div>{transitions.length>5&&<button className="transition-more" type="button" onClick={()=>setTransitionLimit(transitionLimit>=transitions.length?5:Math.min(transitionLimit+10,transitions.length))}>{transitionLimit>=transitions.length?"Show less":`Show more (${transitions.length-transitionLimit})`}</button>}</>}</div>;
}

function ControlsPanel({ state, refresh }: { state: State; refresh: () => void }) {
  const [message, setMessage] = useState("");
  const controls = state.project.graph.components.flatMap((component) => (component.controls || []).map((control) => ({ component, control })));
  const run = async (component: Component, action: string, value: boolean) => { try { const result = await api<{ id: string; status: string }>(`/projects/${state.project.id}/sessions/${state.session.id}/actions`, { component_id: component.id, action, value }); setMessage(`Action ${result.id.slice(0, 8)} is ${result.status}. It completes only after matching telemetry.`); refresh(); } catch (error) { setMessage((error as Error).message); } };
  return <div className="controls-view"><div className="view-heading"><div><h3>Hardware controls</h3><p>Commands remain pending until the target device reports the expected state.</p></div></div>{controls.length ? controls.map(({ component, control }) => { const latestAction = state.actions.find((action) => action.target === component.id); const current = state.latest?.readings[control.expected.field]; const ready = controlReady(state, state.project, control); return <section className="panel control-card" key={`${component.id}-${control.action}`}><div className="control-heading"><div><h4>{component.name}</h4><p>{control.label}</p></div><Badge tone={latestAction?.status === "completed" ? "success" : latestAction?.status === "requested" ? "warning" : ""}>{latestAction?.status?.replace("_", " ") || "ready"}</Badge></div><div className="control-state"><span>Reported state<strong>{metricValue(current, 0)}</strong></span><span>Verification field<strong>{control.expected.field}</strong></span><span>Last request<strong>{latestAction ? latestAction.action.replace(":", " ") : "None"}</strong></span></div><div className="component-actions"><button className="primary" disabled={!ready || latestAction?.status === "requested"} onClick={() => run(component, control.action, true)}>Turn on</button><button className="secondary-button" disabled={!ready || latestAction?.status === "requested"} onClick={() => run(component, control.action, false)}>Turn off</button></div>{latestAction?.status === "requested" && <p className="verification-note"><Activity size={14}/> Waiting for matching device telemetry. The reported state has not been confirmed yet.</p>}{!ready && <p className="detail-empty">Connect the configured live transport before controlling this component.</p>}</section>; }) : <div className="empty"><ShieldCheck/><h3>No hardware controls configured</h3><p>This project is read-only until a device capability and verification contract are registered.</p></div>}<p role="status">{message}</p></div>;
}

function WinAvatar({ className = "" }: { className?: string }) {
  return <img className={`win-avatar ${className}`} src="/assets/win.webp" alt="" width="44" height="44" decoding="async"/>;
}

function AgentPanel({ state, onCollapse }: { state: State; onCollapse?: () => void }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const ask = async (value = question) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setAgentError("");
    setAnswer(null);
    setSubmittedQuestion(value);
    try {
      setAnswer(await api<Answer>(`/projects/${state.project.id}/sessions/${state.session.id}/agent`, { question: value }));
    } catch (error) {
      setAgentError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const prompts = ["What is the current state?", "What changed recently?", "Explain active events", "Which actions are permitted?"];
  const latestSummary = state.summaries?.[0];
  return <section className="panel agent-mini win-panel" aria-label="Win project assistant">
    <div className="agent-mini-heading win-heading">
      <WinAvatar/>
      <div className="win-heading-copy"><h3>Win</h3><p>Project AI Assistant</p></div>
      {onCollapse && <button className="win-collapse" type="button" aria-label="Collapse Win assistant" title="Collapse Win" onClick={onCollapse}><PanelRightClose size={17}/></button>}
    </div>
    <div className="agent-context win-context">
      <span>Project context</span>
      <strong title={state.project.name}>{state.project.name}</strong>
      <small><i className={`win-status-dot ${state.status === "reporting" ? "is-reporting" : ""}`}/>{sessionLabel(state.session.mode)} session <span aria-hidden="true">·</span> {state.status}</small>
    </div>
    <section className="win-summary" aria-label="Latest scheduled summary">
      <div className="win-summary-heading"><div className="win-summary-brand"><Mark/><strong>Agentwin summary</strong></div><span>{state.project.monitoring.summary_interval_minutes} min</span></div>
      {latestSummary ? <><time dateTime={new Date(latestSummary.period_end * 1000).toISOString()}>{summaryTime(latestSummary.period_end)}</time><p>{latestSummary.body}</p><div className="win-summary-footer"><span>{latestSummary.source === "local_model" ? "AI-assisted" : "Evidence summary"} · Email {emailStatus(latestSummary.email_status, state.project.monitoring.summary_email_enabled)}</span><Link to="/events">View in Events</Link></div></> : <p className="win-summary-pending">{state.project.monitoring.summary_enabled ? "The first live summary will appear after the next interval." : "Summaries are off for this project."}</p>}
    </section>
    <div className="win-suggestions">
      <span className="win-section-label">Suggested questions</span>
      <div className="agent-prompts">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div>
    </div>
    {!submittedQuestion && !busy && !agentError && !answer && <div className="win-empty-state">
      <WinAvatar/>
      <strong>Ask Win about this project</strong>
      <p>Explore readings, events, and permitted actions in this session.</p>
    </div>}
    {(submittedQuestion || busy || agentError || answer) && <div className="win-conversation" role="log" aria-label="Win conversation" aria-live="polite">
      {submittedQuestion && <div className="win-operator"><span>Operator</span><p>{submittedQuestion}</p></div>}
      {busy && <div className="win-assistant win-thinking"><WinAvatar/><div><span>Win</span><p>Checking project evidence…</p></div></div>}
      {agentError && <div className="win-error" role="alert"><p>{agentError}</p><button type="button" onClick={() => void ask(submittedQuestion)}>Retry</button></div>}
      {answer && <div className="win-assistant"><WinAvatar/><div className={`agent-answer win-response ${answer.available ? "" : "unavailable"}`}>
        <span>Win</span>
        <div><span>Finding</span><strong>{answer.finding}</strong></div>
        {answer.evidence.length > 0 && <div className="win-evidence"><span>Evidence</span>{answer.evidence.slice(0, 3).map((item) => <small key={item.id}>{item.id} · {time(item.timestamp)}</small>)}{answer.evidence.length > 3 && <details><summary>Show {answer.evidence.length - 3} more references</summary>{answer.evidence.slice(3).map((item) => <small key={item.id}>{item.id} · {time(item.timestamp)}</small>)}</details>}</div>}
        <div><span>Uncertainty</span><p>{answer.uncertainty}</p></div>
        <div><span>Next step</span><p>{answer.next_step}</p></div>
      </div></div>}
    </div>}
    <div className="agent-question win-composer">
      <textarea aria-label="Ask Win about this system" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="Ask Win about this system..." disabled={busy}/>
      <button type="button" onClick={() => void ask()} disabled={busy || !question.trim()} aria-label="Send question to Win" title="Send question"><Send size={17}/></button>
    </div>
    <p className="agent-guardrail">Actions require backend permission and operator confirmation. Device telemetry verifies completion.</p>
  </section>;
}

export function LegacyAddProject() {
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
type DraftComponent = { component_id: string; component_type: "led" | "temperature" | "humidity" | "analog" | "readonly"; label: string; device_id: string; pin: string; field_key: string; field_type: "number" | "boolean" | "categorical"; unit: string; precision: number; freshness_seconds: number };
const componentPreset = (template: string, device: string, freshness: number): DraftComponent[] => {
  const presets: Record<string, Omit<DraftComponent, "device_id" | "freshness_seconds">[]> = {
    led: [{component_id:"led",component_type:"led",label:"External LED",pin:"D7",field_key:"led_on",field_type:"boolean",unit:"",precision:0}],
    temperature: [{component_id:"temperature",component_type:"temperature",label:"Temperature",pin:"A5",field_key:"temperature_c",field_type:"number",unit:"°C",precision:2}],
    water: [{component_id:"water-level",component_type:"analog",label:"Water level",pin:"A5",field_key:"water_level_raw",field_type:"number",unit:"count",precision:0}],
    connectivity: [{component_id:"rf-detector",component_type:"analog",label:"Detector output",pin:"A5",field_key:"rf_detector_raw",field_type:"number",unit:"count",precision:0}],
    generic: [{component_id:"sensor",component_type:"readonly",label:"Sensor reading",pin:"A5",field_key:"sensor_value",field_type:"number",unit:"value",precision:2}],
  }; return (presets[template] || presets.generic).map((item) => ({...item, device_id:device, freshness_seconds:freshness}));
};
function AddProject() {
  type DraftDevice = { device_id:string; connector:"usb"|"mqtt"; serial_port:string; baud_rate:number };
  const steps=["Name & template","Devices","Components","Fields","Freshness","Review"], navigate=useNavigate();
  const [step,setStep]=useState(0), [saving,setSaving]=useState(false), [message,setMessage]=useState("");
  const [form,setForm]=useState({name:"",template:"generic",freshness_seconds:8,interval_seconds:1,retention_days:30});
  const [devices,setDevices]=useState<DraftDevice[]>([{device_id:"device-01",connector:"usb",serial_port:"",baud_rate:115200}]);
  const [components,setComponents]=useState<DraftComponent[]>(componentPreset("generic","device-01",8));
  const patchDevice=(i:number,p:Partial<DraftDevice>)=>setDevices(devices.map((v,n)=>n===i?{...v,...p}:v));
  const patchComponent=(i:number,p:Partial<DraftComponent>)=>setComponents(components.map((v,n)=>n===i?{...v,...p}:v));
  const chooseTemplate=(template:string)=>{setForm({...form,template});setComponents(componentPreset(template,devices[0].device_id,form.freshness_seconds));};
  const save=async(e:React.FormEvent)=>{e.preventDefault();if(step<steps.length-1){setStep(step+1);return;} setSaving(true);setMessage("");try{const [primary,...extra]=devices;const project=await api<Project>("/projects",{...form,device_id:primary.device_id,connector:primary.connector,serial_port:primary.serial_port||null,mapping:{field:components[0]?.field_key||"sensor_value",unit:components[0]?.unit||"value"},devices:extra.map(d=>({...d,serial_port:d.serial_port||null})),components:components.map(c=>({...c,pin:c.pin||null})),cable_description:"Configured during project onboarding"});navigate(`/projects/${project.id}`);}catch(error){setMessage((error as Error).message);setSaving(false);}};
  return <main className="page onboarding-page"><div className="page-heading"><div><h1>Add a project</h1><p>Build one scoped hardware system from registered devices, components, fields, and controls.</p></div></div><ol className="stepper setup-stepper">{steps.map((label,i)=><li aria-current={i===step ? "step" : undefined} className={i===step?"active":i<step?"complete":""} key={label}><span>{i<step?<Check size={14}/>:i+1}</span>{label}</li>)}</ol><form className="panel onboarding" onSubmit={save}>
  {step===0&&<div className="form-step"><div className="form-step-heading"><h2>Project identity</h2><p>The template is an editable starting point, not a fixed project.</p></div><label>Project name<input required autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Greenhouse bench"/></label><label>Starting template<select value={form.template} onChange={e=>chooseTemplate(e.target.value)}><option value="generic">Generic sensor</option><option value="led">LED output</option><option value="temperature">Temperature</option><option value="water">Water level</option><option value="connectivity">Connectivity / RF</option></select></label></div>}
  {step===1&&<div className="form-step"><div className="form-step-heading"><h2>Registered devices</h2><p>Each identity owns a transport and a set of fields.</p></div>{devices.map((d,i)=><div className="extra-device" key={i}><label>Device ID<input required value={d.device_id} onChange={e=>{patchDevice(i,{device_id:e.target.value});setComponents(components.map(c=>c.device_id===d.device_id?{...c,device_id:e.target.value}:c));}}/></label><label>Transport<select value={d.connector} onChange={e=>patchDevice(i,{connector:e.target.value as DraftDevice["connector"]})}><option value="usb">USB gateway</option><option value="mqtt">Wi-Fi MQTT</option></select></label><label>{d.connector==="usb"?"Serial port":"Broker route"}<input value={d.serial_port} disabled={d.connector==="mqtt"} placeholder="COM5" onChange={e=>patchDevice(i,{serial_port:e.target.value})}/></label>{i>0&&<button type="button" className="tertiary" onClick={()=>setDevices(devices.filter((_,n)=>n!==i))}>Remove</button>}</div>)}<button type="button" className="secondary-button" onClick={()=>setDevices([...devices,{device_id:`device-${devices.length+1}`,connector:"usb",serial_port:"",baud_rate:115200}])}><Plus size={15}/> Add device</button></div>}
  {step===2&&<div className="form-step"><div className="form-step-heading"><h2>Components</h2><p>Add only hardware or logical sources the firmware will report.</p></div>{components.map((c,i)=><div className="extra-device" key={i}><label>Label<input value={c.label} onChange={e=>patchComponent(i,{label:e.target.value})}/></label><label>Type<select value={c.component_type} onChange={e=>patchComponent(i,{component_type:e.target.value as DraftComponent["component_type"]})}><option value="led">LED</option><option value="analog">Analog sensor</option><option value="temperature">Temperature</option><option value="humidity">Humidity</option><option value="readonly">Read only</option></select></label><label>Device<select value={c.device_id} onChange={e=>patchComponent(i,{device_id:e.target.value})}>{devices.map(d=><option key={d.device_id}>{d.device_id}</option>)}</select></label><label>Pin<input value={c.pin} placeholder="D7 or A5" onChange={e=>patchComponent(i,{pin:e.target.value})}/></label><button type="button" className="tertiary" onClick={()=>setComponents(components.filter((_,n)=>n!==i))}>Remove</button></div>)}<button type="button" className="secondary-button" onClick={()=>setComponents([...components,{component_id:`component-${components.length+1}`,component_type:"analog",label:"Analog input",device_id:devices[0].device_id,pin:"A5",field_key:`analog_${components.length+1}`,field_type:"number",unit:"count",precision:0,freshness_seconds:form.freshness_seconds}])}><Plus size={15}/> Add component</button></div>}
  {step===3&&<div className="form-step"><div className="form-step-heading"><h2>Telemetry fields</h2><p>These keys must match the JSON emitted by firmware.</p></div>{components.map((c,i)=><div className="extra-device" key={i}><label>Component ID<input required value={c.component_id} onChange={e=>patchComponent(i,{component_id:e.target.value})}/></label><label>JSON field<input required value={c.field_key} onChange={e=>patchComponent(i,{field_key:e.target.value})}/></label><label>Type<select value={c.field_type} onChange={e=>patchComponent(i,{field_type:e.target.value as DraftComponent["field_type"]})}><option value="number">Number</option><option value="boolean">Boolean</option><option value="categorical">Text</option></select></label><label>Unit<input value={c.unit} onChange={e=>patchComponent(i,{unit:e.target.value})}/></label></div>)}</div>}
  {step===4&&<div className="form-step"><div className="form-step-heading"><h2>Timing and retention</h2><p>Freshness is the maximum silence before a field becomes stale.</p></div><label>Sample interval (seconds)<input type="number" min="1" value={form.interval_seconds} onChange={e=>setForm({...form,interval_seconds:Number(e.target.value)})}/></label><label>Default freshness (seconds)<input type="number" min="3" value={form.freshness_seconds} onChange={e=>setForm({...form,freshness_seconds:Number(e.target.value)})}/></label><label>Reading retention (days)<input type="number" min="1" max="3650" value={form.retention_days} onChange={e=>setForm({...form,retention_days:Number(e.target.value)})}/></label></div>}
  {step===5&&<div className="form-step"><div className="form-step-heading"><h2>Review configuration</h2><p>Creation is atomic and persists all identities and field contracts.</p></div><dl className="config-summary"><div><dt>Project</dt><dd>{form.name}</dd></div><div><dt>Template</dt><dd>{form.template}</dd></div><div><dt>Devices</dt><dd>{devices.map(d=>`${d.device_id} · ${d.connector}`).join(", ")}</dd></div><div><dt>Components</dt><dd>{components.map(c=>`${c.label} · ${c.pin||"no pin"}`).join(", ")}</dd></div><div><dt>Fields</dt><dd>{components.map(c=>c.field_key||"missing mapping").join(", ")}</dd></div><div><dt>Controls</dt><dd>{components.some(c=>c.component_type==="led")?"LED reported-state control":"Read only"}</dd></div><div><dt>Firmware</dt><dd>{components.map(c=>`${c.component_id}: ${c.component_type==="led"?"set_led handler":c.component_type==="analog"?"analogRead publisher":"field publisher"}`).join("; ")}</dd></div><div><dt>Freshness</dt><dd>{form.freshness_seconds}s · retain {form.retention_days} days</dd></div></dl></div>}
  <div className="form-actions">{step>0&&<button className="tertiary" type="button" onClick={()=>setStep(step-1)}>Back</button>}<button className="primary" disabled={saving}>{step===steps.length-1?saving?"Creating project…":"Create project":"Continue"}</button></div><p role="status">{message}</p></form></main>;
}
function metricValue(value: unknown, precision: number) {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: precision });
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

function isVisibleMetric(key: string) {
  return !key.endsWith("command_id") && !key.includes("last_command_id");
}

function controlReady(state: State, project: Project, control: { expected: { field: string } }) {
  if (state.session.mode !== "live") return false;
  const deviceId = project.graph.fields[control.expected.field]?.device_id;
  const device = state.devices.find((item) => item.id === deviceId);
  return !!device && (device.connector === "usb" ? device.online : device.reporting);
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
                <strong>{e.kind === "missing_telemetry" ? "Device silent" : "Threshold breached"}</strong>
                <small>
                  {e.evidence.rule} · {time(e.created)}
                </small>
              </span>
              <Badge tone={e.recovered ? "success" : "warning"}>
                {e.recovered ? e.evidence.close_reason ? "Closed" : "Recovered" : "Open"}
              </Badge>
            </button>
            <div className="event-actions">
              <span>
                {e.recovered
                  ? (e.evidence.close_reason ? "Closed " : "Recovery ") + time(e.recovered)
                  : "Cause unknown"} · Email {emailStatus(e.email_status, state.project.monitoring.alert_email_enabled)}
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
      <section className="event-summaries" aria-label="Scheduled live summaries"><div className="section-heading"><h3>Scheduled live summaries</h3><span>Informational, not open alerts</span></div>{state.summaries?.length ? state.summaries.map((summary) => <article className="event-summary-item" key={summary.id}><div><strong>{summaryTime(summary.period_end)}</strong><small>{Math.round((summary.period_end - summary.period_start) / 60)}-minute live window · {summary.source === "local_model" ? "AI-assisted" : "Evidence summary"}</small></div><p>{summary.body}</p><small>Email {emailStatus(summary.email_status, state.project.monitoring.summary_email_enabled)}</small></article>) : <p className="monitoring-empty">No scheduled live summaries yet.</p>}</section>
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
          <div className="evidence-status"><Badge tone={selected.recovered ? "success" : "warning"}>{selected.recovered ? selected.evidence.close_reason ? "Closed" : "Recovered" : "Open"}</Badge><span>{selected.acknowledged ? "Acknowledged" : "Not acknowledged"}</span></div>
          <h4>{selected.evidence.rule}</h4>
          <p>{selected.evidence.close_reason || (selected.kind === "missing_telemetry" ? "Telemetry stopped after this device had reported. The physical or network cause is not established." : "Two recent readings crossed the configured limit. The physical cause is not established.")}</p>
          <div className="evidence-facts"><div><span>Detected</span><strong>{time(selected.created)}</strong></div><div><span>Recovered</span><strong>{selected.recovered ? time(selected.recovered) : "Not yet"}</strong></div><div><span>Duration</span><strong>{selected.recovered ? `${Math.max(1,Math.round(selected.recovered-selected.created))} seconds` : "Ongoing"}</strong></div><div><span>Source</span><strong>{selected.evidence.source_mode}</strong></div></div>
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
            Live-session alerts and scheduled project summaries.
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
                    {e.acknowledged ? "Acknowledged" : "Not acknowledged"} · Email {emailStatus(e.email_status, s.project.monitoring.alert_email_enabled)}
                  </small>
                </div>
                <Badge tone={e.recovered ? "success" : "warning"}>
                  {e.recovered ? "Recovered" : "Open"}
                </Badge>
              </div>
            ))
          ) : <p>No recorded alerts.</p>}
          {s.summaries?.length > 0 && <div className="global-summaries"><h3>Recent summaries</h3>{s.summaries.slice(0, 3).map((summary) => <div className="global-summary-row" key={summary.id}><span>{summaryTime(summary.period_end)}</span><p>{summary.body}</p></div>)}</div>}
        </section>
      ))}
    </main>
  );
}
function GlobalSettings({ states }: { states: State[] }) {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  useEffect(() => {
    api<ServiceHealth>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Workspace configuration</div>
          <h1>Settings</h1>
          <p>Configure live alerts, Win summaries, and email delivery for each project.</p>
        </div>
      </div>
      <ProjectMonitoringSettings states={states} emailConfigured={health?.email_configured ?? false} defaultRecipientConfigured={health?.email_default_recipient_configured ?? false}/>
      <section className="panel appearance-settings"><div><h2>Appearance</h2><p>Choose a theme, or follow your device. Your preference is saved in this browser.</p></div><ThemeSwitcher/></section>
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
          Configure provider and SMTP credentials in the backend .env file. Device identity,
          field mapping, and inventory are defined when a project is created.
        </p>
        <p>
          The MVP binds to loopback. See docs/hardware.md before connecting a
          device or exposing the broker to a private network.
        </p>
        <p>
          RF calibration, trained anomaly models, and behavioral simulation are
          unavailable. Physical control is limited to declared capabilities.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider><App /></ThemeProvider>
  </BrowserRouter>,
);
