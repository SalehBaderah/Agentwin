import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, Clock3, Mail, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OptionSelect } from "@/components/OptionSelect";
import { cn } from "@/lib/utils";
import type { MonitoringSettings as Monitoring, Project, State, ThresholdRule } from "@/types";
import { api } from "@/types";

const copy = (settings: Monitoring): Monitoring => ({
  ...settings,
  threshold_rules: settings.threshold_rules.map((rule) => ({ ...rule })),
});

function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id} className="mb-[7px] text-[13px] font-semibold">{label}</Label>
      {children}
      {hint && <p className="text-xs leading-normal text-subtle-foreground">{hint}</p>}
    </div>
  );
}

function Block({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="border-t py-[22px]">
      <div className="mb-[18px] flex items-center gap-[18px] [&>svg]:size-[17px] [&>svg]:shrink-0 [&>svg]:text-brand">
        {icon}
        <div><h3 className="m-0 text-[15px] leading-normal font-bold">{title}</h3><p className="mt-1 text-xs leading-normal text-subtle-foreground">{description}</p></div>
      </div>
      {children}
    </div>
  );
}

function SwitchRow({ id, checked, onCheckedChange, children }: { id: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <div className="flex items-center gap-2"><Switch id={id} checked={checked} onCheckedChange={onCheckedChange} /><Label htmlFor={id} className="text-[13px] font-normal text-subtle-foreground">{children}</Label></div>;
}

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
  if (!selected || !draft) return <Card className="mb-1 gap-0 p-[26px] max-[760px]:p-5"><h2 className="text-lg leading-normal font-bold tracking-[-0.3px]">Project monitoring</h2><p className="mt-1 text-sm text-muted-foreground">Add a project to configure alerts and summaries.</p></Card>;
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
  const selectProject = (value: string) => {
    const next = states.find((state) => state.project.id === value);
    if (next) { setSelectedId(next.project.id); setDraft(copy(next.project.monitoring)); setMessage(""); }
  };
  const deliveryReady = emailConfigured && (draft.email_to || defaultRecipientConfigured);
  return (
    <Card className="mb-1 gap-0 p-[26px] max-[760px]:p-5" aria-label="Project monitoring settings" role="region">
      <div className="monitoring-heading flex items-start justify-between gap-[18px] max-[760px]:flex-col">
        <div>
          <h2 className="mb-[5px] text-lg leading-normal font-bold tracking-[-0.3px]">Project monitoring</h2>
          <p className="text-xs leading-normal text-subtle-foreground">Rules apply to live device data. New projects start with silence monitoring and no threshold limits.</p>
        </div>
        <Field id="monitoring-project" label="Project" className="min-w-[200px] shrink-0 max-[760px]:w-full">
          <OptionSelect id="monitoring-project" value={selectedId} onValueChange={selectProject} options={states.map((state) => ({ value: state.project.id, label: state.project.name }))} />
        </Field>
      </div>
      <form onSubmit={save} className="mt-10">
        <Block icon={<Bell />} title="Alerts" description="Silence is checked per device after its first valid reading.">
          <Field id="silence" label="Alert after device silence" hint={`Seconds; at least the project's ${project.freshness_seconds}s freshness limit.`} className="max-w-[370px]">
            <Input id="silence" type="number" min={project.freshness_seconds} max="86400" required value={draft.silence_seconds} onChange={(event) => change({ silence_seconds: Number(event.target.value) })} />
          </Field>
          <div className="mt-[22px] mb-2.5 flex items-center justify-between gap-[18px] max-[760px]:items-start">
            <div>
              <strong className="block text-[13px] font-bold">Optional threshold rules</strong>
              <span className="mt-1 block text-xs leading-normal text-subtle-foreground">Only numeric fields can use limits. No rule means no threshold alert.</span>
            </div>
            <Button type="button" variant="outline" size="lg" className="gap-1.5 px-3.5 font-normal text-subtle-foreground [&_svg]:size-[15px]" onClick={addRule} disabled={!numericFields.length || draft.threshold_rules.length >= numericFields.length * 2}><Plus />Add limit</Button>
          </div>
          {draft.threshold_rules.map((rule, index) => (
            <div key={`${index}-${rule.field_key}-${rule.direction}`} className="mt-2.5 grid max-w-[740px] grid-cols-[minmax(160px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_44px] items-end gap-2.5 max-[760px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]">
              <Field id={`rule-${index}-field`} label="Field" className="max-[760px]:col-span-full">
                <OptionSelect id={`rule-${index}-field`} value={rule.field_key} onValueChange={(value) => editRule(index, { field_key: value })} options={numericFields.map(([key, field]) => ({ value: key, label: `${field.label} (${field.unit || key})` }))} />
              </Field>
              <Field id={`rule-${index}-direction`} label="When">
                <OptionSelect id={`rule-${index}-direction`} value={rule.direction} onValueChange={(value) => editRule(index, { direction: value as ThresholdRule["direction"] })} options={[{ value: "above", label: "Above" }, { value: "below", label: "Below" }]} />
              </Field>
              <Field id={`rule-${index}-limit`} label="Limit">
                <Input id={`rule-${index}-limit`} type="number" step="any" required value={Number.isNaN(rule.limit) ? "" : rule.limit} onChange={(event) => editRule(index, { limit: event.target.value === "" ? Number.NaN : Number(event.target.value) })} />
              </Field>
              <Button type="button" variant="outline" size="icon" className="size-11 rounded-[10px] bg-transparent text-subtle-foreground hover:border-danger-border hover:text-danger dark:bg-transparent" aria-label={`Remove limit ${index + 1}`} onClick={() => change({ threshold_rules: draft.threshold_rules.filter((_, current) => current !== index) })}><Trash2 /></Button>
            </div>
          ))}
          {!draft.threshold_rules.length && <p className="mt-2 text-[13px] text-muted-foreground">No threshold alerts for this project.</p>}
        </Block>
        <Block icon={<Clock3 />} title="Scheduled summaries" description="One live-session summary is saved in Win and Events each interval.">
          <SwitchRow id="summary-enabled" checked={draft.summary_enabled} onCheckedChange={(checked) => change({ summary_enabled: checked })}>Create summaries automatically</SwitchRow>
          <Field id="summary-interval" label="Every" hint="Any whole number from 1 to 1,440. Changing this starts a new interval." className="mt-[15px] max-w-[370px]">
            <div className="flex items-center gap-2">
              <Input id="summary-interval" type="number" min="1" max="1440" step="1" required className="w-[95px]" value={draft.summary_interval_minutes} onChange={(event) => change({ summary_interval_minutes: Number(event.target.value) })} />
              <span className="text-[13px] font-semibold">minutes</span>
            </div>
          </Field>
        </Block>
        <Block icon={<Mail />} title="Email delivery" description="Alerts and summaries use the same configured recipient.">
          <Field id="email-to" label="Recipient email" hint="Leave empty to use the server default recipient, if configured." className="max-w-[370px]">
            <Input id="email-to" type="email" value={draft.email_to ?? ""} onChange={(event) => change({ email_to: event.target.value || null })} placeholder={defaultRecipientConfigured ? "Using server default" : "operator@example.com"} />
          </Field>
          <div className="mt-[15px] flex flex-wrap gap-x-[26px] gap-y-2">
            <SwitchRow id="alert-email" checked={draft.alert_email_enabled} onCheckedChange={(checked) => change({ alert_email_enabled: checked })}>Email new alerts</SwitchRow>
            <SwitchRow id="summary-email" checked={draft.summary_email_enabled} onCheckedChange={(checked) => change({ summary_email_enabled: checked })}>Email each summary</SwitchRow>
          </div>
          <p className={cn("mt-[15px] text-xs leading-[1.65]", deliveryReady ? "text-success" : "text-warning")}>{!emailConfigured ? "Email is not ready: configure SMTP in the backend .env file." : draft.email_to || defaultRecipientConfigured ? "SMTP sender and recipient are configured." : "Add a recipient here or set a server default to send email."}</p>
        </Block>
        <div className="monitoring-actions flex items-center justify-between gap-[18px] border-t pt-[18px] max-[760px]:flex-wrap">
          <p role="status" className={cn("text-[13px]", failed ? "text-danger" : "text-muted-foreground")}>{message}</p>
          <Button type="submit" size="lg" disabled={busy}>{busy ? "Saving…" : "Save monitoring settings"}</Button>
        </div>
      </form>
    </Card>
  );
}
