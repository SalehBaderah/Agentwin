import { useEffect } from "react";
import { metricValue } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import type { TwinComponentState, TwinState } from "../model/twin.types";
import { useSvgViewport } from "./useSvgViewport";
import { visualFor } from "./visualRegistry";

const ROW = 620;
const WIDTH = 800;
const reportedValue = (component: TwinComponentState) => {
  const metric = component.observed.metrics[0];
  if (!metric || metric.value === null || metric.value === undefined) return "No report";
  const value = typeof metric.value === "boolean" ? metric.value ? "ON" : "OFF" : typeof metric.value === "number" ? metricValue(metric.value, metric.precision) : String(metric.value);
  return `${metric.isLastKnown ? "Last known" : "Reported"} ${value}${metric.unit ? ` ${metric.unit}` : ""}`;
};
const isOnboardLed = (component: TwinComponentState, board?: TwinComponentState) => Boolean(board && ["arduino-uno", "uno-r4"].includes(board.visualKey) && component.pin?.toUpperCase() === "D13" && /led/.test(component.visualKey) && /built[ -]?in|onboard/i.test(component.label));

function Label({ component, x, y, selected, onSelect }: { component: TwinComponentState; x: number; y: number; selected: boolean; onSelect: (id: string) => void }) {
  return <g onClick={() => onSelect(component.id)} className="physical-label" role="button" tabIndex={0} aria-label={`Inspect ${component.label}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(component.id); } }}>
    <text x={x} y={y} className={`physical-label-title ${selected ? "is-active" : ""}`}>{component.label.length > 25 ? component.label.slice(0, 23) + "…" : component.label}</text>
    <text x={x} y={y + 19} className={`physical-label-value ${component.health.freshness}`}>{reportedValue(component)}</text>
  </g>;
}

function DeviceAssembly({ twin, deviceId, offsetY, selectedId, onSelect }: { twin: TwinState; deviceId: string; offsetY: number; selectedId: string; onSelect: (id: string) => void }) {
  const knownDevices = twin.devices.map((device) => device.id);
  const items = twin.components.filter((component) => deviceId === "Unassigned" ? !component.deviceId || !knownDevices.includes(component.deviceId) : component.deviceId === deviceId);
  const controller = items.find((component) => component.type === "controller");
  const gateway = items.find((component) => component.type === "gateway" || component.type === "transport");
  const onboardLed = items.find((component) => isOnboardLed(component, controller));
  const physical = items.filter((component) => component !== controller && component !== gateway && component !== onboardLed && ["sensor", "actuator"].includes(component.type));
  const fields = items.filter((component) => component !== controller && component !== gateway && component !== onboardLed && !physical.includes(component));
  const BoardVisual = controller ? visualFor(controller) : null;
  const GatewayGraphic = gateway ? visualFor(gateway) : null;
  const connector = twin.devices.find((device) => device.id === deviceId)?.connector || controller?.transport || "configured";
  const extension = Math.max(0, physical.length - 1) * 150;
  const gatewayY = 300 + extension;
  const fieldTop = 500 + extension;
  const anchors = new Map<string, { x: number; y: number }>();
  if (controller) anchors.set(controller.id, {x:490,y:240});
  if (gateway) anchors.set(gateway.id,{x:560,y:gatewayY+80});
  if (onboardLed) anchors.set(onboardLed.id,{x:420,y:160});
  physical.forEach((c,i)=>anchors.set(c.id,{x:554,y:190+i*150}));
  fields.forEach((c,i)=>anchors.set(c.id,{x:75+(i%4)*165,y:fieldTop+32+Math.floor(i/4)*58}));
  const declared = twin.edges.filter(e=>anchors.has(e.source)&&anchors.has(e.target));
  const fallback = controller ? items.filter(c=>c.id!==controller.id && anchors.has(c.id) && !declared.some(e=>e.source===c.id || e.target===c.id)).map(c=>({id:"inferred-"+c.id,source:controller.id,target:c.id,label:"Inferred association",category:"context"})) : [];
  const wires = [...declared.map(e=>({...e,inferred:false})),...fallback.map(e=>({...e,inferred:true}))];
  return <g transform={`translate(0 ${offsetY})`}>
    {wires.map((wire,i)=>{const a=anchors.get(wire.source)!, b=anchors.get(wire.target)!; const bend=Math.max(a.x,b.x)+24+(i%4)*12; const target=items.find(c=>c.id===wire.target); return <g key={wire.id}><path className={`physical-wire ${wire.inferred?"is-inferred":""} ${selectedId===wire.source||selectedId===wire.target?"is-selected":""}`} d={`M${a.x} ${a.y} H${bend} V${b.y} H${b.x}`} style={wire.category==="power"?{stroke:"var(--relationship-power)"}:undefined}><title>{wire.label}{target?.pin ? " · "+target.pin : ""} · {wire.inferred?"inferred association":"configured relationship"}; schematic endpoints</title></path><circle cx={b.x} cy={b.y} r="3" fill="var(--accent-text)"/></g>;})}
    <path d="M40 36 H760" stroke="var(--border-strong)" strokeWidth="1"/>
    <text x="42" y="61" className="physical-device-title">{deviceId}</text>
    <text x="758" y="61" textAnchor="end" className="physical-device-meta">{connector.toUpperCase()} · {twin.devices.find((device) => device.id === deviceId)?.freshness || "unavailable"}</text>
    {controller && BoardVisual && <g transform="translate(90 80)"><BoardVisual component={controller} selected={selectedId === controller.id} onSelect={onSelect} onboardLed={onboardLed}/></g>}
    {controller && <Label component={controller} x={100} y={368} selected={selectedId === controller.id} onSelect={onSelect}/>}
    {onboardLed && <g><text x="502" y="107" className="physical-pin-callout">D13 · onboard LED</text><Label component={onboardLed} x={502} y={129} selected={selectedId === onboardLed.id} onSelect={onSelect}/></g>}
    {gateway && GatewayGraphic && <g><circle cx="560" cy={gatewayY + 86} r="4" fill="#a592d7"/><text x="314" y={gatewayY + 58} className="physical-path-label">{connector === "usb" ? "USB SERIAL" : "WIRELESS TELEMETRY"}</text><g transform={`translate(555 ${gatewayY})`}><GatewayGraphic component={gateway} selected={selectedId === gateway.id} onSelect={onSelect}/></g><Label component={gateway} x={568} y={gatewayY + 164} selected={selectedId === gateway.id} onSelect={onSelect}/></g>}
    {physical.map((component, offset) => { const Visual = visualFor(component); const py = 155 + offset * 150; return <g key={component.id}><g transform={`translate(540 ${py}) scale(.7)`}><Visual component={component} selected={selectedId === component.id} onSelect={onSelect}/></g><Label component={component} x={548} y={py + 145} selected={selectedId === component.id} onSelect={onSelect}/></g>; })}
    {fields.length > 0 && <g transform={`translate(75 ${fieldTop})`}><text y="0" className="physical-path-label">REPORTED FIELDS</text>{fields.map((component, offset) => { const x = (offset % 4) * 165, fy = Math.floor(offset / 4) * 58; return <g key={component.id} onClick={() => onSelect(component.id)} className={`physical-field ${selectedId === component.id ? "is-active" : ""}`} role="button" tabIndex={0} aria-label={`Inspect ${component.label}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(component.id); } }}><rect x={x} y={fy + 12} width="154" height="42" rx="5"/><text x={x + 10} y={fy + 29}>{component.label}</text><text x={x + 10} y={fy + 46} className="physical-field-value">{reportedValue(component).length > 28 ? reportedValue(component).slice(0,26)+"…" : reportedValue(component)}</text></g>; })}</g>}
  </g>;
}

export function PhysicalTwin({ twin, selectedId, onSelect }: { twin: TwinState; selectedId: string; onSelect: (id: string) => void }) {
  const deviceIds = twin.devices.map((device) => device.id);
  const extra = twin.components.some((component) => !component.deviceId || !deviceIds.includes(component.deviceId)) ? ["Unassigned"] : [];
  const lanes = [...deviceIds, ...extra];
  const positioned = lanes.reduce<{ id: string; y: number; height: number }[]>((result, id) => {
    const items = twin.components.filter((component) => id === "Unassigned" ? !component.deviceId || !deviceIds.includes(component.deviceId) : component.deviceId === id);
    const board = items.find((component) => component.type === "controller");
    const physical = items.filter((component) => ["sensor", "actuator"].includes(component.type) && !isOnboardLed(component, board));
    const fields = items.filter((component) => component !== board && component.type !== "gateway" && component.type !== "transport" && !physical.includes(component) && !isOnboardLed(component, board));
    const height = ROW + Math.max(0, physical.length - 1) * 150 + Math.max(0, Math.ceil(fields.length / 4) - 1) * 58;
    result.push({ id, y: result.at(-1) ? result.at(-1)!.y + result.at(-1)!.height : 0, height });
    return result;
  }, []);
  const height = Math.max(ROW, positioned.at(-1) ? positioned.at(-1)!.y + positioned.at(-1)!.height : ROW);
  const viewport = useSvgViewport(WIDTH, height, `physical:${twin.project.id}:${lanes.join(",")}`);
  useEffect(() => { const focus = (event: Event) => { const component = twin.components.find(c => c.id === (event as CustomEvent<string>).detail); const lane = positioned.find(p => p.id === component?.deviceId || p.id === "Unassigned" && !twin.devices.some(d => d.id === component?.deviceId)); if (lane) viewport.focus(400, lane.y + lane.height / 2); }; window.addEventListener("agentwin-focus-component", focus); return () => window.removeEventListener("agentwin-focus-component", focus); });
  return <div className="physical-view live-twin-canvas">
    <div className="twin2d-caption"><strong>Physical 2D</strong><span>{twin.sessionLabel} · illustration from configured hardware</span></div>
    <svg className="twin2d-svg physical-svg" viewBox={`${viewport.box.x} ${viewport.box.y} ${viewport.box.w} ${viewport.box.h}`} preserveAspectRatio="xMidYMid meet" aria-label={`${twin.sessionLabel} physical twin`} {...viewport.events}>
      <defs><pattern id="physical-grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0 H0 V34" fill="none" stroke="var(--border)" strokeWidth=".7"/></pattern></defs>
      <rect x="-2000" y="-2000" width="5000" height="5000" fill="var(--background)"/><rect width={WIDTH} height={height} fill="url(#physical-grid)"/>
      {positioned.map((item) => <DeviceAssembly key={item.id} twin={twin} deviceId={item.id} offsetY={item.y} selectedId={selectedId} onSelect={onSelect}/>)}
    </svg>
    <div className="absolute bottom-3.5 left-3.5 flex rounded-[9px] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-[3px] shadow-[0_8px_24px_var(--shadow-color)] backdrop-blur-[10px] max-[430px]:bottom-2.5 max-[430px]:left-2.5" role="group" aria-label="Physical view controls">
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={() => viewport.zoomAt(.82)} aria-label="Zoom in"><Plus /></Button>
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={() => viewport.zoomAt(1.22)} aria-label="Zoom out"><Minus /></Button>
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={viewport.fit} aria-label="Fit view"><Focus /></Button>
      <Button variant="ghost" size="icon" className="h-[34px] w-9 rounded-md text-subtle-foreground hover:bg-accent hover:text-foreground max-[430px]:size-10" onClick={viewport.reset} aria-label="Reset view"><RotateCcw /></Button>
    </div>
    <div className="twin2d-hint">Solid: configured link · Dashed: inferred association · Wiring is schematic</div>
  </div>;
}
