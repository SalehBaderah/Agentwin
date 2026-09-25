import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground [&>svg]:size-8 [&>svg]:text-brand", className)}>
      {icon}
      {title && <strong className="text-base font-semibold text-foreground">{title}</strong>}
      {children}
      {action}
    </div>
  );
}
