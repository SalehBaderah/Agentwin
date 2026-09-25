import { Link } from "react-router-dom";
import { Bell, Menu, MoreHorizontal, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { ThemeSwitcher } from "@/theme";
import { sessionLabel } from "@/lib/format";
import type { State } from "@/types";
import { CommandLauncher } from "./CommandLauncher";
import { HealthRows, SystemStatus } from "./SystemStatus";
import { SystemSwitcher } from "./SystemSwitcher";
import type { ProjectContext, ServiceHealth } from "./types";

export function Topbar({ states, connected, health, projectContext, selectedProjectId, searchOpen, onSearchOpenChange }: { states: State[]; connected: boolean; health: ServiceHealth | null; projectContext: ProjectContext | null; selectedProjectId: string | null; searchOpen: boolean; onSearchOpenChange: (open: boolean) => void }) {
  const { toggleSidebar } = useSidebar();
  const openEvents = states.flatMap((state) => state.events).filter((event) => !event.recovered).length;
  const devices = states.reduce((total, state) => total + state.devices.length, 0);
  const reporting = states.reduce((total, state) => total + state.devices.filter((device) => device.reporting).length, 0);
  const contextMode = projectContext ? sessionLabel(projectContext.mode) : null;
  return (
    <header className="sticky top-3 z-20 mx-4 mt-3 mb-2 flex h-[70px] items-center gap-2 rounded-2xl border bg-sidebar px-5 shadow-elevated md:top-[18px] md:mt-4 md:mr-7 md:mb-8 md:ml-8 md:h-[76px] md:gap-4 md:px-8">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Toggle navigation" onClick={toggleSidebar}><Menu /></Button>
      <SystemSwitcher states={states} selectedProjectId={selectedProjectId} />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <CommandLauncher open={searchOpen} onOpenChange={onSearchOpenChange} states={states} />
        <div className="hidden items-center gap-2 lg:flex">
          {contextMode && <Badge variant="outline" className="h-8 gap-1.5 px-2.5"><Radio className="size-3.5" />{contextMode}</Badge>}
          {openEvents > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link to="/events" aria-label={`${openEvents} open events`}><Bell />Events<Badge className="ml-1 h-5 px-1.5">{openEvents}</Badge></Link>
            </Button>
          )}
          <SystemStatus connected={connected} health={health} reporting={reporting} devices={devices} />
          <ThemeSwitcher compact />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative lg:hidden" aria-label="More workspace status">
              <MoreHorizontal />
              {openEvents > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full bg-warning px-1 text-[10px] font-semibold text-white">{openEvents}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3" aria-label="Workspace status and preferences">
            {contextMode && <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Current source</span><strong className="flex items-center gap-1.5"><Radio className="size-3.5" />{contextMode}</strong></div>}
            {openEvents > 0 && <Link className="flex items-center justify-between text-sm" to="/events"><span className="flex items-center gap-1.5"><Bell className="size-4" />Open events</span><strong>{openEvents}</strong></Link>}
            <p className="text-sm font-semibold">System status</p>
            <HealthRows connected={connected} health={health} reporting={reporting} devices={devices} />
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Appearance</span><ThemeSwitcher compact /></div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
