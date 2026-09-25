import type { State } from "@/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, ChevronRight, LayoutDashboard, Plus, Search } from "lucide-react";
import { Mark } from "@/components/Mark";
import { useDropdownClass } from "@/app/useDropdownClass";

export function SystemSwitcher({
  open,
  onToggle,
  onClose,
  states,
  selectedProjectId,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  states: State[];
  selectedProjectId: string | null;
}) {
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const navigate = useNavigate();
  const dropdownClass = useDropdownClass(open);
  const selected = states.find((state) => state.project.id === selectedProjectId);
  const searchable = states.length > 7;
  const projects = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? states.filter((state) => `${state.project.name} ${state.project.id} ${state.devices.map((device) => device.id).join(" ")}`.toLowerCase().includes(value)) : states;
  }, [query, states]);
  const selectedOptionIndex = selectedProjectId ? Math.max(1, states.findIndex((state) => state.project.id === selectedProjectId) + 1) : 0;
  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => {
      if (searchable) search.current?.focus();
      else options.current[selectedOptionIndex]?.focus();
    });
  }, [open, searchable, selectedOptionIndex]);
  const choose = (path: string) => {
    navigate(path);
    onClose();
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const moveFocus = (event: React.KeyboardEvent, direction: 1 | -1) => {
    event.preventDefault();
    const available = options.current.filter((option): option is HTMLButtonElement => Boolean(option));
    if (!available.length) return;
    const current = available.indexOf(document.activeElement as HTMLButtonElement);
    available[(current + direction + available.length) % available.length]?.focus();
  };
  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") moveFocus(event, 1);
    if (event.key === "ArrowUp") moveFocus(event, -1);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      trigger.current?.focus();
    }
  };
  const projectState = (state: State) => {
    if (state.devices.some((device) => device.reporting)) return { label: "Live", tone: "live" };
    if (state.latest) return { label: "Stale", tone: "stale" };
    return { label: "Unavailable", tone: "unavailable" };
  };
  return <div className="system-switcher">
    <button ref={trigger} className="system-switcher-trigger" type="button" onClick={onToggle} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); if (!open) onToggle(); } }} aria-haspopup="menu" aria-expanded={open}>
      <span className="system-switcher-mark"><Mark/></span>
      <span>{selected?.project.name || "All Systems"}</span>
      <ChevronRight size={14}/>
    </button>
    {(open || dropdownClass === "is-closing") && (
      <button className="topbar-popover-dismiss" type="button" aria-label="Close system switcher" onClick={onClose}/>
    )}
    <section className={`t-dropdown topbar-popover system-switcher-menu ${dropdownClass}`} data-origin="top-left" role="menu" aria-label="System and project navigation" aria-hidden={!open} inert={!open ? true : undefined} onKeyDown={onMenuKeyDown}>
      {searchable && <label className="system-switcher-search"><Search size={15}/><input ref={search} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") moveFocus(event, 1); }} placeholder="Find a project" aria-label="Find a project"/></label>}
      <span className="switcher-group-label">All systems</span>
      <button ref={(element) => { options.current[0] = element; }} className={`system-switcher-option ${!selectedProjectId ? "selected" : ""}`} type="button" role="menuitemradio" aria-checked={!selectedProjectId} onClick={() => choose("/")}>
        <span className="switcher-option-icon"><LayoutDashboard size={15}/></span>
        <span><strong>All Systems</strong><small>{states.length} configured {states.length === 1 ? "project" : "projects"}</small></span>
        {!selectedProjectId && <Check size={15}/>}
      </button>
      <span className="switcher-group-label">Projects</span>
      <div className="system-switcher-projects">
        {projects.length ? projects.map((state, index) => {
          const status = projectState(state);
          const isSelected = state.project.id === selectedProjectId;
          return <button key={state.project.id} ref={(element) => { options.current[index + 1] = element; }} className={`system-switcher-option ${isSelected ? "selected" : ""}`} type="button" role="menuitemradio" aria-checked={isSelected} onClick={() => choose(`/projects/${state.project.id}`)}>
            <span className={`switcher-status ${status.tone}`}/>
            <span><strong>{state.project.name}</strong><small>{status.label} · {state.devices.length} {state.devices.length === 1 ? "device" : "devices"}</small></span>
            {isSelected && <Check size={15}/>}
          </button>;
        }) : <p className="switcher-empty">No projects match “{query}”.</p>}
      </div>
      <Link className="system-switcher-add" to="/projects/new" onClick={onClose}><Plus size={15}/>Add project</Link>
    </section>
  </div>;
}
