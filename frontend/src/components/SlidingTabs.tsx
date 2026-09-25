import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTabIndicator } from "./useTabIndicator";

export function SlidingTabsList({ value, items, className, "aria-label": ariaLabel }: { value: string; items: [string, string][]; className?: string; "aria-label": string }) {
  const { listRef, indicatorRef } = useTabIndicator(value);
  return (
    <TabsList ref={listRef} aria-label={ariaLabel} className={cn("relative w-max justify-start gap-[3px] p-[7px] group-data-horizontal/tabs:h-auto", className)}>
      <span ref={indicatorRef} aria-hidden="true" className="absolute top-[7px] bottom-[7px] left-0 rounded-lg border border-brand-border bg-brand-subtle transition-[transform,width] duration-[var(--duration-fast)] ease-smooth motion-reduce:transition-none" />
      {items.map(([key, label]) => (
        <TabsTrigger key={key} value={key} className="relative z-10 h-[42px] rounded-lg px-3.5 text-[13px] font-normal data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent">
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
