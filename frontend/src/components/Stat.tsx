import { Card } from "@/components/ui/card";

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="min-h-[110px] min-w-0 gap-0 rounded-[9px] border bg-card px-[22px] py-5 leading-normal shadow-none ring-0 max-[540px]:p-4">
      <div className="flex justify-between gap-2 text-[13px] text-subtle-foreground [&_svg]:size-[15px] [&_svg]:text-muted-foreground">
        {label}
        {icon}
      </div>
      <strong className="mt-3.5 mb-2 block text-[clamp(23px,2vw,30px)] leading-tight font-medium tracking-[-0.6px] text-foreground tabular-nums wrap-anywhere [&_em]:ml-1.5 [&_em]:text-[13px] [&_em]:tracking-normal [&_em]:text-muted-foreground [&_em]:not-italic">{value}</strong>
      <small className="text-xs leading-normal text-muted-foreground">{hint}</small>
    </Card>
  );
}
