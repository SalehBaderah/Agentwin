import { useEffect, useState, type CSSProperties } from "react";

const chevron = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3), column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});
const orbitOrder = [0, 1, 2, 5, 8, 7, 6, 3];
const patterns = {
  Drive: { delays: chevron as (number | null)[], duration: 650, round: false },
  Dots: { delays: chevron as (number | null)[], duration: 650, round: true },
  Orbit: { delays: Array.from({ length: 9 }, (_, index) => orbitOrder.includes(index) ? orbitOrder.indexOf(index) * 110 : null), duration: 950, round: false },
};

export function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, milliseconds) / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
}

export function LoaderGrid({ variant = "Drive" }: { variant?: keyof typeof patterns }) {
  const pattern = patterns[variant];
  return (
    <span aria-hidden="true" className="win-loader-grid grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px] text-brand">
      {pattern.delays.map((delay, index) => <span key={index} className="win-loader-pixel size-1 bg-current" style={{
        borderRadius: pattern.round ? "50%" : "1px",
        opacity: delay === null ? 0.07 : 0.15,
        "--pixel-delay": `${delay ?? 0}ms`,
        "--pixel-duration": `${pattern.duration}ms`,
        animation: delay === null ? "none" : undefined,
      } as CSSProperties} />)}
    </span>
  );
}

/** The timer measures the pending HTTP request, not model reasoning or device execution. */
export function LoadingState({ started, label = "Waiting for Win", variant = "Drive" }: { started: number; label?: string; variant?: keyof typeof patterns }) {
  const [elapsed, setElapsed] = useState(() => performance.now() - started);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 100);
    return () => window.clearInterval(timer);
  }, [started]);
  return (
    <span role="status" className="inline-flex min-w-0 flex-wrap items-center gap-2.5">
      <LoaderGrid variant={variant} />
      <span className="win-loading-label text-[13px] font-medium text-subtle-foreground">{label}</span>
      <span aria-hidden="true" className="font-mono text-xs text-muted-foreground tabular-nums">{formatElapsed(elapsed)}</span>
    </span>
  );
}
