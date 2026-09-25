import type { Event as ProjectEvent, State } from "@/types";
import { useState } from "react";
import { Bell, Check, ShieldCheck, X } from "lucide-react";
import { api, display, time } from "@/types";
import { summaryTime, emailStatus } from "@/lib/format";
import { StatusBadge as Badge } from "@/components/StatusBadge";

export function Events({ state, refresh }: { state: State; refresh: () => void }) {
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
