import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelRightClose, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Mark } from "@/components/Mark";
import { emailStatus, sessionLabel, summaryTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Answer, State } from "@/types";
import { api, time } from "@/types";

function WinAvatar({ className }: { className?: string }) {
  return <img className={cn("size-11 shrink-0 rounded-full", className)} src="/assets/win.webp" alt="" width="44" height="44" decoding="async" />;
}

const prompts = ["What is the current state?", "What changed recently?", "Explain active events", "Which actions are permitted?"];

export function AgentPanel({ state, onCollapse }: { state: State; onCollapse?: () => void }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const ask = async (value = question) => {
    if (!value.trim() || busy) return;
    setBusy(true); setAgentError(""); setAnswer(null); setSubmittedQuestion(value);
    try { setAnswer(await api<Answer>(`/projects/${state.project.id}/sessions/${state.session.id}/agent`, { question: value })); }
    catch (error) { setAgentError((error as Error).message); }
    finally { setBusy(false); }
  };
  const latestSummary = state.summaries?.[0];
  const reference = (item: Answer["evidence"][number]) => <small key={item.id} className="block text-xs text-muted-foreground">{item.id} · {time(item.timestamp)}</small>;
  return (
    <Card className="agent-mini flex h-full max-h-[inherit] flex-col gap-3.5 overflow-hidden rounded-[14px] bg-glass p-4 backdrop-blur" aria-label="Win project assistant" role="region">
      <div className="flex items-center gap-[9px]">
        <WinAvatar />
        <div className="min-w-0 flex-1"><h3 className="text-lg leading-tight font-bold">Win</h3><p className="mt-[3px] text-xs text-muted-foreground">Project AI Assistant</p></div>
        {onCollapse && <Button variant="outline" size="icon" className="rounded-lg text-subtle-foreground" aria-label="Collapse Win assistant" title="Collapse Win" onClick={onCollapse}><PanelRightClose /></Button>}
      </div>
      <ScrollArea className="-mx-4 min-h-0 flex-1">
        <div className="grid gap-3.5 px-4">
          <div className="grid gap-[5px] rounded-[9px] border bg-muted px-3 py-[11px]">
            <span className="text-[11px] font-bold tracking-[0.02em] text-muted-foreground">Project context</span>
            <strong className="block truncate text-[13px] font-bold" title={state.project.name}>{state.project.name}</strong>
            <small className="flex items-center gap-[5px] text-xs text-subtle-foreground capitalize"><i className={cn("size-[7px] rounded-full", state.status === "reporting" ? "bg-success" : "bg-warning")} />{sessionLabel(state.session.mode)} session <span aria-hidden="true">·</span> {state.status}</small>
          </div>
          <section className="grid gap-[9px] rounded-[10px] border border-brand-border bg-brand-subtle p-3" aria-label="Latest scheduled summary">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Mark className="size-5" /><strong className="text-xs font-bold">Agentwin summary</strong></div><span className="text-[11px] text-subtle-foreground">{state.project.monitoring.summary_interval_minutes} min</span></div>
            {latestSummary ? (
              <>
                <time className="text-xs text-muted-foreground" dateTime={new Date(latestSummary.period_end * 1000).toISOString()}>{summaryTime(latestSummary.period_end)}</time>
                <p className="text-[13px]">{latestSummary.body}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{latestSummary.source === "local_model" ? "AI-assisted" : "Evidence summary"} · Email {emailStatus(latestSummary.email_status, state.project.monitoring.summary_email_enabled)}</span><Link className="text-brand hover:underline" to="/events">View in Events</Link></div>
              </>
            ) : <p className="text-xs text-subtle-foreground">{state.project.monitoring.summary_enabled ? "The first live summary will appear after the next interval." : "Summaries are off for this project."}</p>}
          </section>
          <div className="grid gap-2 border-b pb-3.5">
            <span className="text-[11px] font-bold tracking-[0.02em] text-muted-foreground">Suggested questions</span>
            <div className="flex flex-wrap gap-2">{prompts.map((prompt) => <Button key={prompt} type="button" variant="outline" size="sm" className="h-auto rounded-lg bg-muted px-[9px] py-[5px] text-xs font-normal text-subtle-foreground" onClick={() => setQuestion(prompt)}>{prompt}</Button>)}</div>
          </div>
          {!submittedQuestion && !busy && !agentError && !answer && (
            <div className="flex flex-col items-center gap-[7px] px-5 py-2.5 text-center max-[1180px]:hidden"><WinAvatar className="size-[90px]" /><strong className="text-sm font-[650]">Ask Win about this project</strong><p className="max-w-[260px] text-xs leading-[1.45] text-muted-foreground">Explore readings, events, and permitted actions in this session.</p></div>
          )}
          {(submittedQuestion || busy || agentError || answer) && (
            <div className="grid gap-3" role="log" aria-label="Win conversation" aria-live="polite">
              {submittedQuestion && <div className="ml-auto w-fit max-w-[85%] rounded-[10px] border border-brand-border bg-brand-subtle px-2.5 py-2"><span className="block text-[11px] font-bold text-muted-foreground">Operator</span><p className="text-xs">{submittedQuestion}</p></div>}
              {busy && <div className="grid gap-1.5"><WinAvatar className="size-7" /><div className="ml-8 rounded-[10px] border bg-muted px-2.5 py-2"><span className="block text-[11px] font-bold text-muted-foreground">Win</span><p className="animate-pulse text-xs">Checking project evidence…</p></div></div>}
              {agentError && <div className="grid gap-2"><Alert variant="destructive"><AlertDescription>{agentError}</AlertDescription></Alert><Button size="sm" variant="outline" className="justify-self-start" onClick={() => void ask(submittedQuestion)}>Retry</Button></div>}
              {answer && (
                <div className="grid gap-1.5">
                  <WinAvatar className="size-7" />
                  <div className={cn("ml-8 grid gap-3 rounded-[10px] border p-2.5 text-xs", answer.available ? "bg-muted" : "border-warning-border bg-warning-subtle")}>
                    <span className="block text-[11px] font-bold text-muted-foreground">Win</span>
                    <div><span className="block text-[11px] font-bold text-muted-foreground">Finding</span><strong className="text-[13px] font-bold">{answer.finding}</strong></div>
                    {answer.evidence.length > 0 && (
                      <div>
                        <span className="block text-[11px] font-bold text-muted-foreground">Evidence</span>
                        {answer.evidence.slice(0, 3).map(reference)}
                        {answer.evidence.length > 3 && (
                          <Collapsible>
                            <CollapsibleTrigger asChild><Button variant="link" size="sm" className="h-auto p-0 text-xs">Show {answer.evidence.length - 3} more references</Button></CollapsibleTrigger>
                            <CollapsibleContent>{answer.evidence.slice(3).map(reference)}</CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    )}
                    <div><span className="block text-[11px] font-bold text-muted-foreground">Uncertainty</span><p className="text-xs leading-[1.45] text-subtle-foreground">{answer.uncertainty}</p></div>
                    <div><span className="block text-[11px] font-bold text-muted-foreground">Next step</span><p className="text-xs leading-[1.45] text-subtle-foreground">{answer.next_step}</p></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="grid gap-3.5">
        <div className="relative">
          <Textarea aria-label="Ask Win about this system" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="Ask Win about this system..." disabled={busy} className="min-h-[74px] resize-y rounded-[9px] bg-background py-2.5 dark:bg-background pr-[49px] pl-[11px] text-[13px] md:text-[13px]" />
          <Button type="button" size="icon" className="absolute right-2 bottom-2 size-[34px] rounded-lg" onClick={() => void ask()} disabled={busy || !question.trim()} aria-label="Send question to Win" title="Send question"><Send /></Button>
        </div>
        <p className="border-t pt-[11px] text-[11px] leading-[1.45] text-muted-foreground">Actions require backend permission and operator confirmation. Device telemetry verifies completion.</p>
      </div>
    </Card>
  );
}
