import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import type { TwinState } from "../model/twin.types";
import { buildFlowModel } from "./flowModel";
import { useSvgViewport } from "./useSvgViewport";

export function DataFlowTwin({ twin, selectedId, onSelect }: { twin: TwinState; selectedId: string; onSelect: (id: string) => void }) {
  const model = useMemo(() => buildFlowModel(twin), [twin]);
  const viewport = useSvgViewport(model.width, model.height, `${twin.project.id}:${model.nodes.map((node) => node.id).join(",")}`);
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => { const query = matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReducedMotion(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  useEffect(() => { const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && !document.hidden)); if (host.current) observer.observe(host.current); const update = () => setVisible(!document.hidden && Boolean(host.current && host.current.getBoundingClientRect().bottom > 0)); document.addEventListener("visibilitychange", update); return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); }; }, []);
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  return <div ref={host} className="flow-view live-twin-canvas">
    <div className="twin2d-caption"><strong>Data Flow</strong><span>{twin.sessionLabel} · paths follow configured devices and fields</span></div>
    <svg className="twin2d-svg flow-svg" viewBox={`${viewport.box.x} ${viewport.box.y} ${viewport.box.w} ${viewport.box.h}`} preserveAspectRatio="xMidYMid meet" aria-label={`${twin.sessionLabel} data flow`} {...viewport.events}>
      <defs><pattern id="flow-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#29374a"/></pattern><marker id="flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#697eaa" strokeWidth="1.2"/></marker></defs>
      <rect x="-2000" y="-2000" width="5500" height="5500" fill="#0d1420"/><rect width={model.width} height={model.height} fill="url(#flow-dots)"/>
      {[[105,"Physical"],[305,"Controller"],[510,"Fields / processing"],[715,"Transport"],[900,"Agentwin"],[1080,"Operations"]].map(([x,label]) => <text key={label} x={x} y="52" textAnchor="middle" className="flow-column-label">{label}</text>)}
      {model.links.map((link) => {
        const source = byId.get(link.from), target = byId.get(link.to);
        if (!source || !target) return null;
        const d = `M${source.x + 36} ${source.y} C${source.x + (target.x-source.x)*.43} ${source.y}, ${source.x + (target.x-source.x)*.57} ${target.y}, ${target.x - 36} ${target.y}`;
        const live = twin.sessionLabel === "LIVE" && (link.freshness === "fresh" || link.freshness === "aging");
        return <g key={link.id} className={`flow-connection ${link.freshness}`}><title>{link.label}: {link.freshness}</title><path d={d} className="flow-base" markerEnd="url(#flow-arrow)"/><path d={d} className="flow-active"/>{live && visible && !reducedMotion && <circle r={link.freshness === "fresh" ? 4 : 3} fill={link.freshness === "fresh" ? "#79d8e3" : "#d5aa65"}><animateMotion path={d} dur={link.freshness === "fresh" ? "2.6s" : "5.2s"} repeatCount="indefinite"/></circle>}</g>;
      })}
      {model.nodes.map((node) => <g key={node.id} transform={`translate(${node.x} ${node.y})`} className={`flow-node ${node.freshness} ${node.componentId === selectedId ? "is-active" : ""} ${node.componentId ? "is-selectable" : ""}`} role={node.componentId ? "button" : undefined} tabIndex={node.componentId ? 0 : undefined} aria-label={node.componentId ? `Inspect ${node.label}` : undefined} onClick={node.componentId ? () => onSelect(node.componentId!) : undefined} onKeyDown={node.componentId ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.componentId!); } } : undefined}>
        <title>{node.label}: {node.subtitle} · {node.freshness}</title>
        <circle r="32" className="flow-node-ring"/><circle r="23" className="flow-node-core"/>
        <text y="5" textAnchor="middle" className="flow-node-mark">{node.role === "controller" ? "C" : node.role === "gateway" ? "G" : node.role === "sensor" ? "S" : node.role === "actuator" ? "A" : node.role === "service" ? "◆" : "·"}</text>
        <text y="57" textAnchor="middle" className="flow-node-name">{node.label}</text><text y="76" textAnchor="middle" className="flow-node-subtitle">{node.subtitle}</text>
      </g>)}
    </svg>
    <div className="absolute bottom-3.5 left-3.5 flex rounded-[9px] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-[3px] shadow-[0_8px_24px_var(--shadow-color)] backdrop-blur-[10px] max-[430px]:bottom-2.5 max-[430px]:left-2.5" role="group" aria-label="Data Flow controls">
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={() => viewport.zoomAt(.82)} aria-label="Zoom in"><Plus /></Button>
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={() => viewport.zoomAt(1.22)} aria-label="Zoom out"><Minus /></Button>
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={viewport.fit} aria-label="Fit view"><Focus /></Button>
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={viewport.reset} aria-label="Reset view"><RotateCcw /></Button>
    </div>
    <div className="twin2d-hint">Flow indicates recent reported telemetry, not independent physical verification</div>
  </div>;
}
