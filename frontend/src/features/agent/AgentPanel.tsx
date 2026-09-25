import type { Answer, State } from "@/types";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelRightClose, Send } from "lucide-react";
import { api, time } from "@/types";
import { summaryTime, emailStatus, sessionLabel } from "@/lib/format";
import { Mark } from "@/components/Mark";

export function WinAvatar({ className = "" }: { className?: string }) {
  return <img className={`win-avatar ${className}`} src="/assets/win.webp" alt="" width="44" height="44" decoding="async"/>;
}

export function AgentPanel({ state, onCollapse }: { state: State; onCollapse?: () => void }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const ask = async (value = question) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    setAgentError("");
    setAnswer(null);
    setSubmittedQuestion(value);
    try {
      setAnswer(await api<Answer>(`/projects/${state.project.id}/sessions/${state.session.id}/agent`, { question: value }));
    } catch (error) {
      setAgentError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const prompts = ["What is the current state?", "What changed recently?", "Explain active events", "Which actions are permitted?"];
  const latestSummary = state.summaries?.[0];
  return <section className="panel agent-mini win-panel" aria-label="Win project assistant">
    <div className="agent-mini-heading win-heading">
      <WinAvatar/>
      <div className="win-heading-copy"><h3>Win</h3><p>Project AI Assistant</p></div>
      {onCollapse && <button className="win-collapse" type="button" aria-label="Collapse Win assistant" title="Collapse Win" onClick={onCollapse}><PanelRightClose size={17}/></button>}
    </div>
    <div className="agent-context win-context">
      <span>Project context</span>
      <strong title={state.project.name}>{state.project.name}</strong>
      <small><i className={`win-status-dot ${state.status === "reporting" ? "is-reporting" : ""}`}/>{sessionLabel(state.session.mode)} session <span aria-hidden="true">·</span> {state.status}</small>
    </div>
    <section className="win-summary" aria-label="Latest scheduled summary">
      <div className="win-summary-heading"><div className="win-summary-brand"><Mark className="size-5"/><strong>Agentwin summary</strong></div><span>{state.project.monitoring.summary_interval_minutes} min</span></div>
      {latestSummary ? <><time dateTime={new Date(latestSummary.period_end * 1000).toISOString()}>{summaryTime(latestSummary.period_end)}</time><p>{latestSummary.body}</p><div className="win-summary-footer"><span>{latestSummary.source === "local_model" ? "AI-assisted" : "Evidence summary"} · Email {emailStatus(latestSummary.email_status, state.project.monitoring.summary_email_enabled)}</span><Link to="/events">View in Events</Link></div></> : <p className="win-summary-pending">{state.project.monitoring.summary_enabled ? "The first live summary will appear after the next interval." : "Summaries are off for this project."}</p>}
    </section>
    <div className="win-suggestions">
      <span className="win-section-label">Suggested questions</span>
      <div className="agent-prompts">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div>
    </div>
    {!submittedQuestion && !busy && !agentError && !answer && <div className="win-empty-state">
      <WinAvatar/>
      <strong>Ask Win about this project</strong>
      <p>Explore readings, events, and permitted actions in this session.</p>
    </div>}
    {(submittedQuestion || busy || agentError || answer) && <div className="win-conversation" role="log" aria-label="Win conversation" aria-live="polite">
      {submittedQuestion && <div className="win-operator"><span>Operator</span><p>{submittedQuestion}</p></div>}
      {busy && <div className="win-assistant win-thinking"><WinAvatar/><div><span>Win</span><p>Checking project evidence…</p></div></div>}
      {agentError && <div className="win-error" role="alert"><p>{agentError}</p><button type="button" onClick={() => void ask(submittedQuestion)}>Retry</button></div>}
      {answer && <div className="win-assistant"><WinAvatar/><div className={`agent-answer win-response ${answer.available ? "" : "unavailable"}`}>
        <span>Win</span>
        <div><span>Finding</span><strong>{answer.finding}</strong></div>
        {answer.evidence.length > 0 && <div className="win-evidence"><span>Evidence</span>{answer.evidence.slice(0, 3).map((item) => <small key={item.id}>{item.id} · {time(item.timestamp)}</small>)}{answer.evidence.length > 3 && <details><summary>Show {answer.evidence.length - 3} more references</summary>{answer.evidence.slice(3).map((item) => <small key={item.id}>{item.id} · {time(item.timestamp)}</small>)}</details>}</div>}
        <div><span>Uncertainty</span><p>{answer.uncertainty}</p></div>
        <div><span>Next step</span><p>{answer.next_step}</p></div>
      </div></div>}
    </div>}
    <div className="agent-question win-composer">
      <textarea aria-label="Ask Win about this system" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="Ask Win about this system..." disabled={busy}/>
      <button type="button" onClick={() => void ask()} disabled={busy || !question.trim()} aria-label="Send question to Win" title="Send question"><Send size={17}/></button>
    </div>
    <p className="agent-guardrail">Actions require backend permission and operator confirmation. Device telemetry verifies completion.</p>
  </section>;
}
