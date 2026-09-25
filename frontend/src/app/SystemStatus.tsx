import { ChevronRight } from "lucide-react";
import type { ServiceHealth } from "@/app/types";
import { useDropdownClass } from "@/app/useDropdownClass";

export function HealthRows({ connected, health, reporting, devices }: { connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  return <div className="system-status-rows">
    <div><span><i className={connected ? "healthy" : "down"}/>Backend</span><strong>{connected ? "Connected" : "Reconnecting"}</strong></div>
    <div><span><i className={health?.mqtt ? "healthy" : "warning"}/>MQTT broker</span><strong>{health === null ? "Checking" : health.mqtt ? "Connected" : "Disconnected"}</strong></div>
    <div><span><i className={devices > 0 && reporting < devices ? "warning" : "healthy"}/>Devices</span><strong>{devices ? `${reporting}/${devices} reporting` : "None configured"}</strong></div>
    <div><span><i className={health?.agent_available ? "healthy" : health?.agent_configured ? "down" : "warning"}/>Agent</span><strong>{health === null ? "Checking" : health.agent_available ? "Available" : health.agent_configured ? "Unreachable" : "Not configured"}</strong></div>
  </div>;
}

export function SystemStatus({ open, onToggle, onClose, connected, health, reporting, devices }: { open: boolean; onToggle: () => void; onClose: () => void; connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  const dropdownClass = useDropdownClass(open);
  const healthy = connected && health?.mqtt === true && health.agent_available && (devices === 0 || reporting === devices);
  return <div className="topbar-control-wrap system-status-control">
    <button className={`topbar-system-trigger ${connected ? healthy ? "healthy" : "warning" : "down"}`} type="button" onClick={onToggle} aria-haspopup="dialog" aria-expanded={open}>
      <span className="system-status-dot"/><span>System status</span><ChevronRight size={14}/>
    </button>
    {(open || dropdownClass === "is-closing") && (
      <button className="topbar-popover-dismiss" type="button" aria-label="Close system status" onClick={onClose}/>
    )}
    <section className={`t-dropdown topbar-popover system-status-popover ${dropdownClass}`} data-origin="top-right" role="dialog" aria-label="System status details" aria-hidden={!open} inert={!open ? true : undefined}>
      <div className="popover-heading"><strong>System status</strong><span>{healthy ? "Operational" : "Attention needed"}</span></div>
      <HealthRows connected={connected} health={health} reporting={reporting} devices={devices}/>
    </section>
  </div>;
}
