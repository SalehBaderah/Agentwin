import { Link } from "react-router-dom";
import { ArrowRight, Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { StatusBadge } from "@/components/StatusBadge";
import { emailStatus, summaryTime } from "@/lib/format";
import type { State } from "@/types";
import { time } from "@/types";

export function GlobalEvents({ states }: { states: State[] }) {
  return (
    <Page>
      <PageHeading eyebrow="Evidence and recovery" title="Events across your systems." description="Live-session alerts and scheduled project summaries." />
      {states.map((s) => (
        <Card key={s.project.id} className="mb-1 block px-5 pt-0 pb-[15px]">
          <div className="mt-7 mb-3.5 flex flex-col items-start">
            <h2 className="text-[17px] leading-normal font-bold tracking-[-0.3px]">{s.project.name}</h2>
            <Link className="flex items-center gap-2 text-[13px] text-subtle-foreground hover:text-foreground" to={"/projects/" + s.project.id + "?tab=events"}>
              Investigate <ArrowRight className="size-[15px]" />
            </Link>
          </div>
          {s.events.length ? s.events.map((e) => (
            <div key={e.id} className="flex items-center gap-3.5 border-b py-[18px] transition-colors duration-[var(--duration-quick)] last:border-b-0 hover:bg-accent max-[800px]:flex-wrap max-[800px]:py-4 [&>svg]:size-[17px] [&>svg]:shrink-0">
              <Bell />
              <div className="min-w-0 flex-1 max-[800px]:min-w-40">
                <strong className="block text-sm font-semibold">{e.evidence.rule}</strong>
                <span className="mt-[5px] block text-xs leading-normal text-muted-foreground">
                  {time(e.created)} · {e.acknowledged ? "Acknowledged" : "Not acknowledged"} · Email {emailStatus(e.email_status, s.project.monitoring.alert_email_enabled)}
                </span>
              </div>
              <StatusBadge tone={e.recovered ? "success" : "warning"}>{e.recovered ? "Recovered" : "Open"}</StatusBadge>
            </div>
          )) : <p className="text-sm leading-[1.65] text-muted-foreground">No recorded alerts.</p>}
          {s.summaries?.length > 0 && (
            <div className="mt-5 border-t pt-[18px]">
              <h3 className="mb-3 text-sm font-bold">Recent summaries</h3>
              {s.summaries.slice(0, 3).map((summary) => (
                <div key={summary.id} className="border-t py-2.5">
                  <span className="text-[11px] text-muted-foreground">{summaryTime(summary.period_end)}</span>
                  <p className="mt-[5px] text-[13px] leading-normal text-muted-foreground">{summary.body}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </Page>
  );
}
