import type { State } from "@/types";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ArrowUpRight, AudioLines, Bell, Cable, ChevronRight, FlaskConical, Layers, Radio, Plus, ShieldCheck } from "lucide-react";
import { display, time } from "@/types";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import { Stat } from "@/components/Stat";
import { PlatformAnalytics } from "@/features/overview/PlatformAnalytics";

export function Overview({
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
