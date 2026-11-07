import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, Bell, Cable, Database, PanelRightOpen } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ProjectId } from "@/components/CopyId";
import { EmptyState } from "@/components/EmptyState";
import { OptionSelect } from "@/components/OptionSelect";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { SlidingTabsList } from "@/components/SlidingTabs";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import type { ProjectContext } from "@/app/types";
import { AgentPanel } from "@/features/agent/AgentPanel";
import { cn } from "@/lib/utils";
import type { State } from "@/types";
import { api, display, time } from "@/types";
import { ControlsPanel } from "./ControlsPanel";
import { Events } from "./Events";
import { ProjectOverview } from "./ProjectOverview";
import { Readings } from "./Readings";
import { FirmwareSetup } from "@/features/projects/FirmwareSetup";

const DigitalTwin = lazy(() => import("@/features/digital-twin/DigitalTwin").then((module) => ({ default: module.DigitalTwin })));
const tabs: [string, string][] = [["overview", "Overview"], ["readings", "Live readings"], ["twin", "Digital twin"], ["events", "Events & history"], ["controls", "Controls"], ["setup", "Device setup"]];
const mobileQuery = "(max-width: 760px)";

export function Workspace({ connected, onContextChange }: { connected: boolean; onContextChange: (context: ProjectContext) => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [agentWidth, setAgentWidth] = useState(() => Number(localStorage.getItem("agentwin-agent-width")) || 380);
  const [agentCollapsed, setAgentCollapsed] = useState(() => window.matchMedia(mobileQuery).matches || localStorage.getItem("agentwin-collapsed") === "true");
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(""), [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [sessionSelection, setSessionSelection] = useState({ projectId: id, sessionId: "" });
  const sid = sessionSelection.projectId === id ? sessionSelection.sessionId : "";
  const setSid = (sessionId: string) => setSessionSelection({ projectId: id, sessionId });
  const context = useMemo(() => ({ id, sid }), [id, sid]);
  const activeContext = useRef<typeof context | null>(null);
  useLayoutEffect(() => {
    activeContext.current = context;
    return () => { activeContext.current = null; };
  }, [context]);
  const [tab, setTab] = useState(new URLSearchParams(location.search).get("tab") || "twin");
  const refresh = useCallback(() => {
    if (activeContext.current !== context) return;
    api<State>("/projects/" + id + (sid ? "?session=" + sid : "")).then((s) => {
      if (activeContext.current !== context || s.project.id !== id || (sid ? s.session.id !== sid : s.session.mode !== "live")) return;
      setState(s); setError("");
    }).catch((e) => { if (activeContext.current === context) setError(e.message); });
  }, [id, sid, context]);
  useEffect(() => { setState(null); setSelectedComponentId(null); }, [id]);
  useEffect(() => {
    refresh();
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?project=${id}${sid ? `&session=${sid}` : ""}`);
      socket.onopen = () => { if (!stopped) refresh(); };
      socket.onmessage = (e) => {
        if (stopped || activeContext.current !== context) return;
        const m = JSON.parse(e.data);
        if (m.type === "project_snapshot" && m.state.project.id === id && (sid ? m.state.session.id === sid : m.state.session.mode === "live")) { setState(m.state); setError(""); }
      };
      socket.onclose = () => { if (!stopped) timer = setTimeout(connect, 2000); };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  }, [refresh, id, sid, context]);
  useEffect(() => { if (state) onContextChange({ projectId: state.project.id, mode: state.session.mode }); }, [state?.project.id, state?.session.mode, onContextChange]);
  useEffect(() => {
    const mobile = window.matchMedia(mobileQuery);
    const adapt = () => setAgentCollapsed(mobile.matches || localStorage.getItem("agentwin-collapsed") === "true");
    mobile.addEventListener("change", adapt);
    return () => mobile.removeEventListener("change", adapt);
  }, []);
  useEffect(() => {
    if (agentCollapsed) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && window.matchMedia(mobileQuery).matches) setAgentCollapsed(true); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [agentCollapsed]);
  if (!state || state.project.id !== id || (sid ? state.session.id !== sid : state.session.mode !== "live")) return <Page><EmptyState>{error || "Loading project…"}</EmptyState></Page>;
  const p = state.project;
  const removeProject = async () => {
    setDeleting(true);
    try { await api(`/projects/${p.id}`, {}, "DELETE"); navigate("/projects"); }
    catch (failure) { setError((failure as Error).message); setDeleteOpen(false); }
    finally { setDeleting(false); }
  };
  const startAgentResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = agentWidth;
    let currentWidth = agentWidth;
    document.body.classList.add("select-none", "cursor-col-resize");
    const move = (moveEvent: PointerEvent) => { currentWidth = Math.max(320, Math.min(640, startWidth + startX - moveEvent.clientX)); setAgentWidth(currentWidth); };
    const stop = () => {
      document.body.classList.remove("select-none", "cursor-col-resize");
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
    if (!window.matchMedia(mobileQuery).matches) localStorage.setItem("agentwin-collapsed", String(next));
  };
  const primary = p.graph.fields[p.graph.primary_field];
  // The tab-content hook class marks only the visible panel; Radix keeps hidden empty panels in the DOM.
  const panelClass = (key: string) => cn("p-[22px] max-[540px]:p-4", tab === key && "tab-content");
  return (
    <Page className="max-w-none">
      <Link to="/projects" className="mb-2 inline-flex w-fit items-center gap-[7px] text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All projects</Link>
      <PageHeading
        eyebrow={`${p.template.replaceAll("_", " ")} project`}
        title={p.name}
        actions={
          <div className="project-actions flex items-end gap-2.5 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
            <div className="source-picker grid gap-[5px]">
              <Label htmlFor="session-picker" className="text-[13px] font-normal text-muted-foreground">Session</Label>
              <OptionSelect id="session-picker" value={state.session.id} onValueChange={setSid} className="w-[215px] text-[13px] max-sm:w-full" options={state.sessions.map((session) => ({ value: session.id, label: `${session.mode} · ${time(session.created)}` }))} />
            </div>
            <Button asChild size="lg" variant="outline" className="text-subtle-foreground"><Link to={`/settings?project=${p.id}`}>Monitoring settings</Link></Button>
            <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
              <AlertDialogTrigger asChild><Button size="lg" variant="outline" className="font-normal text-subtle-foreground">Manage project</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete project?</AlertDialogTitle>
                  <AlertDialogDescription>Delete {p.name} and all of its stored sessions, readings, events, and actions?</AlertDialogDescription>
                </AlertDialogHeader>
                <p className="text-sm font-medium text-destructive">This cannot be undone.</p>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                  <Button variant="destructive" disabled={deleting} onClick={removeProject}>{deleting ? "Deleting…" : "Delete project"}</Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      >
        <ProjectId value={p.id} />
        {p.arabic_title && <p className="text-sm text-subtle-foreground" dir="rtl" lang="ar">{p.arabic_title}</p>}
      </PageHeading>
      <div className="status-line -mt-2.5 mb-2.5 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-[13px] text-muted-foreground">
        <StatusBadge>{state.session.mode} session</StatusBadge>
        <StatusBadge tone={connected && state.status === "reporting" ? "success" : "warning"}>{connected ? state.status : "Backend disconnected · snapshot only"}</StatusBadge>
        <span>{p.devices.map((device) => device.id).join(", ")}</span>
        <span>Freshness: {p.freshness_seconds}s</span>
        <span>Connector status: {state.gateway_status}</span>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="mb-3.5 grid grid-cols-2 gap-4 max-[360px]:grid-cols-1 xl:grid-cols-4">
        <Stat label={primary.label} value={<>{display(state.latest?.readings[p.graph.primary_field])}<em>{primary.unit}</em></>} hint={state.status === "reporting" ? "Latest received sample" : "Last stored value · check freshness"} icon={<Activity />} />
        <Stat label="Devices reporting" value={`${state.devices.filter((device) => device.reporting).length}/${state.devices.length}`} hint="Configured devices" icon={<Cable />} />
        <Stat label="Last telemetry" value={time(state.latest?.received)} hint="Server receipt time · local timezone" icon={<Database />} />
        <Stat label="Open events" value={state.events.filter((e) => !e.recovered).length} hint="Acknowledgement does not mean recovery" icon={<Bell />} />
      </div>
      <p className="source-note mb-2 text-[13px] leading-[1.7] text-subtle-foreground">{state.session.mode === "live" ? "Live data is scoped to this project and its registered devices." : "Test data is isolated from live device state and never routes physical commands."}</p>
      <div className={cn("workspace-grid relative grid min-w-0 gap-2.5", agentCollapsed ? "md:grid-cols-[minmax(0,1fr)_auto]" : "min-[1181px]:grid-cols-[minmax(0,1fr)_10px_var(--agent-width)]")} style={{ "--agent-width": `${agentWidth}px` } as React.CSSProperties}>
        <section className="workspace-main min-w-0 overflow-hidden rounded-[14px] border bg-card">
          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <ScrollArea className="w-full border-b bg-[var(--background-secondary)]"><SlidingTabsList value={tab} items={tabs} aria-label="Project views" className="bg-transparent" /><ScrollBar orientation="horizontal" /></ScrollArea>
            <TabsContent value="overview" className={panelClass("overview")}><ProjectOverview state={state} /></TabsContent>
            <TabsContent value="readings" className={panelClass("readings")}><Readings key={`${state.project.id}:${state.session.id}`} state={state} refresh={refresh} /></TabsContent>
            <TabsContent value="twin" className={panelClass("twin")}>
              <Suspense fallback={<EmptyState icon={<Activity />} title="Loading Live Twin"><p>Preparing the operational scene.</p></EmptyState>}>
                <DigitalTwin state={state} selectedId={selectedComponentId} onSelect={setSelectedComponentId} refresh={refresh} />
              </Suspense>
            </TabsContent>
            <TabsContent value="events" className={panelClass("events")}><Events state={state} refresh={refresh} /></TabsContent>
            <TabsContent value="controls" className={panelClass("controls")}><ControlsPanel state={state} refresh={refresh} /></TabsContent>
            <TabsContent value="setup" className={panelClass("setup")}><FirmwareSetup project={p} state={state} connected={connected} /></TabsContent>
          </Tabs>
        </section>
        {!agentCollapsed && <button type="button" className="relative hidden cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-border after:transition-colors hover:after:bg-brand focus-visible:outline-none focus-visible:after:w-0.5 focus-visible:after:bg-brand min-[1181px]:block" aria-label="Resize agent panel" title="Drag to resize; use arrow keys; double-click to reset" onPointerDown={startAgentResize} onKeyDown={nudgeAgentWidth} onDoubleClick={() => { setAgentWidth(380); localStorage.setItem("agentwin-agent-width", "380"); }} />}
        <aside className={cn("workspace-agent min-w-0", !agentCollapsed && "max-md:fixed max-md:inset-0 max-md:z-40 max-md:flex max-md:items-end")} aria-label="Win project assistant" onKeyDown={(event) => { if (event.key === "Escape" && !agentCollapsed) toggleAgent(); }}>
          {!agentCollapsed && <button type="button" className="absolute inset-0 bg-backdrop md:hidden" aria-label="Close Win" onClick={toggleAgent} />}
          {agentCollapsed && (
            <Button variant="outline" className="group relative h-[188px] w-[140px] flex-col items-stretch justify-between gap-2 overflow-hidden rounded-[16px] border-brand-border bg-card p-3 text-left text-foreground shadow-sm hover:border-brand hover:bg-card focus-visible:border-brand dark:border-brand-border dark:bg-card dark:hover:bg-card max-md:fixed max-md:right-4 max-md:bottom-4 max-md:z-30 max-md:h-[72px] max-md:w-[192px] max-md:flex-row max-md:items-center max-md:justify-start max-md:gap-2.5 max-md:rounded-[18px] max-md:p-2 max-md:shadow-lg" aria-label="Open Win assistant" aria-expanded="false" onClick={toggleAgent}>
              <span className="flex h-[112px] w-full shrink-0 items-center justify-center rounded-[12px] bg-brand-subtle max-md:size-14">
                <img src="/assets/win.webp" alt="" className="size-[100px] object-contain max-md:size-14" width="100" height="100" decoding="async" />
              </span>
              <span className="flex w-full items-center justify-between gap-1 max-md:min-w-0 max-md:flex-1 max-md:flex-col max-md:items-start max-md:gap-0">
                <strong className="font-heading text-base leading-tight">Win</strong>
                <span className="text-[11px] font-medium text-muted-foreground max-md:text-[10px]">Open assistant</span>
              </span>
              <PanelRightOpen className="absolute top-3 right-3 size-4 text-brand transition-transform group-hover:translate-x-0.5 max-md:static max-md:ml-auto max-md:shrink-0" aria-hidden="true" />
            </Button>
          )}
          <div hidden={agentCollapsed} className="relative max-md:max-h-[88svh] max-md:w-full max-md:overflow-y-auto max-md:rounded-t-[18px] min-[1181px]:sticky min-[1181px]:top-20 min-[1181px]:h-full min-[1181px]:max-h-[calc(100svh-6rem)]">
            <AgentPanel key={`${state.project.id}:${state.session.id}`} state={state} onCollapse={toggleAgent} refresh={refresh} />
          </div>
        </aside>
      </div>
    </Page>
  );
}
