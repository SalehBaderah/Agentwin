import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Layers, Radio, Search, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { State } from "@/types";
import type { CommandItem as LauncherItem } from "./types";

const groups = [
  { kind: "project", heading: "Projects", Icon: Layers },
  { kind: "device", heading: "Devices", Icon: Radio },
  { kind: "event", heading: "Events", Icon: Bell },
  { kind: "settings", heading: "Settings", Icon: SettingsIcon },
] as const;

export function CommandLauncher({ open, onOpenChange, states }: { open: boolean; onOpenChange: (open: boolean) => void; states: State[] }) {
  const navigate = useNavigate();
  const items = useMemo<LauncherItem[]>(() => [
    ...states.map((state) => ({ id: `project-${state.project.id}`, label: state.project.name, meta: "Project", path: `/projects/${state.project.id}`, kind: "project" as const })),
    ...states.flatMap((state) => state.devices.map((device) => ({ id: `device-${state.project.id}-${device.id}`, label: device.id, meta: `Device in ${state.project.name}`, path: `/projects/${state.project.id}`, kind: "device" as const }))),
    ...states.flatMap((state) => state.events.map((event) => ({ id: `event-${state.project.id}-${event.id}`, label: event.kind.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()), meta: `${event.recovered ? "Recovered" : "Open"} event in ${state.project.name}`, path: "/events", kind: "event" as const }))),
    { id: "settings", label: "Settings", meta: "Appearance and service availability", path: "/settings", kind: "settings" },
  ], [states]);
  const choose = (path: string) => { navigate(path); onOpenChange(false); };
  return (
    <>
      <Button type="button" variant="outline" className="topbar-search-trigger h-[37px] gap-[7px] rounded-[10px] bg-glass-strong px-2.5 text-xs font-semibold text-muted-foreground xl:w-44 xl:justify-start" onClick={() => onOpenChange(true)} aria-haspopup="dialog" aria-expanded={open}>
        <Search />
        <span className="sr-only xl:not-sr-only">Search</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] xl:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Agentwin" description="Search projects, devices, events, and settings">
        <Command>
          <CommandInput placeholder="Search projects, devices, events, settings" aria-label="Search projects, devices, events, and settings" />
          <CommandList>
            <CommandEmpty>No matching projects, devices, events, or settings.</CommandEmpty>
            {groups.map(({ kind, heading, Icon }) => {
              const matches = items.filter((item) => item.kind === kind);
              return matches.length ? (
                <CommandGroup key={kind} heading={heading}>
                  {matches.map((item) => (
                    <CommandItem key={item.id} value={`${item.label} ${item.meta} ${item.id}`} onSelect={() => choose(item.path)}>
                      <Icon />
                      <span className="flex min-w-0 flex-col"><span className="truncate">{item.label}</span><span className="truncate text-xs text-muted-foreground">{item.meta}</span></span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null;
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
