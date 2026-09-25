import { useLayoutEffect, useRef } from "react";

/** Positions an indicator under the active Radix tab trigger; animates on change, snaps on resize or first paint. */
export function useTabIndicator(value: string) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const move = (animate: boolean) => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!active) return;
      if (!animate) indicator.style.transition = "none";
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
      indicator.style.width = `${active.offsetWidth}px`;
      if (!animate) {
        void indicator.offsetWidth;
        indicator.style.transition = "";
      }
    };
    move(initialized.current);
    initialized.current = true;
    const observer = new ResizeObserver(() => move(false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);
  return { listRef, indicatorRef };
}
