import type { State } from "@/types";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowDownRight, Bell, Cable, Database } from "lucide-react";
import { api, display, time } from "@/types";
import { Dialog, Tabs } from "@/ui";
import type { ProjectContext } from "@/app/types";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import { Stat } from "@/components/Stat";
import { ProjectId } from "@/components/CopyId";
import { ProjectOverview } from "@/features/workspace/ProjectOverview";
import { Readings } from "@/features/workspace/Readings";
import { ControlsPanel } from "@/features/workspace/ControlsPanel";
import { Events } from "@/features/workspace/Events";
import { AgentPanel } from "@/features/agent/AgentPanel";

export const DigitalTwin = lazy(() => import("@/features/digital-twin/DigitalTwin").then((module) => ({ default: module.DigitalTwin })));

export function Workspace({ connected, onContextChange }: { connected: boolean; onContextChange: (context: ProjectContext) => void }) {
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
