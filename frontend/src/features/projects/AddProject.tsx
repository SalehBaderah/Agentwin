import { useState } from "react";
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

type DraftComponent = { component_id: string; component_type: "led" | "temperature" | "humidity" | "analog" | "readonly"; label: string; device_id: string; pin: string; field_key: string; field_type: "number" | "boolean" | "categorical"; unit: string; precision: number; freshness_seconds: number };
type DraftDevice = { device_id: string; connector: "usb" | "mqtt"; serial_port: string; baud_rate: number };

const componentPreset = (template: string, device: string, freshness: number): DraftComponent[] => {
  const presets: Record<string, Omit<DraftComponent, "device_id" | "freshness_seconds">[]> = {
    led: [{ component_id: "led", component_type: "led", label: "External LED", pin: "D7", field_key: "led_on", field_type: "boolean", unit: "", precision: 0 }],
    temperature: [{ component_id: "temperature", component_type: "temperature", label: "Temperature", pin: "A5", field_key: "temperature_c", field_type: "number", unit: "°C", precision: 2 }],
    water: [{ component_id: "water-level", component_type: "analog", label: "Water level", pin: "A5", field_key: "water_level_raw", field_type: "number", unit: "count", precision: 0 }],
    connectivity: [{ component_id: "rf-detector", component_type: "analog", label: "Detector output", pin: "A5", field_key: "rf_detector_raw", field_type: "number", unit: "count", precision: 0 }],
    generic: [{ component_id: "sensor", component_type: "readonly", label: "Sensor reading", pin: "A5", field_key: "sensor_value", field_type: "number", unit: "value", precision: 2 }],
  };
  return (presets[template] || presets.generic).map((item) => ({ ...item, device_id: device, freshness_seconds: freshness }));
};

const templates = [{ value: "generic", label: "Generic sensor" }, { value: "led", label: "LED output" }, { value: "temperature", label: "Temperature" }, { value: "water", label: "Water level" }, { value: "connectivity", label: "Connectivity / RF" }];
const transports = [{ value: "usb", label: "USB gateway" }, { value: "mqtt", label: "Wi-Fi MQTT" }];
const componentTypes = [{ value: "led", label: "LED" }, { value: "analog", label: "Analog sensor" }, { value: "temperature", label: "Temperature" }, { value: "humidity", label: "Humidity" }, { value: "readonly", label: "Read only" }];
const fieldTypes = [{ value: "number", label: "Number" }, { value: "boolean", label: "Boolean" }, { value: "categorical", label: "Text" }];
const steps = ["Name & template", "Devices", "Components", "Fields", "Freshness", "Review"];

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
  const [form, setForm] = useState({ name: "", template: "generic", freshness_seconds: 8, interval_seconds: 1, retention_days: 30 });
  const [devices, setDevices] = useState<DraftDevice[]>([{ device_id: "device-01", connector: "usb", serial_port: "", baud_rate: 115200 }]);
  const [components, setComponents] = useState<DraftComponent[]>(componentPreset("generic", "device-01", 8));
  const patchDevice = (i: number, p: Partial<DraftDevice>) => setDevices(devices.map((v, n) => (n === i ? { ...v, ...p } : v)));
  const patchComponent = (i: number, p: Partial<DraftComponent>) => setComponents(components.map((v, n) => (n === i ? { ...v, ...p } : v)));
  const chooseTemplate = (template: string) => { setForm({ ...form, template }); setComponents(componentPreset(template, devices[0].device_id, form.freshness_seconds)); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setSaving(true); setMessage("");
    try {
      const [primary, ...extra] = devices;
      const project = await api<Project>("/projects", { ...form, device_id: primary.device_id, connector: primary.connector, serial_port: primary.serial_port || null, mapping: { field: components[0]?.field_key || "sensor_value", unit: components[0]?.unit || "value" }, devices: extra.map((d) => ({ ...d, serial_port: d.serial_port || null })), components: components.map((c) => ({ ...c, pin: c.pin || null })), cable_description: "Configured during project onboarding" });
      navigate(`/projects/${project.id}`);
    } catch (error) { setMessage((error as Error).message); setSaving(false); }
  };
  const summary: [string, string][] = [
    ["Project", form.name], ["Template", form.template],
    ["Devices", devices.map((d) => `${d.device_id} · ${d.connector}`).join(", ")],
    ["Components", components.map((c) => `${c.label} · ${c.pin || "no pin"}`).join(", ")],
    ["Fields", components.map((c) => c.field_key || "missing mapping").join(", ")],
    ["Controls", components.some((c) => c.component_type === "led") ? "LED reported-state control" : "Read only"],
    ["Firmware", components.map((c) => `${c.component_id}: ${c.component_type === "led" ? "set_led handler" : c.component_type === "analog" ? "analogRead publisher" : "field publisher"}`).join("; ")],
    ["Freshness", `${form.freshness_seconds}s · retain ${form.retention_days} days`],
  ];
  return (
    <Page className="max-w-[1200px]">
      <PageHeading title="Add a project" description="Build one scoped hardware system from registered devices, components, fields, and controls." />
      <ol className="mb-1.5 grid grid-cols-3 overflow-hidden rounded-[9px] border bg-card min-[901px]:grid-cols-6" aria-label="Project setup progress">
        {steps.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className={cn("flex min-h-[54px] items-center gap-[9px] border-r p-3 text-xs max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-2 min-[901px]:last:border-r-0 max-[900px]:nth-[3n]:border-r-0", i === step ? "bg-brand-subtle text-foreground" : "text-muted-foreground")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border tabular-nums", i === step ? "border-transparent bg-primary text-primary-foreground" : i < step ? "border-transparent bg-brand-subtle text-foreground" : "border-input")}>{i < step ? <Check className="size-3" /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Card className="block min-h-[410px] p-[26px] max-[540px]:p-5">
        <form onSubmit={save}>
          {step === 0 && <Step title="Project identity" description="The template is an editable starting point, not a fixed project.">
            <FormField id="project-name" label="Project name"><Input id="project-name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Greenhouse bench" /></FormField>
            <FormField id="project-template" label="Starting template"><OptionSelect id="project-template" value={form.template} onValueChange={chooseTemplate} options={templates} /></FormField>
          </Step>}
          {step === 1 && <Step title="Registered devices" description="Each identity owns a transport and a set of fields.">
            {devices.map((d, i) => (
              <Row key={i}>
                <FormField id={`device-${i}-id`} label="Device ID"><Input id={`device-${i}-id`} required value={d.device_id} onChange={(e) => { patchDevice(i, { device_id: e.target.value }); setComponents(components.map((c) => (c.device_id === d.device_id ? { ...c, device_id: e.target.value } : c))); }} /></FormField>
                <FormField id={`device-${i}-transport`} label="Transport"><OptionSelect id={`device-${i}-transport`} value={d.connector} onValueChange={(value) => patchDevice(i, { connector: value as DraftDevice["connector"] })} options={transports} /></FormField>
                <FormField id={`device-${i}-port`} label={d.connector === "usb" ? "Serial port" : "Broker route"}><Input id={`device-${i}-port`} value={d.serial_port} disabled={d.connector === "mqtt"} placeholder="COM5" onChange={(e) => patchDevice(i, { serial_port: e.target.value })} /></FormField>
                {i > 0 && <Button type="button" variant="ghost" onClick={() => setDevices(devices.filter((_, n) => n !== i))}>Remove</Button>}
              </Row>
            ))}
            <Button type="button" variant="secondary" className="col-span-full justify-self-start" onClick={() => setDevices([...devices, { device_id: `device-${devices.length + 1}`, connector: "usb", serial_port: "", baud_rate: 115200 }])}><Plus />Add device</Button>
          </Step>}
          {step === 2 && <Step title="Components" description="Add only hardware or logical sources the firmware will report.">
            {components.map((c, i) => (
              <Row key={i}>
                <FormField id={`component-${i}-label`} label="Label"><Input id={`component-${i}-label`} value={c.label} onChange={(e) => patchComponent(i, { label: e.target.value })} /></FormField>
                <FormField id={`component-${i}-type`} label="Type"><OptionSelect id={`component-${i}-type`} value={c.component_type} onValueChange={(value) => patchComponent(i, { component_type: value as DraftComponent["component_type"] })} options={componentTypes} /></FormField>
                <FormField id={`component-${i}-device`} label="Device"><OptionSelect id={`component-${i}-device`} value={c.device_id} onValueChange={(value) => patchComponent(i, { device_id: value })} options={devices.map((d) => ({ value: d.device_id, label: d.device_id }))} /></FormField>
                <FormField id={`component-${i}-pin`} label="Pin"><Input id={`component-${i}-pin`} value={c.pin} placeholder="D7 or A5" onChange={(e) => patchComponent(i, { pin: e.target.value })} /></FormField>
                <Button type="button" variant="ghost" onClick={() => setComponents(components.filter((_, n) => n !== i))}>Remove</Button>
              </Row>
            ))}
            <Button type="button" variant="secondary" className="col-span-full justify-self-start" onClick={() => setComponents([...components, { component_id: `component-${components.length + 1}`, component_type: "analog", label: "Analog input", device_id: devices[0].device_id, pin: "A5", field_key: `analog_${components.length + 1}`, field_type: "number", unit: "count", precision: 0, freshness_seconds: form.freshness_seconds }])}><Plus />Add component</Button>
          </Step>}
          {step === 3 && <Step title="Telemetry fields" description="These keys must match the JSON emitted by firmware.">
            {components.map((c, i) => (
              <Row key={i}>
                <FormField id={`field-${i}-component`} label="Component ID"><Input id={`field-${i}-component`} required value={c.component_id} onChange={(e) => patchComponent(i, { component_id: e.target.value })} /></FormField>
                <FormField id={`field-${i}-key`} label="JSON field"><Input id={`field-${i}-key`} required value={c.field_key} onChange={(e) => patchComponent(i, { field_key: e.target.value })} /></FormField>
                <FormField id={`field-${i}-type`} label="Type"><OptionSelect id={`field-${i}-type`} value={c.field_type} onValueChange={(value) => patchComponent(i, { field_type: value as DraftComponent["field_type"] })} options={fieldTypes} /></FormField>
                <FormField id={`field-${i}-unit`} label="Unit"><Input id={`field-${i}-unit`} value={c.unit} onChange={(e) => patchComponent(i, { unit: e.target.value })} /></FormField>
              </Row>
            ))}
          </Step>}
          {step === 4 && <Step title="Timing and retention" description="Freshness is the maximum silence before a field becomes stale.">
            <FormField id="interval" label="Sample interval (seconds)"><Input id="interval" type="number" min="1" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: Number(e.target.value) })} /></FormField>
            <FormField id="freshness" label="Default freshness (seconds)"><Input id="freshness" type="number" min="3" value={form.freshness_seconds} onChange={(e) => setForm({ ...form, freshness_seconds: Number(e.target.value) })} /></FormField>
            <FormField id="retention" label="Reading retention (days)"><Input id="retention" type="number" min="1" max="3650" value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })} /></FormField>
          </Step>}
          {step === 5 && <Step title="Review configuration" description="Creation is atomic and persists all identities and field contracts.">
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
