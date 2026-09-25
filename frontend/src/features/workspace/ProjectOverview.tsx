import type { State } from "@/types";
import { Activity, Power } from "lucide-react";
import { display, time } from "@/types";
import { humanAction } from "@/lib/format";
import { Stat } from "@/components/Stat";
import { CompactId } from "@/components/CopyId";

export function ProjectOverview({ state }: { state: State }) {
  const p = state.project;
  const presentMetric = (key: string, value: unknown, unit: string) => {
    if (typeof value === "boolean") return <span className={`state-pill ${value ? "on" : "off"}`}><Power size={13}/>{value ? "On" : "Off"}</span>;
    if (key.includes("command_id") && typeof value === "string") return <CompactId value={value}/>;
    return <>{display(value)}<em>{unit}</em></>;
  };
  return <div className="project-overview"><div className="overview-main"><div className="stats overview-metrics">{Object.entries(p.graph.fields).map(([key, field]) => <Stat key={key} label={field.label} value={presentMetric(key, state.latest?.readings[key], field.unit)} hint={state.field_status[key]?.received ? `Received ${time(state.field_status[key].received)}` : "No reported value"} icon={<Activity />}/>)}</div><div className="overview-split"><section className="panel overview-card"><div className="overview-card-heading"><h3>Devices</h3><span>{state.devices.filter(device=>device.reporting).length}/{state.devices.length} reporting</span></div>{state.devices.map((device) => <div className="overview-row" key={device.id}><div><strong>{device.id}</strong><small>{device.connector.toUpperCase()} connector</small></div><span className={`status-pill ${device.reporting ? "good" : device.online ? "waiting" : "offline"}`}><i/>{device.reporting ? "Reporting" : device.online ? "Connected" : "Unavailable"}</span></div>)}</section><section className="panel overview-card"><div className="overview-card-heading"><h3>Recent actions</h3><span>Latest {Math.min(state.actions.length,5)}</span></div>{state.actions.length ? state.actions.slice(0, 5).map((action) => <div className="overview-row action-row" key={action.id}><div><strong>{humanAction(action.action)}</strong><CompactId value={action.id}/></div><span className={`action-status ${action.status}`}>{action.status.replaceAll("_", " ")}</span></div>) : <p className="detail-empty">No commands have been requested.</p>}</section></div></div></div>;
}
