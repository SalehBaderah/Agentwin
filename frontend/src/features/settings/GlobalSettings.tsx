import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { StatusBadge } from "@/components/StatusBadge";
import type { ServiceHealth } from "@/app/types";
import { ProjectMonitoringSettings } from "@/features/settings/MonitoringSettings";
import { ThemeSwitcher } from "@/theme";
import type { State } from "@/types";
import { api, strings } from "@/types";

export function GlobalSettings({ states }: { states: State[] }) {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  useEffect(() => {
    api<ServiceHealth>("/health")
      .then(setHealth)
      .catch(() => {});
  }, []);
  const rows: [string, React.ReactNode][] = [
    ["MQTT broker", <StatusBadge tone={health?.mqtt ? "success" : "warning"}>{health?.mqtt ? "Connected" : "Disconnected"}</StatusBadge>],
    ["AI provider", health?.agent_configured ? "Configured · request needed to verify availability" : strings.unavailable],
    ["Rejected MQTT messages", health?.mqtt_rejections ?? "—"],
  ];
  return (
    <Page>
      <PageHeading eyebrow="Workspace configuration" title="Settings" description="Configure live alerts, Win summaries, and email delivery for each project." />
      <ProjectMonitoringSettings states={states} emailConfigured={health?.email_configured ?? false} defaultRecipientConfigured={health?.email_default_recipient_configured ?? false} />
      <Card className="mb-1 flex-row flex-wrap items-center justify-between gap-6 p-[26px] max-[540px]:p-5">
        <div>
          <h2 className="mb-1.5 text-lg leading-normal font-bold tracking-[-0.3px]">Appearance</h2>
          <p className="text-sm leading-[1.65] text-muted-foreground">Choose a theme, or follow your device. Your preference is saved in this browser.</p>
        </div>
        <ThemeSwitcher />
      </Card>
      <Card className="block p-[26px] max-[540px]:p-5">
        <h2 className="mb-[15px] text-lg leading-normal font-bold tracking-[-0.3px]">Service availability</h2>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b py-[15px] text-[13px] max-[720px]:flex-wrap">
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <h3 className="mt-[22px] mb-2 text-[15px] leading-normal font-bold">Setup notes</h3>
        <div className="mb-[18px] grid gap-[18px] text-sm leading-[1.65] text-muted-foreground">
          <p>Configure provider and SMTP credentials in the backend .env file. Device identity, field mapping, and inventory are defined when a project is created.</p>
          <p>The MVP binds to loopback. See docs/hardware.md before connecting a device or exposing the broker to a private network.</p>
          <p>RF calibration, trained anomaly models, and behavioral simulation are unavailable. Physical control is limited to declared capabilities.</p>
        </div>
      </Card>
    </Page>
  );
}
