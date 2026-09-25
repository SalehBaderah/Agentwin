import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ServiceHealth } from "./types";

type Tone = "healthy" | "warning" | "down";
const dot: Record<Tone, string> = { healthy: "bg-success", warning: "bg-warning", down: "bg-destructive" };

function Row({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground"><i className={cn("size-2 rounded-full", dot[tone])} />{label}</span>
      <strong className="font-medium text-foreground">{value}</strong>
    </div>
  );
}

export function HealthRows({ connected, health, reporting, devices }: { connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  return (
    <div className="grid gap-2">
      <Row tone={connected ? "healthy" : "down"} label="Backend" value={connected ? "Connected" : "Reconnecting"} />
      <Row tone={health?.mqtt ? "healthy" : "warning"} label="MQTT broker" value={health === null ? "Checking" : health.mqtt ? "Connected" : "Disconnected"} />
      <Row tone={devices > 0 && reporting < devices ? "warning" : "healthy"} label="Devices" value={devices ? `${reporting}/${devices} reporting` : "None configured"} />
      <Row tone={health?.agent_available ? "healthy" : health?.agent_configured ? "down" : "warning"} label="Agent" value={health === null ? "Checking" : health.agent_available ? "Available" : health.agent_configured ? "Unreachable" : "Not configured"} />
    </div>
  );
}

export function SystemStatus({ connected, health, reporting, devices }: { connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  const healthy = connected && health?.mqtt === true && health.agent_available && (devices === 0 || reporting === devices);
  const tone: Tone = connected ? (healthy ? "healthy" : "warning") : "down";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className={cn("size-2 rounded-full", dot[tone])} />
          System status
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3" aria-label="System status details">
        <div className="flex items-center justify-between">
          <strong className="text-sm">System status</strong>
          <span className="text-xs text-muted-foreground">{healthy ? "Operational" : "Attention needed"}</span>
        </div>
        <HealthRows connected={connected} health={health} reporting={reporting} devices={devices} />
      </PopoverContent>
    </Popover>
  );
}
