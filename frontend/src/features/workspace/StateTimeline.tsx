import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { State } from "@/types";
import { time } from "@/types";
import { stateHistory } from "./stateHistory";

const durationLabel = (seconds: number) =>
  seconds < 60 ? seconds.toFixed(1) + "s" : (seconds / 60).toFixed(1) + "m";
export function StateTimeline({
  state,
  field,
}: {
  state: State;
  field: string;
}) {
  const [summary, setSummary] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [allHistory, setAllHistory] = useState(false);
  const metric = state.project.graph.fields[field];
  const binary = metric.data_type === "boolean";
  const history = stateHistory(
    state.readings,
    field,
    metric.freshness_seconds ?? state.project.freshness_seconds,
    metric.device_id,
    { boolean: binary, windowSeconds: binary && !allHistory ? 300 : undefined },
  );
  const color = (label: string) =>
    binary ? label === "On" ? "var(--chart-1)" : "var(--text-muted)" : history.labels.indexOf(label) % 2 ? "var(--chart-1)" : "var(--chart-2)";
  return (
    <section
      className="state-history"
      aria-label={metric.label + " state history"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <h5 className="text-xs font-semibold">
          {summary ? "Time share" : "State timeline"}
        </h5>
        {binary && <select aria-label="State history window" className="rounded-md border bg-background px-2 py-1 text-xs" value={allHistory ? "all" : "recent"} onChange={event=>{setAllHistory(event.target.value==="all");setActive(null);}}><option value="recent">Latest 5 minutes</option><option value="all">All stored history</option></select>}
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={summary}
          onClick={() => setSummary(!summary)}
        >
          {summary ? "Show timeline" : "Time share"}
        </Button>
      </div>
      {!history.duration ? (
        <p className="py-4 text-xs text-muted-foreground">
          Two timestamped observations are needed to show elapsed history.
        </p>
      ) : summary ? (
        <div className="space-y-3 py-3">
          {[
            ...history.shares,
            {
              label: "Unknown / gaps",
              seconds: history.unknown,
              percent: (history.unknown / history.duration) * 100,
            },
          ].map((item, index) => (
            <div key={index}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span>{item.label}</span>
                <span>
                  {durationLabel(item.seconds)} · {item.percent.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 rounded bg-muted">
                <div
                  className="h-full rounded"
                  style={{
                    width: item.percent + "%",
                    background:
                      index === history.shares.length
                        ? "var(--text-muted)"
                        : color(item.label),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-3">
          <div
            className="relative h-10 overflow-hidden rounded-md border bg-muted/50"
            role="group"
            aria-label="State intervals in time order"
          >
            {history.intervals.map((interval, i) => (
              <span
                key={i}
                tabIndex={0}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                aria-label={`${interval.label ?? "Unknown"}: ${time(interval.start)} to ${time(interval.end)}`}
                title={`${interval.label ?? "Unknown / gap"} · ${time(interval.start)} – ${time(interval.end)}`}
                className="absolute inset-y-0 border-r border-background focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-foreground"
                style={{
                  left:
                    ((interval.start - history.start) / history.duration) *
                      100 +
                    "%",
                  width:
                    ((interval.end - interval.start) / history.duration) * 100 +
                    "%",
                  background:
                    interval.label === null
                      ? "transparent"
                      : color(interval.label),
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-2 text-[10px] text-muted-foreground">
            <span>{time(history.start)}</span>
            <span>{time(history.end)}</span>
          </div>
          <p className="mt-2 min-h-8 text-xs" aria-live="polite">
            {active !== null && history.intervals[active] ? (
              <>
                {history.intervals[active].label ?? "Unknown / gap"} ·{" "}
                {time(history.intervals[active].start)} –{" "}
                {time(history.intervals[active].end)}
              </>
            ) : (
              "Hover or focus an interval for its state and time."
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(binary ? ["On", "Off"] : history.labels).map((label) => (
              <span key={label} className="flex items-center gap-1.5 text-xs">
                <i
                  className="size-2 rounded-sm"
                  style={{ background: color(label) }}
                />
                {label}
              </span>
            ))}
            {binary && <span className="flex items-center gap-1.5 text-xs"><i className="size-2 rounded-sm border"/>Unknown / gaps</span>}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Stored window ·{" "}
        {history.duration
          ? ((history.covered / history.duration) * 100).toFixed(1)
          : "0"}
        % coverage · {durationLabel(history.unknown)} unknown. State validity is
        capped at {metric.freshness_seconds ?? state.project.freshness_seconds}
        s.
      </p>
    </section>
  );
}
