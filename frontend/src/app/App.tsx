import type { State } from "@/types";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Link, Route, Routes, useLocation } from "react-router-dom";
import { Bell, Info, Layers, LayoutDashboard, Radio, Menu, MoreHorizontal, Settings as SettingsIcon, X } from "lucide-react";
import { api, strings } from "@/types";
import { ThemeSwitcher } from "@/theme";
import { Dialog } from "@/ui";
import { sessionLabel } from "@/lib/format";
import type { ServiceHealth, ProjectContext } from "@/app/types";
import { Mark } from "@/components/Mark";
import { useDropdownClass } from "@/app/useDropdownClass";
import { SystemSwitcher } from "@/app/SystemSwitcher";
import { CommandLauncher } from "@/app/CommandLauncher";
import { HealthRows, SystemStatus } from "@/app/SystemStatus";
import { Overview } from "@/features/overview/Overview";
import { Workspace } from "@/features/workspace/Workspace";
import { AddProject } from "@/features/projects/AddProject";
import { GlobalEvents } from "@/features/events/GlobalEvents";
import { GlobalSettings } from "@/features/settings/GlobalSettings";

export function App() {
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
