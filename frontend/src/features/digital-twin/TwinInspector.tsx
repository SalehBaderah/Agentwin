import { useState } from "react";
import { Activity, Check, X } from "lucide-react";
import type { Project, State } from "../../types";
import { api, display, time } from "../../types";
import type { TwinComponentState } from "./model/twin.types";

const age = (value?: number) => value === undefined ? "Unavailable" : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
const metricValue = (value: unknown, precision: number) => value === null || value === undefined ? "Unavailable" : typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: precision }) : typeof value === "boolean" ? (value ? "ON" : "OFF") : String(value);

function controlReady(state: State, project: Project, field: string) {
  if (state.session.mode !== "live") return false;
  const deviceId = project.graph.fields[field]?.device_id;
  const device = state.devices.find((item) => item.id === deviceId);
  return Boolean(device && (device.connector === "usb" ? device.online : device.reporting));
}

export function TwinInspector({ component, state, refresh, open, onClose }: { component: TwinComponentState; state: State; refresh: () => void; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const relations = state.project.graph.edges.filter((edge) => edge.source === component.id || edge.target === component.id);
  const run = async (action: string, value: boolean) => {
    setBusy(true); setError("");
    try {
      await api(`/projects/${state.project.id}/sessions/${state.session.id}/actions`, { component_id: component.id, action, value });
      refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  return <aside className="live-twin-inspector t-panel-slide" data-open={open ? "true" : "false"} aria-label="Selected component details">
    <button type="button" className="inspector-close" onClick={onClose} aria-label="Close component inspector"><X size={17}/></button>
    <header className="inspector-heading"><span>{component.type}</span><h3>{component.label}</h3><p>{component.source.description || "Configured component."}</p></header>
    <details open><summary>State</summary><div className="inspector-content">
      {component.observed.metrics.length ? component.observed.metrics.map((metric) => <div className="inspector-metric" key={metric.key}><span>{metric.label}<small>{metric.key} · {metric.source}</small></span><strong>{metricValue(metric.value, metric.precision)} {metric.value !== null && metric.value !== undefined ? metric.unit : ""}<small>{metric.isLastKnown ? "Last known · " : ""}{metric.freshness} · {age(metric.ageMs)}</small></strong></div>) : <p className="detail-empty">Configured component with no bound live readings.</p>}
      {component.deviceId && <div className="detail-relation"><span>Device</span><strong>{component.deviceId}</strong></div>}
      {component.pin && <div className="detail-relation"><span>Pin</span><strong>{component.pin}</strong></div>}
      {component.transport && <div className="detail-relation"><span>Transport</span><strong>{component.transport.toUpperCase()}</strong></div>}
      {component.health.transportAvailable !== undefined && <div className="detail-relation"><span>Gateway availability</span><strong>{component.health.transportAvailable ? "Connected" : "Unavailable"}</strong></div>}
      {component.observed.bootId && <div className="detail-relation"><span>Boot session</span><strong>{component.observed.bootId}</strong></div>}
      {component.observed.sequence !== undefined && <div className="detail-relation"><span>Sequence</span><strong>#{component.observed.sequence}</strong></div>}
      {component.observed.receivedAt && <div className="detail-relation"><span>Last received</span><strong>{time(component.observed.receivedAt)}</strong></div>}
      <div className="detail-relation"><span>Freshness</span><strong>{component.health.freshness} · {age(component.health.ageMs)}</strong></div>
    </div></details>
    <details open><summary>Evidence</summary><div className="inspector-content evidence-list">
      <p><Check size={14}/><span><strong>Configured</strong>{component.pin ? `${component.label} bound to ${component.pin}.` : `${component.label} exists in project configuration.`}</span></p>
      <p className={component.evidence.level === "reported" ? "reported" : "muted"}>{component.evidence.level === "reported" ? <Check size={14}/> : <span aria-hidden="true">—</span>}<span><strong>Reported</strong>{component.evidence.level === "reported" ? `Firmware telemetry received ${age(component.health.ageMs)} ago.` : "No telemetry observed in this session."}</span></p>
      <p className="muted"><span aria-hidden="true">—</span><span><strong>Physical verification</strong>Not independently verified.</span></p>
    </div></details>
    {relations.length > 0 && <details><summary>Relationships</summary><div className="inspector-content">{relations.map((edge) => <div className="detail-relation" key={edge.id}><span>{edge.label}</span><strong>{edge.source === component.id ? state.project.graph.components.find((item) => item.id === edge.target)?.name : state.project.graph.components.find((item) => item.id === edge.source)?.name}</strong></div>)}</div></details>}
    {Object.keys(component.configured.values).length > 0 && <details><summary>Configuration</summary><div className="inspector-content">{Object.entries(component.configured.values).map(([key, value]) => <div className="detail-relation" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{display(value)}</strong></div>)}</div></details>}
    {(component.events.length > 0 || component.source.controls?.length || component.actions.length > 0) && <details open><summary>Events & actions</summary><div className="inspector-content">
      {component.events.filter((event) => !event.recovered).map((event) => <div className="operational-callout" key={event.id}><Activity size={14}/><span><strong>{event.kind.replaceAll("_", " ")}</strong>{event.evidence.cause}</span></div>)}
      {component.source.controls?.map((control) => <div key={control.action}><div className="component-actions"><button type="button" disabled={busy || !controlReady(state, state.project, control.expected.field)} onClick={() => run(control.action, true)}>Turn on</button><button type="button" disabled={busy || !controlReady(state, state.project, control.expected.field)} onClick={() => run(control.action, false)}>Turn off</button></div>{!controlReady(state, state.project, control.expected.field) && <p className="detail-empty">Controls require the configured live transport.</p>}</div>)}
      {component.actions.slice(0, 4).map((action) => <div className="detail-relation" key={action.id}><span>{action.action.replaceAll("_", " ")}<small>{time(action.created)}</small></span><strong className={`action-status ${action.status}`}>{action.status.replaceAll("_", " ")}</strong></div>)}
      {error && <p className="error" role="alert">{error}</p>}
    </div></details>}
    <p className="inspector-footnote">{state.session.mode} source. Reported firmware state is not proof of a physical effect.</p>
  </aside>;
}
