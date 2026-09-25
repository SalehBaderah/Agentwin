import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, Clock3, Mail, Plus, Trash2 } from "lucide-react";
import type { MonitoringSettings as Monitoring, Project, State, ThresholdRule } from "@/types";
import { api } from "@/types";

const copy = (settings: Monitoring): Monitoring => ({
  ...settings,
  threshold_rules: settings.threshold_rules.map((rule) => ({ ...rule })),
});

export function ProjectMonitoringSettings({ states, emailConfigured, defaultRecipientConfigured }: { states: State[]; emailConfigured: boolean; defaultRecipientConfigured: boolean }) {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("project");
  const initial = states.find((state) => state.project.id === requested) ?? states[0];
  const [selectedId, setSelectedId] = useState(initial?.project.id ?? "");
  const [draft, setDraft] = useState<Monitoring | null>(initial ? copy(initial.project.monitoring) : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const lastRequested = useRef(requested);
  const selected = states.find((state) => state.project.id === selectedId);
  useEffect(() => {
    const routeChanged = lastRequested.current !== requested;
    if (!routeChanged && selected) return;
    const target = states.find((state) => state.project.id === requested) ?? selected ?? states[0];
    if (!target) return;
    lastRequested.current = requested;
    setSelectedId(target.project.id);
    setDraft(copy(target.project.monitoring));
    setMessage("");
  }, [requested, selected, states]);
  if (!selected || !draft) return <section className="panel monitoring-settings"><h2>Project monitoring</h2><p>Add a project to configure alerts and summaries.</p></section>;
  const project = selected.project;
  const numericFields = Object.entries(project.graph.fields).filter(([, field]) => field.data_type === "number");
  const change = (patch: Partial<Monitoring>) => { setDraft({ ...draft, ...patch }); setMessage(""); };
  const editRule = (index: number, patch: Partial<ThresholdRule>) => change({ threshold_rules: draft.threshold_rules.map((rule, current) => current === index ? { ...rule, ...patch } : rule) });
  const addRule = () => {
    const unused = numericFields.flatMap(([field_key]) => (["above", "below"] as const).map((direction) => ({ field_key, direction }))).find((candidate) => !draft.threshold_rules.some((rule) => rule.field_key === candidate.field_key && rule.direction === candidate.direction));
    if (unused) change({ threshold_rules: [...draft.threshold_rules, { ...unused, limit: Number.NaN }] });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.threshold_rules.some((rule) => !Number.isFinite(rule.limit))) { setFailed(true); setMessage("Enter a number for every limit."); return; }
    const keys = draft.threshold_rules.map((rule) => `${rule.field_key}:${rule.direction}`);
    if (keys.length !== new Set(keys).size) { setFailed(true); setMessage("Each field can have only one above and one below limit."); return; }
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const saved = await api<Project>(`/projects/${project.id}/settings`, {
        freshness_seconds: project.freshness_seconds,
        high_limit: project.high_limit,
        cable_description: project.cable_description,
        monitoring: { ...draft, email_to: draft.email_to?.trim() || null },
      }, "PUT");
      setDraft(copy(saved.monitoring));
      setMessage("Monitoring settings saved.");
    } catch (error) {
      setFailed(true); setMessage((error as Error).message);
    } finally { setBusy(false); }
  };
  return <section className="panel monitoring-settings" aria-label="Project monitoring settings">
    <div className="monitoring-heading"><div><h2>Project monitoring</h2><p>Rules apply to live device data. New projects start with silence monitoring and no threshold limits.</p></div><label>Project<select value={selectedId} onChange={(event) => { const next = states.find((state) => state.project.id === event.target.value); if (next) { setSelectedId(next.project.id); setDraft(copy(next.project.monitoring)); setMessage(""); } }}>{states.map((state) => <option key={state.project.id} value={state.project.id}>{state.project.name}</option>)}</select></label></div>
    <form onSubmit={save}>
      <div className="monitoring-block"><div className="monitoring-block-title"><Bell size={17}/><div><h3>Alerts</h3><p>Silence is checked per device after its first valid reading.</p></div></div>
        <label className="monitoring-field">Alert after device silence<input type="number" min={project.freshness_seconds} max="86400" required value={draft.silence_seconds} onChange={(event) => change({ silence_seconds: Number(event.target.value) })}/><small>Seconds; at least the project's {project.freshness_seconds}s freshness limit.</small></label>
        <div className="monitoring-rule-heading"><div><strong>Optional threshold rules</strong><small>Only numeric fields can use limits. No rule means no threshold alert.</small></div><button className="tertiary" type="button" onClick={addRule} disabled={!numericFields.length || draft.threshold_rules.length >= numericFields.length * 2}><Plus size={15}/> Add limit</button></div>
        {draft.threshold_rules.map((rule, index) => <div className="monitoring-rule" key={`${index}-${rule.field_key}-${rule.direction}`}><label>Field<select value={rule.field_key} onChange={(event) => editRule(index, { field_key: event.target.value })}>{numericFields.map(([key, field]) => <option key={key} value={key}>{field.label} ({field.unit || key})</option>)}</select></label><label>When<select value={rule.direction} onChange={(event) => editRule(index, { direction: event.target.value as ThresholdRule["direction"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>Limit<input type="number" step="any" required value={Number.isNaN(rule.limit) ? "" : rule.limit} onChange={(event) => editRule(index, { limit: event.target.value === "" ? Number.NaN : Number(event.target.value) })}/></label><button className="monitoring-remove" type="button" aria-label={`Remove limit ${index + 1}`} onClick={() => change({ threshold_rules: draft.threshold_rules.filter((_, current) => current !== index) })}><Trash2 size={16}/></button></div>)}
        {!draft.threshold_rules.length && <p className="monitoring-empty">No threshold alerts for this project.</p>}
      </div>
      <div className="monitoring-block"><div className="monitoring-block-title"><Clock3 size={17}/><div><h3>Scheduled summaries</h3><p>One live-session summary is saved in Win and Events each interval.</p></div></div><label className="monitoring-check"><input type="checkbox" checked={draft.summary_enabled} onChange={(event) => change({ summary_enabled: event.target.checked })}/> Create summaries automatically</label><label className="monitoring-field">Every <span className="monitoring-inline"><input type="number" min="1" max="1440" step="1" required value={draft.summary_interval_minutes} onChange={(event) => change({ summary_interval_minutes: Number(event.target.value) })}/> minutes</span><small>Any whole number from 1 to 1,440. Changing this starts a new interval.</small></label></div>
      <div className="monitoring-block"><div className="monitoring-block-title"><Mail size={17}/><div><h3>Email delivery</h3><p>Alerts and summaries use the same configured recipient.</p></div></div><label className="monitoring-field">Recipient email<input type="email" value={draft.email_to ?? ""} onChange={(event) => change({ email_to: event.target.value || null })} placeholder={defaultRecipientConfigured ? "Using server default" : "operator@example.com"}/><small>Leave empty to use the server default recipient, if configured.</small></label><div className="monitoring-checks"><label className="monitoring-check"><input type="checkbox" checked={draft.alert_email_enabled} onChange={(event) => change({ alert_email_enabled: event.target.checked })}/> Email new alerts</label><label className="monitoring-check"><input type="checkbox" checked={draft.summary_email_enabled} onChange={(event) => change({ summary_email_enabled: event.target.checked })}/> Email each summary</label></div><p className={`monitoring-delivery ${emailConfigured && (draft.email_to || defaultRecipientConfigured) ? "ready" : "needs-setup"}`}>{!emailConfigured ? "Email is not ready: configure SMTP in the backend .env file." : draft.email_to || defaultRecipientConfigured ? "SMTP sender and recipient are configured." : "Add a recipient here or set a server default to send email."}</p></div>
      <div className="monitoring-actions"><p role="status" className={failed ? "error-text" : ""}>{message}</p><button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save monitoring settings"}</button></div>
    </form>
  </section>;
}
