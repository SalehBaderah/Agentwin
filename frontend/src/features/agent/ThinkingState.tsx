import { useState } from "react";
import { Check, ChevronDown, CircleAlert, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Answer } from "@/types";
import { LoadingState, LoaderGrid, formatElapsed } from "./LoadingState";

type ActivityRow = { label: string; detail?: string; status: "complete" | "pending" | "warning" };

/** Expandable request activity. Internal model/tool steps are not exposed by this API. */
export function ThinkingState({ busy, started, elapsed, answer, error, context }: {
  busy: boolean;
  started: number;
  elapsed: number | null;
  answer: Answer | null;
  error: string;
  context: string;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? busy;
  const warning = !!error || (!!answer && !answer.available);
  const label = error ? "Request failed" : warning ? "Agent unavailable" : "Response received";
  const rows: ActivityRow[] = [
    { label: "Request sent", detail: context, status: "complete" },
    busy ? { label: "Waiting for Win response", status: "pending" }
      : { label, detail: error || (answer?.source === "controller" ? "Device controller response" : undefined), status: warning ? "warning" : "complete" },
  ];
  if (answer?.evidence.length) rows.push({ label: `${answer.evidence.length} evidence ${answer.evidence.length === 1 ? "reference" : "references"} returned`, status: "complete" });

  return (
    <Collapsible open={expanded} onOpenChange={setManualExpanded} className="win-request-activity min-w-0">
      <CollapsibleTrigger asChild>
        <button type="button" className="group -ml-1.5 flex max-w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={busy ? "Win request activity, waiting for response" : `Win request activity, ${label.toLowerCase()}`}>
          {busy ? <LoadingState started={started} /> : <>
            <Sparkles aria-hidden="true" className={cn("size-3.5 shrink-0", warning ? "text-warning" : "text-muted-foreground")} />
            <span role="status" className="text-[13px] font-medium text-subtle-foreground">{label}</span>
            {elapsed !== null && <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatElapsed(elapsed)}</span>}
          </>}
          <ChevronDown aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="win-activity-content overflow-hidden">
        <ol className="ml-[5px] grid gap-2 border-l py-2 pl-4 text-xs">
          {rows.map((row) => <li key={row.label} className="flex min-w-0 items-start gap-2">
            <span className="flex h-4 w-3.5 shrink-0 items-center justify-center">
              {row.status === "pending" ? <LoaderGrid variant="Dots" /> : row.status === "warning" ? <CircleAlert aria-hidden="true" className="size-3.5 text-warning" /> : <Check aria-hidden="true" className="size-3.5 text-muted-foreground" />}
            </span>
            <div className="min-w-0"><span className="text-subtle-foreground">{row.label}</span>{row.detail && <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">{row.detail}</p>}</div>
          </li>)}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
