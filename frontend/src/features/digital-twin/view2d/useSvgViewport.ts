import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";

type Box = { x: number; y: number; w: number; h: number };

export function useSvgViewport(width: number, height: number, sceneKey: string) {
  const initial = useCallback((): Box => ({ x: 0, y: 0, w: width, h: height }), [width, height]);
  const [box, setBox] = useState(initial);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  useEffect(() => { setBox(initial()); pointers.current.clear(); }, [initial, sceneKey]);

  const zoomAt = useCallback((factor: number, x = .5, y = .5) => setBox((current) => {
    const scale = Math.max(.4, Math.min(2.5, current.w * factor / width));
    const w = width * scale;
    const h = height * scale;
    return { x: current.x + (current.w - w) * x, y: current.y + (current.h - h) * y, w, h };
  }), [width, height]);
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    if ((event.target as Element).closest('[role="button"]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (before && after) zoomAt(before / after, ((event.clientX + other.x) / 2 - rect.left) / rect.width, ((event.clientY + other.y) / 2 - rect.top) / rect.height);
    } else {
      setBox((current) => ({ ...current, x: current.x - (event.clientX - previous.x) * current.w / rect.width, y: current.y - (event.clientY - previous.y) * current.h / rect.height }));
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => { pointers.current.delete(event.pointerId); };
  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    zoomAt(event.deltaY > 0 ? 1.12 : .89, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };
  return { box, zoomAt, fit: () => setBox(initial()), reset: () => setBox(initial()), events: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel } };
}
