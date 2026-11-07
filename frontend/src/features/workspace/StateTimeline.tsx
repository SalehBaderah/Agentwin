import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { State } from "@/types";
import { time } from "@/types";
import { stateHistory } from "./stateHistory";

const durationLabel = (seconds: number) =>
  seconds < 60 ? `${seconds.toFixed(1)}s` : `${(seconds / 60).toFixed(1)}m`;

export function StateTimeline({
  state,
  field,
  sampleWindow = false,
}: {
  state: State;
  field: string;
  sampleWindow?: boolean;
}) {
  const [summary, setSummary] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [allHistory, setAllHistory] = useState(false);
  const gapPattern = useId().replace(/:/g, "");
  const metric = state.project.graph.fields[field];
  const binary = metric.data_type === "boolean";
  const freshness = metric.freshness_seconds ?? state.project.freshness_seconds;
  const history = stateHistory(
    state.readings,
    field,
    freshness,
    metric.device_id,
    {
      boolean: binary,
      windowSeconds: binary && !sampleWindow && !allHistory ? 300 : undefined,
    },
  );
  const color = (label: string) =>
    binary
      ? label === "On"
        ? "var(--chart-1)"
        : "var(--text-muted)"
      : history.labels.indexOf(label) % 2
        ? "var(--chart-1)"
        : "var(--chart-2)";
  const position = (timestamp: number) =>
    ((timestamp - history.start) / history.duration) * 600;
  const latestObservation = state.readings
    .filter(
      (reading) =>
        Number.isFinite(reading.received) &&
        (!metric.device_id || reading.device === metric.device_id),
    )
    .slice()
    .sort((a, b) => a.received - b.received)
    .at(-1);
  const latestState = latestObservation?.readings[field];
  const latestLabel =
    typeof latestState === "boolean" ? (latestState ? "On" : "Off") : null;
  const lastInterval = history.intervals.at(-1);
  const activeInterval =
    active === null ? undefined : history.intervals[active];
  const describe = (index: number) => {
    const interval = history.intervals[index];
    return `${interval.label ?? "Unknown / gap"}: ${time(interval.start)} to ${time(interval.end)}, ${durationLabel(interval.end - interval.start)}`;
  };
  const shares = [
    ...(binary
      ? ["On", "Off"].map(
          (label) =>
            history.shares.find((item) => item.label === label) ?? {
              label,
              seconds: 0,
              percent: 0,
            },
        )
      : history.shares),
    {
      label: "Unknown / gaps",
      seconds: history.unknown,
      percent: history.duration
        ? (history.unknown / history.duration) * 100
        : 0,
    },
  ];

  return (
    <section
      className="state-history"
      aria-label={`${metric.label} state history`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <h5 className="text-xs font-semibold">
          {summary
            ? "Time share"
            : binary
              ? "On / Off history"
              : "State timeline"}
        </h5>
        {binary && !sampleWindow && (
          <select
            aria-label="State history window"
            className="rounded-lg border bg-background px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            value={allHistory ? "all" : "recent"}
            onChange={(event) => {
              setAllHistory(event.target.value === "all");
              setActive(null);
            }}
          >
            <option value="recent">Latest 5 minutes</option>
            <option value="all">All stored history</option>
          </select>
        )}
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={summary}
          onClick={() => {
            setSummary(!summary);
            setActive(null);
          }}
        >
          {summary ? "Show history" : "Time share"}
        </Button>
      </div>
      {!history.duration ? (
        <div className="mt-4 flex min-h-40 items-center justify-center rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
          Two timestamped observations are needed to show elapsed history.
        </div>
      ) : summary ? (
        <div className="space-y-4 py-5">
          {shares.map((item) => (
            <div key={item.label}>
              <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {durationLabel(item.seconds)}{" "}
                  <strong className="ml-2 font-semibold text-foreground">
                    {item.percent.toFixed(1)}%
                  </strong>
                </span>
              </div>
              <div
                role="meter"
                aria-label={`${item.label} time share`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.percent}
                className="h-2.5 overflow-hidden rounded-full bg-muted/60"
              >
                <div
                  className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300"
                  style={{
                    width: `${item.percent}%`,
                    background:
                      item.label === "Unknown / gaps"
                        ? "var(--border-strong)"
                        : color(item.label),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-4">
          {binary ? (
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
              <div
                aria-hidden="true"
                className="relative h-40 text-[11px] font-medium text-muted-foreground"
              >
                <span className="absolute top-[22px]">On</span>
                <span className="absolute top-[114px]">Off</span>
              </div>
              <div className="min-w-0">
                <svg
                  viewBox="0 0 600 160"
                  preserveAspectRatio="none"
                  className="block h-40 w-full overflow-visible"
                  role="group"
                  aria-label="Stepped On and Off history. Gaps have no reported state."
                >
                  <defs>
                    <pattern
                      id={gapPattern}
                      width="8"
                      height="8"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M-2 2L2-2M0 8L8 0M6 10L10 6"
                        stroke="var(--border-strong)"
                        strokeWidth="1"
                      />
                    </pattern>
                  </defs>
                  {[28, 120].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      x2="600"
                      y1={y}
                      y2={y}
                      stroke="var(--chart-grid, var(--border))"
                      strokeDasharray="3 5"
                    />
                  ))}
                  {[0, 150, 300, 450, 600].map((x) => (
                    <line
                      key={x}
                      x1={x}
                      x2={x}
                      y1="12"
                      y2="136"
                      stroke="var(--chart-grid, var(--border))"
                      strokeDasharray="2 6"
                      opacity="0.6"
                    />
                  ))}
                  {history.intervals.map((interval, index) => {
                    const x = position(interval.start);
                    const width = position(interval.end) - x;
                    const previous = history.intervals[index - 1];
                    const y = interval.label === "On" ? 28 : 120;
                    const previousY = previous?.label === "On" ? 28 : 120;
                    return (
                      <g
                        key={index}
                        tabIndex={0}
                        aria-label={describe(index)}
                        onFocus={() => setActive(index)}
                        onBlur={() => setActive(null)}
                        onMouseEnter={() => setActive(index)}
                        onMouseLeave={() => setActive(null)}
                        className="outline-none"
                      >
                        <title>{describe(index)}</title>
                        {interval.label === null ? (
                          <rect
                            x={x}
                            y="12"
                            width={width}
                            height="124"
                            fill={`url(#${gapPattern})`}
                            opacity="0.65"
                          />
                        ) : (
                          <>
                            <rect
                              x={x}
                              y={interval.label === "On" ? 28 : 112}
                              width={width}
                              height={interval.label === "On" ? 92 : 8}
                              fill={color(interval.label)}
                              opacity={active === index ? 0.14 : 0.06}
                            />
                            {previous?.label !== null &&
                              previous?.label !== undefined &&
                              previous.end === interval.start &&
                              previous.label !== interval.label && (
                                <line
                                  x1={x}
                                  x2={x}
                                  y1={previousY}
                                  y2={y}
                                  stroke="var(--chart-1)"
                                  strokeWidth="2"
                                  vectorEffect="non-scaling-stroke"
                                />
                              )}
                            <line
                              x1={x}
                              x2={x + width}
                              y1={y}
                              y2={y}
                              stroke={color(interval.label)}
                              strokeWidth={active === index ? 3 : 2.5}
                              vectorEffect="non-scaling-stroke"
                            />
                          </>
                        )}
                        <rect
                          x={x}
                          y="8"
                          width={width}
                          height="132"
                          fill="transparent"
                          stroke={
                            active === index ? "var(--border-strong)" : "none"
                          }
                          strokeDasharray="3 3"
                        />
                      </g>
                    );
                  })}
                  {latestLabel &&
                    lastInterval?.label &&
                    lastInterval.end === history.end &&
                    lastInterval.label !== latestLabel && (
                      <line
                        x1="600"
                        x2="600"
                        y1={lastInterval.label === "On" ? 28 : 120}
                        y2={latestState ? 28 : 120}
                        stroke="var(--chart-1)"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  {latestLabel && (
                    <circle
                      cx="600"
                      cy={latestState ? 28 : 120}
                      r="3"
                      fill={color(latestLabel)}
                      stroke="var(--background)"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{`${latestLabel}: ${time(history.end)} · latest observation`}</title>
                    </circle>
                  )}
                </svg>
                <div className="-mt-1 flex justify-between gap-2 text-[10px] text-muted-foreground tabular-nums">
                  <span>{time(history.start)}</span>
                  <span className="hidden sm:block">
                    {time(history.start + history.duration / 2)}
                  </span>
                  <span>{time(history.end)}</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className="relative h-10 overflow-hidden rounded-lg border bg-muted/40"
                role="group"
                aria-label="Categorical state intervals in time order"
              >
                {history.intervals.map((interval, index) => (
                  <span
                    key={index}
                    tabIndex={0}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive(null)}
                    aria-label={describe(index)}
                    title={describe(index)}
                    className="absolute inset-y-0 border-r border-background focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-foreground"
                    style={{
                      left: `${((interval.start - history.start) / history.duration) * 100}%`,
                      width: `${((interval.end - interval.start) / history.duration) * 100}%`,
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
            </>
          )}
          <div
            className="mt-4 flex min-h-10 items-center rounded-lg border bg-muted/30 px-3 py-2 text-[11px]"
            aria-live="polite"
          >
            {activeInterval ? (
              <span className="flex w-full flex-wrap justify-between gap-2">
                <strong className="font-medium">
                  {activeInterval.label ?? "Unknown / gap"}
                </strong>
                <span className="text-muted-foreground tabular-nums">
                  {time(activeInterval.start)} – {time(activeInterval.end)}{" "}
                  <span className="ml-2">
                    {durationLabel(activeInterval.end - activeInterval.start)}
                  </span>
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                Hover or focus the history to inspect a state and its duration.
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
            {(binary ? ["On", "Off"] : history.labels).map((label) => (
              <span key={label} className="flex items-center gap-1.5">
                <i
                  className="size-2 rounded-full"
                  style={{ background: color(label) }}
                />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <i className="size-2 rounded-sm border border-dashed" />
              Unknown / gaps
            </span>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Stored window ·{" "}
        {history.duration
          ? ((history.covered / history.duration) * 100).toFixed(1)
          : "0"}
        % coverage · {durationLabel(history.unknown)} unknown. Validity is
        capped at {freshness}s.
      </p>
    </section>
  );
}
