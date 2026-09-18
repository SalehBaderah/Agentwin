import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Layer, Line, Rect, Stage, Text } from "react-konva";
import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import type { TwinState } from "../model/twin.types";
import { TwinConnection, TwinDevice, type TwinPalette } from "./TwinSceneElements";

function usePalette(): TwinPalette {
  const read = useCallback(() => {
    const style = getComputedStyle(document.documentElement);
    const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    return {
      canvas: value("--background", "#0B0B10"), grid: value("--border", "#282834"), surface: value("--surface", "#181820"), elevated: value("--surface-elevated", "#2A253D"), border: value("--border-strong", "#3A3945"), text: value("--text-primary", "#FFFFFF"), muted: value("--text-muted", "#9DA3AF"), accent: value("--accent", "#2CA5E0"), success: value("--success", "#4EBB8A"), warning: value("--warning", "#D6A34A"), danger: value("--danger", "#DB4B63"), physical: value("--relationship-physical", "#C8B58B"), control: value("--relationship-control", "#CE9DAA"), power: value("--relationship-power", "#CAB979"),
    };
  }, []);
  const [palette, setPalette] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [read]);
  return palette;
}

export function LiveTwinScene({ twin, selectedId, onSelect }: { twin: TwinState; selectedId: string; onSelect: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [pulse, setPulse] = useState(0);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const layout = twin.layout.map(node => ({ ...node, ...positions[node.id] }));
  const palette = usePalette();
  const reducedMotion = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    const padding = 42;
    const scale = Math.min(1, (size.width - padding * 2) / twin.width, (size.height - padding * 2) / twin.height);
    setView({ x: (size.width - twin.width * scale) / 2, y: (size.height - twin.height * scale) / 2, scale });
  }, [size, twin.height, twin.width]);
  useEffect(() => { fit(); }, [fit, twin.source.project.id, twin.source.session.id]);

  useEffect(() => {
    if (reducedMotion || !twin.edges.some((edge) => edge.activity === "fresh" || edge.activity === "aging" || edge.activity === "command")) return;
    const timer = window.setInterval(() => setPulse((value) => (value + .12) % 1), 250);
    return () => window.clearInterval(timer);
  }, [reducedMotion, twin.edges]);

  const zoom = (factor: number) => setView((current) => ({ ...current, scale: Math.min(2.2, Math.max(.35, current.scale * factor)) }));
  const onWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const pointer = stage.current?.getPointerPosition();
    if (!pointer) return;
    const oldScale = view.scale;
    const nextScale = Math.min(2.2, Math.max(.35, oldScale * (event.evt.deltaY > 0 ? .9 : 1.1)));
    const point = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale };
    setView({ scale: nextScale, x: pointer.x - point.x * nextScale, y: pointer.y - point.y * nextScale });
  };
  const nodes = new Map(layout.map((node) => [node.id, node]));
  const gridLines = [];
  for (let x = 0; x <= twin.width; x += 24) gridLines.push(<Line key={`x${x}`} points={[x, 0, x, twin.height]} stroke={palette.grid} strokeWidth={.5} opacity={.45}/>);
  for (let y = 0; y <= twin.height; y += 24) gridLines.push(<Line key={`y${y}`} points={[0, y, twin.width, y]} stroke={palette.grid} strokeWidth={.5} opacity={.45}/>);
  const lanes = [...new Set(twin.layout.map((node) => node.lane))];

  return <div ref={host} className="live-twin-canvas">
    <Stage ref={stage} width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable onDragEnd={(event) => { if (event.target === stage.current) setView((current) => ({ ...current, x: event.target.x(), y: event.target.y() })); }} onWheel={onWheel}>
      <Layer listening={false}><Rect width={twin.width} height={twin.height} fill={palette.canvas}/>{gridLines}</Layer>
      <Layer listening={false}>
        {lanes.map((lane) => { const laneNodes = twin.layout.filter((node) => node.lane === lane); const y = Math.min(...laneNodes.map((node) => node.y)) - 34; return <Text key={lane} x={56} y={y} text={lane} fontFamily="Manrope" fontStyle="bold" fontSize={11} fill={palette.muted}/>; })}
        {twin.edges.map((edge) => { const source = nodes.get(edge.source); const target = nodes.get(edge.target); return source && target ? <TwinConnection key={edge.id} edge={edge} source={source} target={target} palette={palette} pulse={pulse}/> : null; })}
      </Layer>
      <Layer>{layout.map((node) => <TwinDevice key={node.id} node={node} selected={node.id === selectedId} palette={palette} onSelect={onSelect} onMove={(id, position) => setPositions(current => ({ ...current, [id]: position }))}/>)}</Layer>
    </Stage>
    <div className="twin-zoom-controls" role="group" aria-label="Live Twin view controls">
      <button type="button" onClick={() => zoom(1.15)} aria-label="Zoom in" title="Zoom in"><Plus size={16}/></button>
      <button type="button" onClick={() => zoom(.87)} aria-label="Zoom out" title="Zoom out"><Minus size={16}/></button>
      <button type="button" onClick={() => {
        const left = Math.min(0, ...layout.map(node => node.x));
        const top = Math.min(0, ...layout.map(node => node.y));
        const width = Math.max(...layout.map(node => node.x + node.width)) - left + 84;
        const height = Math.max(...layout.map(node => node.y + node.height)) - top + 84;
        const scale = Math.min(1, size.width / width, size.height / height);
        setView({ x: (size.width - (width - 84) * scale) / 2 - left * scale, y: (size.height - (height - 84) * scale) / 2 - top * scale, scale });
      }} aria-label="Fit system" title="Fit system"><Focus size={16}/></button>
      <button type="button" onClick={() => { setPositions({}); fit(); }} aria-label="Reset layout" title="Reset layout"><RotateCcw size={16}/></button>
    </div>
    <div className="sr-only" aria-label="Live Twin components">
      {twin.components.map((component, index) => <button key={component.id} type="button" onClick={() => onSelect(component.id)} onKeyDown={(event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const next = (index + (event.key === "ArrowRight" ? 1 : -1) + twin.components.length) % twin.components.length;
        onSelect(twin.components[next].id);
        (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
      }}>{component.label}, {component.health.freshness}, {valueTextForA11y(component)}</button>)}
    </div>
  </div>;
}

function valueTextForA11y(component: TwinState["components"][number]) {
  const metric = component.observed.metrics[0];
  if (!metric || metric.value === undefined || metric.value === null) return "no reported reading";
  return `${metric.isLastKnown ? "last known " : "reported "}${String(metric.value)} ${metric.unit}`;
}
