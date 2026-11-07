import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, Eraser, PanelRightClose, Send } from "lucide-react";
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
import { ControlProposals } from "./ControlProposals";
import { ThinkingState } from "./ThinkingState";

function WinAvatar({ className }: { className?: string }) {
  return <img className={cn("size-11 shrink-0 rounded-full", className)} src="/assets/win.webp" alt="" width="44" height="44" decoding="async" />;
}

const prompts = ["What is the current state?", "What changed recently?", "Explain active events", "Which actions are permitted?"];
const graphemeSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function LetterReveal({ text }: { text: string }) {
  const block = useRef<HTMLSpanElement>(null);
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  useLayoutEffect(() => {
    const root = block.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spans = Array.from(root.querySelectorAll<HTMLElement>(".t-stream-w"));
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stream-gap")) || 20;
    spans.forEach((span) => { span.style.transition = "none"; span.classList.remove("is-in"); });
    void root.offsetWidth;
    spans.forEach((span) => { span.style.transition = ""; });
    let timer = 0;
    const next = (index: number) => {
      if (index >= spans.length) return;
      spans[index].classList.add("is-in");
      timer = window.setTimeout(() => next(index + 1), gap);
    };
    next(0);
    return () => window.clearTimeout(timer);
  }, [text]);
  return <span ref={block} className="t-stream" role="text" aria-label={text}>{words.map((word, index) => !word || /^\s+$/.test(word) ? word : <span key={index} className="inline-block whitespace-nowrap" aria-hidden="true">{(graphemeSegmenter ? Array.from(graphemeSegmenter.segment(word), (part) => part.segment) : Array.from(word)).map((letter, letterIndex) => <span key={letterIndex} className="t-stream-w is-in">{letter}</span>)}</span>)}</span>;
}

function NextEmailCountdown({ state }: { state: State }) {
  const due = state.next_summary_email_due;
  const serverTime = Number.isFinite(state.server_time) ? state.server_time : Date.now() / 1000;
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((due ?? 0) - serverTime)));
  useLayoutEffect(() => {
    if (due == null) return;
    const initial = Math.max(0, due - serverTime);
    const started = performance.now();
    const tick = () => setRemaining(Math.max(0, Math.ceil(initial - (performance.now() - started) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [due, serverTime]);
  if (due == null) return <span>{state.project.monitoring.summary_enabled && state.project.monitoring.summary_email_enabled ? "Email not configured" : "Email off"}</span>;
  if (remaining === 0) return <span>Next email due</span>;
  const hours = Math.floor(remaining / 3600);
  const minutes = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");
  return <span className="tabular-nums" title={`Scheduled for ${new Date(due * 1000).toLocaleString()}`}>Next email in {hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`}</span>;
}

export function AgentPanel({ state, onCollapse, refresh }: { state: State; onCollapse?: () => void; refresh?: () => void }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [requestTiming, setRequestTiming] = useState<{ started: number; elapsed: number | null } | null>(null);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const dismissalKey = `agentwin-chat-cleared:${state.project.id}:${state.session.id}`;
  const [hiddenCommands, setHiddenCommands] = useState<Set<string>>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(dismissalKey) || "[]");
      return new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []);
    } catch { return new Set(); }
  });
  const [cleared, setCleared] = useState(false);
  const [chatVersion, setChatVersion] = useState(0);
  const clearChat = () => {
    if (busy) return;
    const hidden = new Set([...hiddenCommands, ...state.actions.filter(action => action.proposal).map(action => action.id), ...(answer?.control_proposal ? [answer.control_proposal.id] : [])]);
    setHiddenCommands(hidden);
    try { localStorage.setItem(dismissalKey, JSON.stringify([...hidden])); } catch { /* Clearing still works when browser storage is unavailable. */ }
    setQuestion(""); setSubmittedQuestion(""); setAnswer(null); setAgentError(""); setCleared(true);
    setRequestTiming(null);
    setChatVersion(version => version + 1);
  };
  const hasChat = !!(question || submittedQuestion || answer || agentError || state.actions.some(action => action.proposal && !hiddenCommands.has(action.id)));
  const ask = async (value = question) => {
    if (!value.trim() || busy) return;
    if (value.trim().toLowerCase() === "/clear") { clearChat(); return; }
    const started = performance.now();
    setRequestTiming({ started, elapsed: null });
    setBusy(true); setCleared(false); setQuestion(""); setAgentError(""); setAnswer(null); setSubmittedQuestion(value);
    try {
      const response = await api<Answer>(`/projects/${state.project.id}/sessions/${state.session.id}/agent`, { question: value });
      if (mounted.current) {
        const proposal = response.control_proposal;
        if (proposal) setHiddenCommands(previous => {
          if (!previous.has(proposal.id)) return previous;
          const visible = new Set(previous);
          visible.delete(proposal.id);
          try { localStorage.setItem(dismissalKey, JSON.stringify([...visible])); } catch { /* The current reply stays visible without browser storage. */ }
          return visible;
        });
        setAnswer(response);
      }
    }
    catch (error) { if (mounted.current) setAgentError((error as Error).message); }
    finally {
      if (mounted.current) {
        setRequestTiming({ started, elapsed: performance.now() - started });
        setBusy(false); refresh?.();
      }
    }
  };
  const latestSummary = state.summaries?.[0];
  const reference = (item: Answer["evidence"][number]) => <small key={item.id} className="block text-xs text-muted-foreground">{item.id} · {time(item.timestamp)}</small>;
  return (
    <Card className="agent-mini flex h-full max-h-[inherit] flex-col gap-3.5 overflow-hidden rounded-[14px] bg-glass p-4 backdrop-blur max-md:h-[88svh]" aria-label="Win project assistant" role="region">
      <div className="flex shrink-0 items-center gap-[9px]">
        <WinAvatar />
        <div className="min-w-0 flex-1"><h3 className="mb-2 text-lg leading-tight font-bold">Win</h3><p className="mt-[3px] text-xs text-muted-foreground">Project AI Assistant</p></div>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground" disabled={busy || !hasChat} onClick={clearChat} title="Clear chat (/clear). Sent commands are not cancelled."><Eraser className="size-3.5" />Clear chat</Button>
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
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Mark className="size-5" /><strong className="text-xs font-bold">Win summary</strong></div><span className="text-[11px] text-subtle-foreground">{state.project.monitoring.summary_interval_minutes} min</span></div>
            {latestSummary ? (
              <>
                <time className="text-xs text-muted-foreground" dateTime={new Date(latestSummary.period_end * 1000).toISOString()}>{summaryTime(latestSummary.period_end)}</time>
                <p className="text-[13px]"><LetterReveal key={latestSummary.id} text={latestSummary.body} /></p>
              </>
            ) : <p className="text-xs text-subtle-foreground">{state.project.monitoring.summary_enabled ? "The first live summary will appear after the next interval." : "Summaries are off for this project."}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="inline-flex flex-wrap items-center gap-1" aria-live="off">
                {latestSummary?.source === "local_model" && <>AI-assisted<span aria-hidden="true">·</span></>}
                {latestSummary?.email_status === "sent" && <CircleCheck className="size-3.5 text-success" role="img" aria-label="Previous summary email sent" />}
                {latestSummary && !["sent", "not_configured"].includes(latestSummary.email_status) && <span>Previous email {emailStatus(latestSummary.email_status, true)} <span aria-hidden="true">·</span></span>}
                <NextEmailCountdown state={state} />
              </span>
              {latestSummary && <Link className="text-brand hover:underline" to="/events">View in Events</Link>}
            </div>
          </section>
          <div className="grid gap-2 border-b pb-3.5">
            <span className="text-[11px] font-bold tracking-[0.02em] text-muted-foreground">Suggested questions</span>
            <div className="flex flex-wrap gap-2">{prompts.map((prompt) => <Button key={prompt} type="button" variant="outline" size="sm" className="h-auto rounded-lg bg-muted px-[9px] py-[5px] text-xs font-normal text-subtle-foreground" onClick={() => setQuestion(prompt)}>{prompt}</Button>)}</div>
          </div>
          {cleared && <p role="status" className="text-xs text-muted-foreground">Chat cleared. Device commands are unchanged.</p>}
          {!submittedQuestion && !busy && !agentError && !answer && (
            <div className="flex flex-col items-center gap-[7px] px-5 py-2.5 text-center max-[1180px]:hidden"><WinAvatar className="size-[90px]" /><strong className="text-sm font-[650]">Ask Win about this project</strong><p className="max-w-[260px] text-xs leading-[1.45] text-muted-foreground">Explore readings, events, and permitted actions in this session.</p></div>
          )}
          {(submittedQuestion || busy || agentError || answer) && (
            <div className="grid gap-3" role="log" aria-label="Win conversation" aria-live="polite">
              {submittedQuestion && <div className="ml-auto w-fit max-w-[85%] rounded-[10px] border border-brand-border bg-brand-subtle px-2.5 py-2"><span className="block text-[11px] font-bold text-muted-foreground">Operator</span><p className="text-xs">{submittedQuestion}</p></div>}
              {requestTiming && <ThinkingState key={requestTiming.started} busy={busy} started={requestTiming.started} elapsed={requestTiming.elapsed} answer={answer} error={agentError} context={`${state.project.name} · ${sessionLabel(state.session.mode)} session`} />}
              {agentError && <div className="grid gap-2"><Alert variant="destructive"><AlertDescription>{agentError}</AlertDescription></Alert><Button size="sm" variant="outline" className="justify-self-start" onClick={() => void ask(submittedQuestion)}>Retry</Button></div>}
              {answer?.control_proposal?.status === "failed" && <p role="alert" className="rounded-lg border border-danger-border bg-danger-subtle p-2 text-xs text-destructive">{answer.uncertainty}</p>}
              {answer && !answer.control_proposal && (
                <div className="grid gap-1.5">
                  <WinAvatar className="size-7" />
                  <div className={cn("ml-8 grid gap-3 rounded-[10px] border p-2.5 text-xs", answer.available ? "bg-muted" : "border-warning-border bg-warning-subtle")}>
                    <span className="block text-[11px] font-bold text-muted-foreground">Win</span>
                    <div><span className="block text-[11px] font-bold text-muted-foreground">Finding</span><strong className="text-[13px] font-bold"><LetterReveal text={answer.finding} /></strong></div>
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
                    <div><span className="block text-[11px] font-bold text-muted-foreground">Uncertainty</span><p className="text-xs leading-[1.45] text-subtle-foreground"><LetterReveal text={answer.uncertainty} /></p></div>
                    <div><span className="block text-[11px] font-bold text-muted-foreground">Next step</span><p className="text-xs leading-[1.45] text-subtle-foreground"><LetterReveal text={answer.next_step} /></p></div>
                  </div>
                </div>
              )}
            </div>
          )}
          <ControlProposals key={chatVersion} state={state} latest={answer?.control_proposal} hiddenIds={hiddenCommands} refresh={refresh} />
        </div>
      </ScrollArea>
      <div className="grid shrink-0 gap-3.5">
        <div className="relative">
          <Textarea aria-label="Ask Win about this system" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="Ask Win about this system..." disabled={busy} className="min-h-[74px] resize-y rounded-[9px] bg-background py-2.5 dark:bg-background pr-[49px] pl-[11px] text-[13px] md:text-[13px]" />
          <Button type="button" size="icon" className="absolute right-2 bottom-2 size-[34px] rounded-lg" onClick={() => void ask()} disabled={busy || !question.trim()} aria-label="Send question to Win" title="Send question"><Send /></Button>
        </div>
        <p className="border-t pt-[11px] text-[11px] leading-[1.45] text-muted-foreground">Direct commands are sent to configured Live devices. Device telemetry confirms completion.</p>
      </div>
    </Card>
  );
}
