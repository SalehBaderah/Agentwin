import type { State } from "@/types";
import { useEffect, useState } from "react";
import { api, strings } from "@/types";
import { ProjectMonitoringSettings } from "@/features/settings/MonitoringSettings";
import { ThemeSwitcher } from "@/theme";
import type { ServiceHealth } from "@/app/types";
import { StatusBadge as Badge } from "@/components/StatusBadge";

export function GlobalSettings({ states }: { states: State[] }) {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  useEffect(() => {
    api<ServiceHealth>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Workspace configuration</div>
          <h1>Settings</h1>
          <p>Configure live alerts, Win summaries, and email delivery for each project.</p>
        </div>
      </div>
      <ProjectMonitoringSettings states={states} emailConfigured={health?.email_configured ?? false} defaultRecipientConfigured={health?.email_default_recipient_configured ?? false}/>
      <section className="panel appearance-settings"><div><h2>Appearance</h2><p>Choose a theme, or follow your device. Your preference is saved in this browser.</p></div><ThemeSwitcher/></section>
      <section className="panel settings-content">
        <h2>Service availability</h2>
        <div className="measurement">
          <span>MQTT broker</span>
          <Badge tone={health?.mqtt ? "success" : "warning"}>
            {health?.mqtt ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <div className="measurement">
          <span>AI provider</span>
          <span>
            {health?.agent_configured
              ? "Configured · request needed to verify availability"
              : strings.unavailable}
          </span>
        </div>
        <div className="measurement">
          <span>Rejected MQTT messages</span>
          <span>{health?.mqtt_rejections ?? "—"}</span>
        </div>
        <h3>Setup notes</h3>
        <p>
          Configure provider and SMTP credentials in the backend .env file. Device identity,
          field mapping, and inventory are defined when a project is created.
        </p>
        <p>
          The MVP binds to loopback. See docs/hardware.md before connecting a
          device or exposing the broker to a private network.
        </p>
        <p>
          RF calibration, trained anomaly models, and behavioral simulation are
          unavailable. Physical control is limited to declared capabilities.
        </p>
      </section>
    </main>
  );
}
