import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { api } from "@/types";

import { templateComponents, type DraftComponent, type DraftDevice, type ProjectTemplate } from "./projectTemplates";

const transports = [{ value: "usb", label: "USB gateway" }, { value: "mqtt", label: "Wi-Fi MQTT" }];
const componentTypes = [{ value: "led", label: "LED" }, { value: "analog", label: "Analog sensor" }, { value: "temperature", label: "Temperature" }, { value: "humidity", label: "Humidity" }, { value: "readonly", label: "Read only" }];
const fieldTypes = [{ value: "number", label: "Number" }, { value: "boolean", label: "Boolean" }, { value: "categorical", label: "Text" }];
const manualSteps = ["Name & template", "Devices", "Components", "Fields", "Freshness", "Review"];

function Step({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-[18px] min-[541px]:grid-cols-2">
      <div className="col-span-full mb-0.5 border-b pb-[18px]"><h2 className="mb-1.5 text-lg font-bold tracking-[-0.3px]">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="col-span-full grid items-end gap-3.5 rounded-lg border bg-background p-3.5 min-[541px]:grid-cols-2">{children}</div>;
}

export function AddProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", template: "", freshness_seconds: 8, interval_seconds: 1, retention_days: 30 });
  const [devices, setDevices] = useState<DraftDevice[]>([{ device_id: "device-01", connector: "usb", serial_port: "", baud_rate: 115200 }]);
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [catalog, setCatalog] = useState<ProjectTemplate[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api<ProjectTemplate[]>("/project-templates").then((items) => {
      if (!active) return;
      setCatalog(items); setMessage("");
      const initial = items.find((item) => item.hardware) ?? items[0];
      if (initial) {
        setForm((previous) => ({ ...previous, template: initial.id, interval_seconds: initial.defaults.interval_seconds, freshness_seconds: initial.defaults.freshness_seconds }));
        setDevices([{ device_id: initial.defaults.device_id, connector: initial.defaults.connector, serial_port: "", baud_rate: initial.defaults.baud_rate }]);
        setComponents(templateComponents(initial, initial.defaults.device_id, initial.defaults.freshness_seconds));
      }
    }).catch((error: Error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [loadAttempt]);
  const selectedTemplate = catalog.find((item) => item.id === form.template);
  const hardwareTemplates = catalog.filter((item) => item.hardware);
  const customTemplate = catalog.find((item) => !item.hardware && item.id === "generic") ?? catalog.find((item) => !item.hardware);
  const hardware = !!selectedTemplate?.hardware;
  const steps = hardware ? ["Name & template", "Device", "Timing", "Review"] : manualSteps;
  const currentStep = hardware ? [0, 1, 4, 5][step] : step;
  const patchDevice = (i: number, p: Partial<DraftDevice>) => setDevices(devices.map((v, n) => (n === i ? { ...v, ...p } : v)));
  const patchComponent = (i: number, p: Partial<DraftComponent>) => setComponents(components.map((v, n) => (n === i ? { ...v, ...p } : v)));
  const chooseTemplate = (template: string) => {
    const spec = catalog.find((item) => item.id === template);
    if (!spec) return;
    setForm({ ...form, template, interval_seconds: spec.defaults.interval_seconds, freshness_seconds: spec.defaults.freshness_seconds });
    setDevices([{ device_id: spec.defaults.device_id, connector: spec.defaults.connector, baud_rate: spec.defaults.baud_rate, serial_port: "" }]);
    setComponents(templateComponents(spec, spec.defaults.device_id, spec.defaults.freshness_seconds));
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setSaving(true); setMessage("");
    try {
      const [primary, ...extra] = devices;
      const project = await api<Project>("/projects", { ...form, device_id: primary.device_id, connector: primary.connector, serial_port: primary.serial_port || null, baud_rate: primary.baud_rate, mapping: { field: components[0]?.field_key || "sensor_value", unit: components[0]?.unit || "state" }, devices: extra.map((d) => ({ ...d, serial_port: d.serial_port || null })), components: components.map((c) => ({ ...c, pin: c.pin || null, freshness_seconds: form.freshness_seconds })), cable_description: "Configured during project onboarding" });
      navigate(`/projects/${project.id}${hardware ? "?tab=setup" : ""}`);
    } catch (error) { setMessage((error as Error).message); setSaving(false); }
  };
  const summary: [string, string][] = [
    ["Project", form.name], [hardware ? "Hardware Template" : "Custom configuration", selectedTemplate?.name || form.template],
    ["Devices", devices.map((d) => `${d.device_id} · ${d.connector}`).join(", ")],
    ["Components", components.map((c) => `${c.label} · ${c.pin || "no pin"}`).join(", ")],
    ["Fields", components.map((c) => c.field_key || "missing mapping").join(", ")],
    ["Controls", components.some((c) => c.component_type === "led") ? "LED reported-state control" : "Read only"],
    ["Firmware", hardware ? `Included: ${selectedTemplate?.source}` : components.map((c) => `${c.component_id}: ${c.component_type === "led" ? "set_led handler" : c.component_type === "analog" ? "analogRead publisher" : "field publisher"}`).join("; ")],
    ["Freshness", `${form.freshness_seconds}s · retain ${form.retention_days} days`],
  ];
  if (!catalog.length) return <Page className="max-w-[1200px]"><PageHeading title="Add a project" description="Choose matching hardware and register its telemetry contract." /><p role="status" className="text-sm text-muted-foreground">{message || "Loading project templates..."}</p>{message && <Button className="mt-3" variant="outline" onClick={() => setLoadAttempt(loadAttempt + 1)}>Retry</Button>}</Page>;
  return (
    <Page className="max-w-[1200px]">
      <PageHeading title="Add a project" description="Choose supported hardware or build a custom configuration, then deploy matching firmware." />
      <ol className={cn("mb-1.5 grid overflow-hidden rounded-[9px] border bg-card", hardware ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3 min-[901px]:grid-cols-6")} aria-label="Project setup progress">
        {steps.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className={cn("flex min-h-[54px] items-center gap-[9px] border-r p-3 text-xs max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-2 min-[901px]:last:border-r-0 max-[900px]:nth-[3n]:border-r-0", i === step ? "bg-brand-subtle text-foreground" : "text-muted-foreground")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border tabular-nums", i === step ? "border-transparent bg-primary text-primary-foreground" : i < step ? "border-transparent bg-brand-subtle text-foreground" : "border-input")}>{i < step ? <Check className="size-3" /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Card className="block min-h-[410px] p-[26px] max-[540px]:p-5">
        <form onSubmit={save}>
          {currentStep === 0 && <Step title="Project identity" description="Choose supported hardware, configure the device, and deploy its Agentwin firmware package. Hardware Templates create one device per project; custom configurations support multiple devices and require your own matching firmware.">
            <fieldset className="col-span-full flex flex-wrap gap-2">
              <legend className="mb-2 text-sm text-subtle-foreground">Setup method</legend>
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", hardware && "border-brand/40 bg-brand-subtle")}>
                <input type="radio" name="setup-method" className="accent-[var(--accent)]" checked={hardware} disabled={!hardwareTemplates.length} onChange={() => chooseTemplate(hardwareTemplates[0].id)} />Supported hardware
              </label>
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", !hardware && "border-brand/40 bg-brand-subtle")}>
                <input type="radio" name="setup-method" className="accent-[var(--accent)]" checked={!hardware} disabled={!customTemplate} onChange={() => { if (customTemplate) chooseTemplate(customTemplate.id); }} />Custom configuration
              </label>
            </fieldset>
            <FormField id="project-name" label="Project name" className={!hardware ? "col-span-full" : undefined}><Input id="project-name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Greenhouse bench" /></FormField>
            {hardware && <FormField id="project-template" label="Hardware Template"><OptionSelect id="project-template" value={form.template} onValueChange={chooseTemplate} options={hardwareTemplates.map((item) => ({ value: item.id, label: item.name }))} /></FormField>}
            {selectedTemplate && <div className="col-span-full rounded-lg border bg-background p-4 text-sm"><p className="font-medium">{hardware ? `${selectedTemplate.board} / Firmware included` : "Manual firmware setup"}</p><p className="mt-1 leading-relaxed text-muted-foreground">{selectedTemplate.description}</p>{hardware && <p className="mt-2 text-xs text-muted-foreground">Fields and pins match the existing firmware. After creation, download a package with this project's IDs.</p>}</div>}
          </Step>}
          {currentStep === 1 && <Step title="Registered devices" description="Each identity owns a transport and a set of fields.">
            {devices.map((d, i) => (
              <Row key={i}>
                <FormField id={`device-${i}-id`} label="Device ID"><Input id={`device-${i}-id`} required value={d.device_id} onChange={(e) => { patchDevice(i, { device_id: e.target.value }); setComponents(components.map((c) => (c.device_id === d.device_id ? { ...c, device_id: e.target.value } : c))); }} /></FormField>
                <FormField id={`device-${i}-transport`} label="Transport"><OptionSelect id={`device-${i}-transport`} disabled={hardware} value={d.connector} onValueChange={(value) => patchDevice(i, { connector: value as DraftDevice["connector"] })} options={transports} /></FormField>
                <FormField id={`device-${i}-port`} label={d.connector === "usb" ? "Serial port" : "Broker route"}><Input id={`device-${i}-port`} value={d.serial_port} disabled={d.connector === "mqtt"} placeholder="COM5" onChange={(e) => patchDevice(i, { serial_port: e.target.value })} /></FormField>
                <FormField id={`device-${i}-baud`} label="Serial baud"><Input id={`device-${i}-baud`} type="number" min="1200" max="2000000" disabled={hardware || d.connector === "mqtt"} value={d.baud_rate} onChange={(e) => patchDevice(i, { baud_rate: Number(e.target.value) })} /></FormField>
                {i > 0 && <Button type="button" variant="ghost" onClick={() => setDevices(devices.filter((_, n) => n !== i))}>Remove</Button>}
              </Row>
            ))}
            {!hardware && <Button type="button" variant="secondary" className="col-span-full justify-self-start" onClick={() => setDevices([...devices, { device_id: `device-${devices.length + 1}`, connector: "usb", serial_port: "", baud_rate: 115200 }])}><Plus />Add device</Button>}
          </Step>}
          {currentStep === 2 && <Step title="Components" description={hardware ? "These components and pins match the selected firmware template." : "Add only hardware or logical sources the firmware will report."}>
            <fieldset disabled={hardware} className="contents">{components.map((c, i) => (
              <Row key={i}>
                <FormField id={`component-${i}-label`} label="Label"><Input id={`component-${i}-label`} value={c.label} onChange={(e) => patchComponent(i, { label: e.target.value })} /></FormField>
                <FormField id={`component-${i}-type`} label="Type"><OptionSelect id={`component-${i}-type`} value={c.component_type} onValueChange={(value) => patchComponent(i, { component_type: value as DraftComponent["component_type"] })} options={componentTypes} /></FormField>
                <FormField id={`component-${i}-device`} label="Device"><OptionSelect id={`component-${i}-device`} value={c.device_id} onValueChange={(value) => patchComponent(i, { device_id: value })} options={devices.map((d) => ({ value: d.device_id, label: d.device_id }))} /></FormField>
                <FormField id={`component-${i}-pin`} label="Pin"><Input id={`component-${i}-pin`} value={c.pin} placeholder="D7 or A5" onChange={(e) => patchComponent(i, { pin: e.target.value })} /></FormField>
                {!hardware && <Button type="button" variant="ghost" onClick={() => setComponents(components.filter((_, n) => n !== i))}>Remove</Button>}
              </Row>
            ))}</fieldset>
            {!hardware && <Button type="button" variant="secondary" className="col-span-full justify-self-start" onClick={() => setComponents([...components, { component_id: `component-${components.length + 1}`, component_type: "analog", label: "Analog input", device_id: devices[0].device_id, pin: "A5", field_key: `analog_${components.length + 1}`, field_type: "number", unit: "count", precision: 0, freshness_seconds: form.freshness_seconds }])}><Plus />Add component</Button>}
          </Step>}
          {currentStep === 3 && <Step title="Telemetry fields" description={hardware ? "The template supplies the exact JSON keys, types and units emitted by firmware." : "These keys must match the JSON emitted by firmware."}>
            <fieldset disabled={hardware} className="contents">{components.map((c, i) => (
              <Row key={i}>
                <FormField id={`field-${i}-component`} label="Component ID"><Input id={`field-${i}-component`} required value={c.component_id} onChange={(e) => patchComponent(i, { component_id: e.target.value })} /></FormField>
                <FormField id={`field-${i}-key`} label="JSON field"><Input id={`field-${i}-key`} required value={c.field_key} onChange={(e) => patchComponent(i, { field_key: e.target.value })} /></FormField>
                <FormField id={`field-${i}-type`} label="Type"><OptionSelect id={`field-${i}-type`} value={c.field_type} onValueChange={(value) => patchComponent(i, { field_type: value as DraftComponent["field_type"] })} options={fieldTypes} /></FormField>
                <FormField id={`field-${i}-unit`} label="Unit"><Input id={`field-${i}-unit`} value={c.unit} onChange={(e) => patchComponent(i, { unit: e.target.value })} /></FormField>
                <FormField id={`field-${i}-precision`} label="Display precision"><Input id={`field-${i}-precision`} type="number" min="0" max="8" value={c.precision} onChange={(e) => patchComponent(i, { precision: Number(e.target.value) })} /></FormField>
              </Row>
            ))}</fieldset>
          </Step>}
          {currentStep === 4 && <Step title="Timing and retention" description="Freshness is the maximum silence before a field becomes stale.">
            <FormField id="interval" label="Sample interval (seconds)"><Input id="interval" type="number" min="1" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: Number(e.target.value) })} /></FormField>
            <FormField id="freshness" label="Default freshness (seconds)"><Input id="freshness" type="number" min="3" value={form.freshness_seconds} onChange={(e) => setForm({ ...form, freshness_seconds: Number(e.target.value) })} /></FormField>
            <FormField id="retention" label="Reading retention (days)"><Input id="retention" type="number" min="1" max="3650" value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })} /></FormField>
          </Step>}
          {currentStep === 5 && <Step title="Review configuration" description="Creation is atomic and persists all identities and field contracts.">
            <dl className="col-span-full divide-y rounded-lg border">
              {summary.map(([term, value]) => <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr]"><dt className="text-sm text-muted-foreground">{term}</dt><dd className="text-sm break-words">{value}</dd></div>)}
            </dl>
          </Step>}
          <div className="mt-7 flex justify-end gap-2.5 border-t pt-[18px]">
            {step > 0 && <Button type="button" size="lg" variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button type="submit" size="lg" disabled={saving}>{step === steps.length - 1 ? (saving ? "Creating project…" : "Create project") : "Continue"}</Button>
          </div>
          <p role="status" className="mt-3 text-sm text-destructive empty:hidden">{message}</p>
        </form>
      </Card>
    </Page>
  );
}
