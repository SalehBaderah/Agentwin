import { useState } from "react";
import type { State } from "@/types";
import { time } from "@/types";
import { stateHistory } from "./stateHistory";

const durationLabel = (seconds: number) =>
  seconds < 60
    ? `${seconds.toFixed(1)}s`
    : seconds < 3600
      ? `${(seconds / 60).toFixed(1)}m`
      : `${(seconds / 3600).toFixed(1)}h`;
const palette = [
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--text-secondary)",
];

/** A duration summary, never a pie chart of sample frequency. */
export function CategoricalSummary({
  state,
  field,
}: {
  state: State;
  field: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const metric = state.project.graph.fields[field];
  const freshness = metric.freshness_seconds ?? state.project.freshness_seconds;
  const history = stateHistory(
    state.readings,
    field,
    freshness,
    metric.device_id,
  );
  const latest = state.readings
    .filter(
      (reading) =>
        (!metric.device_id || reading.device === metric.device_id) &&
        typeof reading.readings[field] === "string",
    )
    .slice()
    .sort((a, b) => a.received - b.received)
    .at(-1);
  const current = latest ? String(latest.readings[field]) : null;
  const items = [
    ...history.shares
      .filter((item) => item.seconds > 0)
      .map((item) => ({
        ...item,
        color: palette[history.labels.indexOf(item.label) % palette.length],
        unknown: false,
      })),
    ...(history.unknown > 0
      ? [
          {
            label: "Unknown / gaps",
            seconds: history.unknown,
            percent: (history.unknown / history.duration) * 100,
            color: "var(--border-strong)",
            unknown: true,
          },
        ]
      : []),
  ];
  const currentShare =
    history.shares.find((item) => item.label === current)?.percent ?? 0;
  const circumference = 2 * Math.PI * 72;
  let offset = 0;
  const segments = items.map((item) => {
    const start = offset;
    offset += (item.percent / 100) * circumference;
    return { ...item, start, length: (item.percent / 100) * circumference };
  });
  const selected = active === null ? undefined : items[active];
  const manyStates =
    history.shares.filter((item) => item.seconds > 0).length > 6;

  return (
    <section
      className="@container border-t pt-4"
      aria-label={`${metric.label} time share`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h5 className="text-xs font-semibold">State time share</h5>
        <span className="text-[11px] text-muted-foreground">
          {durationLabel(history.duration)} stored window
        </span>
      </div>
      {!history.duration ? (
        <div className="mt-4 flex min-h-44 items-center justify-center rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
          Two timestamped observations are needed to calculate time in each
          state.
        </div>
      ) : (
        <>
          <div
            className={
              manyStates
                ? "mt-5 space-y-4"
                : "mt-4 grid grid-cols-[minmax(0,1fr)] items-center gap-x-5 gap-y-4 @[440px]:grid-cols-[180px_minmax(0,1fr)]"
            }
          >
            {!manyStates && (
              <div className="relative mx-auto size-44 shrink-0">
                <svg
                  viewBox="0 0 180 180"
                  className="size-full overflow-visible"
                  role="group"
                  aria-label="Donut chart showing duration in each reported state and unknown time"
                >
                  <circle
                    cx="90"
                    cy="90"
                    r="72"
                    fill="none"
                    stroke="var(--muted)"
                    strokeWidth="20"
                  />
                  {segments.map((item, index) => (
                    <circle
                      key={item.label}
                      cx="90"
                      cy="90"
                      r="72"
                      fill="none"
                      stroke={item.color}
                      strokeWidth={active === index ? 23 : 20}
                      strokeDasharray={`${item.length} ${circumference}`}
                      strokeDashoffset={-item.start}
                      transform="rotate(-90 90 90)"
                      tabIndex={0}
                      role="img"
                      aria-label={`${item.label}: ${durationLabel(item.seconds)}, ${item.percent.toFixed(1)}% of the stored window`}
                      onFocus={() => setActive(index)}
                      onBlur={() => setActive(null)}
                      onMouseEnter={() => setActive(index)}
                      onMouseLeave={() => setActive(null)}
                      className="outline-none motion-safe:transition-[stroke-width] motion-safe:duration-150"
                    >
                      <title>{`${item.label}: ${durationLabel(item.seconds)} · ${item.percent.toFixed(1)}%`}</title>
                    </circle>
                  ))}
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-8 text-center">
                  <span className="text-[10px] text-muted-foreground">
                    Time share
                  </span>
                  <strong className="font-heading text-2xl font-semibold tracking-tight tabular-nums">
                    {(selected?.percent ?? currentShare).toFixed(1)}%
                  </strong>
                  <span className="max-w-full break-words text-xs font-medium leading-tight">
                    {selected?.label ?? current ?? "Unknown"}
                  </span>
                </div>
              </div>
            )}
            <div className="min-w-0 space-y-1">
              {items.map((item, index) => (
                <div key={item.label}>
                  <button
                    type="button"
                    aria-label={`${item.label}: ${durationLabel(item.seconds)}, ${item.percent.toFixed(1)}% of the stored window`}
                    aria-pressed={active === index}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive(null)}
                    onClick={() => setActive(index)}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <i
                      className={
                        item.unknown
                          ? "mt-1 size-2 shrink-0 rounded-sm border border-dashed"
                          : "mt-1 size-2 shrink-0 rounded-full"
                      }
                      style={
                        item.unknown ? undefined : { background: item.color }
                      }
                    />
                    <span className="min-w-0 flex-1 break-words font-medium">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                      <strong className="block font-semibold text-foreground">
                        {item.percent.toFixed(1)}%
                      </strong>
                      <span className="text-[10px]">
                        {durationLabel(item.seconds)}
                      </span>
                    </span>
                  </button>
                  {manyStates && (
                    <div
                      role="meter"
                      aria-label={`${item.label} time share`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.percent}
                      className="mx-2 mb-3 h-2 overflow-hidden rounded-full bg-muted/60"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${item.percent}%`,
                          background: item.color,
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
              {!history.unknown && (
                <p className="px-2 pt-1 text-[10px] text-muted-foreground">
                  Unknown / gaps · 0.0s
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-[10px] text-muted-foreground tabular-nums">
            <span>{time(history.start)}</span>
            <span>{time(history.end)}</span>
          </div>
        </>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {history.duration
          ? ((history.covered / history.duration) * 100).toFixed(1)
          : "0"}
        % coverage · {durationLabel(history.unknown)} unknown. Based on elapsed
        time; validity is capped at {freshness}s.
      </p>
    </section>
  );
}
