import { useEffect, useId, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { onboardingProgress, type SetupRecord } from "./setupProgress";
import "./onboarding.css";

type Props = {
  configured: boolean;
  record: SetupRecord;
  evidence: { reporting: boolean; verified: boolean; note: string };
  canConfirmUpload: boolean;
  onToggleUpload: () => void;
  recordError: string;
};

export function OnboardingProgress({ configured, record, evidence, canConfirmUpload, onToggleUpload, recordError }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const progress = onboardingProgress(configured, record, evidence);
  useEffect(() => {
    if (!progress.complete) setExpanded(false);
  }, [progress.complete]);
  const showFull = !progress.complete || expanded;
  return <Card className="onboarding-progress gap-3 p-4" role="region" aria-label="Device setup progress">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {showFull && <h3 className="text-sm font-semibold">Setup progress</h3>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" tabIndex={0} className={`gap-1.5 ${progress.steps[4].done ? "border-[var(--operational-cyan)]/35 text-[var(--operational-cyan)]" : "text-foreground"}`} aria-label={`Current confirmed state: ${progress.status}`}>
              <span aria-hidden="true" className={`size-1.5 rounded-full ${progress.steps[3].done ? "bg-[var(--operational-cyan)]" : "bg-brand"}`} />
              {progress.status}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{progress.complete ? "All setup stages have evidence. Telemetry verification does not verify wiring or sensor accuracy." : "Latest confirmed evidence. Unrecorded earlier actions remain incomplete."}</TooltipContent>
        </Tooltip>
      </div>
      {progress.complete && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpanded(!expanded)} aria-expanded={showFull} aria-controls={panelId}>
        {expanded ? "Hide setup progress" : "View setup progress"}{expanded ? <ChevronUp /> : <ChevronDown />}
      </Button>}
    </div>
    {showFull && <div id={panelId} className="grid gap-3">
      <ol aria-label="Device onboarding progress" className="onboarding-steps">
        {progress.steps.map((step, index) => <li key={step.id} data-complete={step.done} aria-current={index === progress.currentIndex ? "step" : undefined} className="onboarding-step">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="onboarding-stage" aria-label={`${step.label} details`}>
                <span aria-hidden="true" className="onboarding-marker">{step.done ? <Check size={12} /> : index + 1}</span>
                <span className="onboarding-label">{step.label}<span className="sr-only">{step.done ? ": complete" : ": pending"}{index === progress.currentIndex && !progress.complete ? ", next setup step" : ""}</span></span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{step.tip}</TooltipContent>
          </Tooltip>
        </li>)}
      </ol>
      <p role="status" className="text-xs leading-relaxed text-muted-foreground">{evidence.note}</p>
      {record.downloadedAt && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="outline" size="sm" disabled={!canConfirmUpload} onClick={onToggleUpload}>{record.flashedAt ? "Undo upload confirmation" : "I uploaded this package"}</Button>
        <span className="text-[11px] text-muted-foreground">Upload confirmation is recorded in this browser.</span>
      </div>}
      {!progress.complete && evidence.verified && <p className="text-xs text-muted-foreground">Telemetry is verified; earlier download/upload actions have not all been recorded in this browser.</p>}
      {recordError && <p role="status" className="text-xs text-muted-foreground">{recordError}</p>}
    </div>}
    {!showFull && <div id={panelId} hidden className="hidden" />}
  </Card>;
}
