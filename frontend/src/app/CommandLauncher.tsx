import type { State } from "@/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronRight, Layers, Radio, Search, Settings as SettingsIcon } from "lucide-react";
import type { CommandItem } from "@/app/types";
import { useDropdownClass } from "@/app/useDropdownClass";

export function CommandLauncher({
  open,
  onOpen,
  onClose,
  states,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  states: State[];
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const dropdownClass = useDropdownClass(open);
  const items = useMemo<CommandItem[]>(() => {
    const projects = states.map((state) => ({
      id: `project-${state.project.id}`,
      label: state.project.name,
      meta: "Project",
      path: `/projects/${state.project.id}`,
      kind: "project" as const,
    }));
    const devices = states.flatMap((state) =>
      state.devices.map((device) => ({
        id: `device-${state.project.id}-${device.id}`,
        label: device.id,
        meta: `Device in ${state.project.name}`,
        path: `/projects/${state.project.id}`,
        kind: "device" as const,
      })),
    );
    const events = states.flatMap((state) =>
      state.events.map((event) => ({
        id: `event-${state.project.id}-${event.id}`,
        label: event.kind.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
        meta: `${event.recovered ? "Recovered" : "Open"} event in ${state.project.name}`,
        path: "/events",
        kind: "event" as const,
      })),
    );
    return [
      ...projects,
      ...devices,
      ...events,
      { id: "settings", label: "Settings", meta: "Appearance and service availability", path: "/settings", kind: "settings" },
    ];
  }, [states]);
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return items.filter((item) => item.kind === "project" || item.kind === "settings").slice(0, 7);
    return items.filter((item) => `${item.label} ${item.meta} ${item.kind}`.toLowerCase().includes(value)).slice(0, 10);
  }, [items, query]);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  const choose = (path: string) => {
    navigate(path);
    onClose();
  };
  return (
    <div className="topbar-search-wrap">
      <button className="topbar-search-trigger" type="button" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}>
        <Search size={16} /><span>Search</span><kbd>Ctrl K</kbd>
      </button>
      {(open || dropdownClass === "is-closing") && <button className="topbar-popover-dismiss" type="button" aria-label="Close command launcher" onClick={onClose} />}
      <div className="command-launcher-shell">
        <section className={`t-dropdown command-launcher ${dropdownClass}`} data-origin="top-right" role="dialog" aria-label="Search Agentwin" aria-hidden={!open} inert={!open ? true : undefined}>
          <label className="command-search"><Search size={18}/><input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, devices, events, settings" aria-label="Search projects, devices, events, and settings"/><kbd>Esc</kbd></label>
          <div className="command-results" role="listbox" aria-label="Search results">
            {results.length ? results.map((item) => (
              <button key={item.id} type="button" role="option" aria-selected="false" onClick={() => choose(item.path)}>
                <span className={`command-kind ${item.kind}`}>{item.kind === "project" ? <Layers size={15}/> : item.kind === "device" ? <Radio size={15}/> : item.kind === "event" ? <Bell size={15}/> : <SettingsIcon size={15}/>}</span>
                <span><strong>{item.label}</strong><small>{item.meta}</small></span>
                <ChevronRight size={15}/>
              </button>
            )) : <p className="command-empty">No matching projects, devices, events, or settings.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
