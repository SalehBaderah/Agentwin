import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronsUpDown, LayoutDashboard, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Mark } from "@/components/Mark";
import { cn } from "@/lib/utils";
import type { State } from "@/types";

const projectState = (state: State) =>
  state.devices.some((device) => device.reporting) ? { label: "Live", dot: "bg-success" } : state.latest ? { label: "Stale", dot: "bg-warning" } : { label: "Unavailable", dot: "bg-muted-foreground" };

export function SystemSwitcher({ states, selectedProjectId }: { states: State[]; selectedProjectId: string | null }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const selected = states.find((state) => state.project.id === selectedProjectId);
  const searchable = states.length > 7;
  const projects = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? states.filter((state) => `${state.project.name} ${state.project.id} ${state.devices.map((device) => device.id).join(" ")}`.toLowerCase().includes(value)) : states;
  }, [query, states]);
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setQuery(""); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 min-w-0 shrink gap-2 rounded-[11px] pr-2.5 pl-2 text-[13px] font-semibold">
          <Mark className="size-[22px]" />
          <span className="max-w-48 truncate">{selected?.project.name || "All Systems"}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72" aria-label="System and project navigation">
        {searchable && (
          <div className="relative p-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="Find a project" aria-label="Find a project" className="h-8 pl-8" />
          </div>
        )}
        <DropdownMenuRadioGroup value={selectedProjectId ?? "all"} onValueChange={(next) => navigate(next === "all" ? "/" : `/projects/${next}`)}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">All systems</DropdownMenuLabel>
          <DropdownMenuRadioItem value="all" className="gap-2">
            <LayoutDashboard />
            <span className="flex flex-col"><strong className="font-medium">All Systems</strong><small className="text-muted-foreground">{states.length} configured {states.length === 1 ? "project" : "projects"}</small></span>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
          <div className="max-h-72 overflow-y-auto">
            {projects.length ? projects.map((state) => {
              const status = projectState(state);
              return (
                <DropdownMenuRadioItem key={state.project.id} value={state.project.id} className="gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", status.dot)} />
                  <span className="flex min-w-0 flex-col"><strong className="truncate font-medium">{state.project.name}</strong><small className="text-muted-foreground">{status.label} · {state.devices.length} {state.devices.length === 1 ? "device" : "devices"}</small></span>
                </DropdownMenuRadioItem>
              );
            }) : <p className="px-2 py-3 text-sm text-muted-foreground">No projects match “{query}”.</p>}
          </div>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/projects/new"><Plus />Add project</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
