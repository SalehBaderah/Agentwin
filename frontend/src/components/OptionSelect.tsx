import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: React.ReactNode };

export function OptionSelect({ id, value, onValueChange, options, className, size, disabled, "aria-label": ariaLabel }: { id?: string; size?: "sm" | "default"; value: string; onValueChange: (value: string) => void; options: Option[]; className?: string; disabled?: boolean; "aria-label"?: string }) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} data-value={value} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.filter((option) => option.value !== "").map((option) => (
          <SelectItem key={option.value} value={option.value} data-value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
