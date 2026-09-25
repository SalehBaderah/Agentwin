import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTabIndicator } from "./useTabIndicator";

export function SlidingTabsList({ value, items, className, "aria-label": ariaLabel }: { value: string; items: [string, string][]; className?: string; "aria-label": string }) {
  const { listRef, indicatorRef } = useTabIndicator(value);
  return (
    <TabsList ref={listRef} aria-label={ariaLabel} className={cn("relative h-10 w-max justify-start p-1", className)}>
      <span ref={indicatorRef} aria-hidden="true" className="absolute top-1 bottom-1 left-0 rounded-md bg-background shadow-sm transition-[transform,width] duration-[var(--duration-fast)] ease-smooth motion-reduce:transition-none dark:bg-surface-elevated" />
      {items.map(([key, label]) => (
        <TabsTrigger key={key} value={key} className="relative z-10 px-3 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent">
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
