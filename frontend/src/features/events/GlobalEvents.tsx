import type { State } from "@/types";
import { Link } from "react-router-dom";
import { ArrowRight, Bell } from "lucide-react";
import { time } from "@/types";
import { summaryTime, emailStatus } from "@/lib/format";
import { StatusBadge as Badge } from "@/components/StatusBadge";

export function GlobalEvents({ states }: { states: State[] }) {
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
