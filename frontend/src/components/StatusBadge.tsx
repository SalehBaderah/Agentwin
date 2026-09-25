import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "neutral" | "";

export function StatusBadge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  const variant = tone === "success" || tone === "warning" ? tone : "secondary";
  return (
    <Badge variant={variant} className={cn("badge gap-1.5", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", variant === "success" ? "bg-success" : variant === "warning" ? "bg-warning" : "bg-muted-foreground")} />
      {children}
    </Badge>
  );
}
