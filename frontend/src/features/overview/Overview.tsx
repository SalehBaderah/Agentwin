import { Link } from "react-router-dom";
import { Activity, ArrowRight, ArrowUpRight, AudioLines, Bell, Cable, ChevronRight, FlaskConical, Layers, Plus, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { SectionHeading } from "@/components/SectionHeading";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import type { State } from "@/types";
import { display, time } from "@/types";
import { PlatformAnalytics } from "./PlatformAnalytics";

export function Overview({ states, projectOnly = false }: { states: State[]; projectOnly?: boolean }) {
  const events = states.flatMap((s) => s.events.filter((e) => !e.recovered).map((e) => ({ ...e, project: s.project })));
  const reportingCount = states.filter((s) => s.status === "reporting").length;
  const addProject = <Button asChild size="lg"><Link to="/projects/new"><Plus />Add project</Link></Button>;
  return (
    <Page>
      <PageHeading title={projectOnly ? "Projects" : "Systems at a glance"} description="Current state, recent evidence, and anything that needs attention." actions={addProject} />
      {!projectOnly && (
        <>
          <Card className="flex-row flex-wrap items-center gap-3 max-[540px]:flex-col max-[540px]:items-start rounded-[14px] bg-glass p-5 shadow-elevated backdrop-blur min-[721px]:gap-5 min-[721px]:px-6 min-[721px]:py-[22px]">
            <div className="grid size-11 place-items-center rounded-lg max-[540px]:hidden bg-brand-subtle text-foreground"><Activity className="size-6" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="mb-[5px] text-lg font-bold tracking-[-0.3px]">{!states.length ? "Create your first project" : events.length ? `${events.length} event${events.length === 1 ? "" : "s"} need attention` : "No open events"}</h2>
              <p className="text-[13px] leading-[1.6] text-muted-foreground">{states.length ? `${reportingCount} of ${states.length} projects are reporting from their current data source.` : "Start with a template, then connect one or more real devices."}</p>
            </div>
            <Link className="inline-flex items-center gap-2 text-[13px] font-semibold text-brand hover:underline [&_svg]:size-4" to={events.length ? "/events" : states.length ? `/projects/${states[0].project.id}` : "/projects/new"}>
                {events.length ? "Review events" : states.length ? "Open project" : "Add project"}<ArrowRight />
              </Link>
          </Card>
          <div className="mb-2 grid gap-4 sm:grid-cols-3 md:mb-3.5">
            <Stat label="Total projects" value={states.length} hint="Configured workspaces" icon={<Layers />} />
            <Stat label="Reporting now" value={reportingCount} hint="Current selected sources" icon={<Activity />} />
            <Stat label="Open events" value={events.length} hint="Across current sessions" icon={<Bell />} />
          </div>
          {states.length > 0 && <PlatformAnalytics states={states} />}
        </>
      )}
      <SectionHeading title={<>Your projects <span className="ml-[7px] rounded border px-1.5 py-0.5 align-[2px] text-[13px] text-muted-foreground">{states.length}</span></>} aside="Independent live and test sessions" />
      <div className="grid gap-4 min-[1180px]:grid-cols-2">
        {!states.length && (
          <EmptyState className="min-[1180px]:col-span-2" icon={<Layers />} title="No projects yet" action={<Button asChild size="lg"><Link to="/projects/new"><Plus />Add your first project</Link></Button>}>
            <p>Create a project to define its devices, telemetry, Twin, and controls.</p>
          </EmptyState>
        )}
        {states.map((s) => {
          const primary = s.project.graph.fields[s.project.graph.primary_field];
          return (
            <Link key={s.project.id} to={"/projects/" + s.project.id} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Card className="h-full gap-3 p-5 transition-colors group-hover:border-brand-border group-hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-brand-subtle text-brand [&_svg]:size-5">{s.project.template === "connectivity" ? <Radio /> : <AudioLines />}</span>
                  <StatusBadge tone={s.status === "reporting" ? "success" : "neutral"}>{s.status}</StatusBadge>
                </div>
                <div className="text-xs tracking-wide text-muted-foreground uppercase">{s.project.template.replaceAll("_", " ")} template</div>
                <h3 className="text-lg font-semibold">{s.project.name}</h3>
                {s.project.arabic_title && <div className="text-sm text-subtle-foreground" dir="rtl" lang="ar">{s.project.arabic_title}</div>}
                <p className="line-clamp-2 text-sm text-muted-foreground">{s.project.description}</p>
                <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2">
                  <span className="text-xs text-muted-foreground">{primary.label}</span>
                  <strong className="text-lg font-semibold">{display(s.latest?.readings[s.project.graph.primary_field])}<small className="ml-1 text-xs font-normal text-muted-foreground">{primary.unit}</small></strong>
                </div>
                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">{s.session.mode === "live" ? <Cable className="size-3.5" /> : <FlaskConical className="size-3.5" />}{s.devices.filter((device) => device.reporting).length}/{s.devices.length} reporting</span>
                  <span className="flex items-center gap-1">{time(s.latest?.received)}<ArrowUpRight className="size-4" /></span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <SectionHeading title={events.length ? "Needs attention" : "All systems clear"} aside={<Link to="/events">{events.length ? "View all events" : "View event history"}<ArrowRight className="size-3.5" /></Link>} />
      <Card className="gap-0 p-0">
        {events.length ? events.slice(0, 4).map((e) => (
          <Link key={e.id} to={"/projects/" + e.project.id + "?tab=events"} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-accent">
            <span className="grid size-8 place-items-center rounded-lg bg-warning-subtle text-warning"><Bell className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <strong className="block text-sm font-medium">{e.kind === "missing_telemetry" ? "Device telemetry is missing" : "Configured limit breached"}</strong>
              <small className="text-xs text-muted-foreground">{e.project.name} · {e.evidence.rule}</small>
            </div>
            <StatusBadge tone="warning">Open</StatusBadge>
            <time className="hidden text-xs text-muted-foreground sm:block">{time(e.created)}</time>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        )) : (
          <div className="flex items-center gap-[15px] p-6">
            <ShieldCheck className="size-6 shrink-0 text-success" />
            <div>
              <strong className="text-sm font-medium">No open events in these sessions</strong>
              <p className="text-sm text-muted-foreground">{states.some((state) => state.devices.some((device) => device.reporting)) ? "Connected devices are reporting and no active rule currently requires attention." : states.length ? "No active event is open. Connect a registered device to begin live monitoring." : "Add a project and connect a device to begin live monitoring."}</p>
            </div>
          </div>
        )}
      </Card>
      <footer className="mt-3 flex flex-wrap justify-between gap-x-[15px] gap-y-1 border-t pt-[18px] text-[13px] text-muted-foreground">
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" />Local-first monitoring</span>
        <span>Evidence-backed monitoring</span>
      </footer>
    </Page>
  );
}
