import { Focus, Minus, Plus, RotateCcw } from "lucide-react";
import type { TwinComponentState, TwinState } from "../model/twin.types";
import { useSvgViewport } from "./useSvgViewport";
import { visualFor } from "./visualRegistry";

const ROW = 620;
const WIDTH = 800;
const reportedValue = (component: TwinComponentState) => {
  const metric = component.observed.metrics[0];
  if (!metric || metric.value === null || metric.value === undefined) return "No report";
  const value = typeof metric.value === "boolean" ? metric.value ? "ON" : "OFF" : typeof metric.value === "number" ? metric.value.toLocaleString("en-US", { maximumFractionDigits: metric.precision }) : String(metric.value);
  return `${metric.isLastKnown ? "Last known" : "Reported"} ${value}${metric.unit ? ` ${metric.unit}` : ""}`;
};
const isOnboardLed = (component: TwinComponentState, board?: TwinComponentState) => Boolean(board && ["arduino-uno", "uno-r4"].includes(board.visualKey) && component.pin?.toUpperCase() === "D13" && /led/.test(component.visualKey) && /built[ -]?in|onboard/i.test(component.label));

function Label({ component, x, y, selected, onSelect }: { component: TwinComponentState; x: number; y: number; selected: boolean; onSelect: (id: string) => void }) {
  return <g onClick={() => onSelect(component.id)} className="physical-label" role="button" tabIndex={0} aria-label={`Inspect ${component.label}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(component.id); } }}>
    <text x={x} y={y} className={`physical-label-title ${selected ? "is-active" : ""}`}>{component.label}</text>
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
  return <g transform={`translate(0 ${offsetY})`}>
    <path d="M40 36 H760" stroke="#334154" strokeWidth="1"/>
    <text x="42" y="61" className="physical-device-title">{deviceId}</text>
    <text x="758" y="61" textAnchor="end" className="physical-device-meta">{connector.toUpperCase()} · {twin.devices.find((device) => device.id === deviceId)?.freshness || "unavailable"}</text>
    {controller && BoardVisual && <g transform="translate(90 80)"><BoardVisual component={controller} selected={selectedId === controller.id} onSelect={onSelect} onboardLed={onboardLed}/></g>}
    {controller && <Label component={controller} x={100} y={368} selected={selectedId === controller.id} onSelect={onSelect}/>}
    {onboardLed && <g><path d="M420 160 L494 112" stroke="#b7a17c" strokeWidth="1.5" fill="none"/><text x="502" y="107" className="physical-pin-callout">D13 · onboard LED</text><Label component={onboardLed} x={502} y={129} selected={selectedId === onboardLed.id} onSelect={onSelect}/></g>}
    {gateway && GatewayGraphic && <g><path d={connector === "usb" ? `M90 200 C14 530 474 ${gatewayY + 210} 560 ${gatewayY + 86}` : `M490 237 C570 215 520 ${gatewayY + 15} 560 ${gatewayY + 55}`} fill="none" stroke={connector === "usb" ? "#8580b5" : "#548ca1"} strokeWidth="3" strokeDasharray={connector === "usb" ? undefined : "7 9"}/><circle cx="560" cy={gatewayY + 86} r="4" fill="#a592d7"/><text x="588" y={gatewayY + 189} className="physical-path-label">{connector === "usb" ? "USB SERIAL" : "WIRELESS TELEMETRY"}</text><g transform={`translate(555 ${gatewayY})`}><GatewayGraphic component={gateway} selected={selectedId === gateway.id} onSelect={onSelect}/></g><Label component={gateway} x={568} y={gatewayY + 164} selected={selectedId === gateway.id} onSelect={onSelect}/></g>}
    {physical.map((component, offset) => { const Visual = visualFor(component); const py = 155 + offset * 150; return <g key={component.id}><path d={`M492 241 C520 ${209 + offset * 30} 520 ${py + 34} 554 ${py + 34}`} fill="none" stroke="#9182b6" strokeWidth="2"/><g transform={`translate(540 ${py}) scale(.7)`}><Visual component={component} selected={selectedId === component.id} onSelect={onSelect}/></g><Label component={component} x={548} y={py + 115} selected={selectedId === component.id} onSelect={onSelect}/></g>; })}
    {fields.length > 0 && <g transform={`translate(75 ${fieldTop})`}><text y="0" className="physical-path-label">REPORTED FIELDS</text>{fields.map((component, offset) => { const x = (offset % 4) * 165, fy = Math.floor(offset / 4) * 58; return <g key={component.id} onClick={() => onSelect(component.id)} className={`physical-field ${selectedId === component.id ? "is-active" : ""}`} role="button" tabIndex={0} aria-label={`Inspect ${component.label}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(component.id); } }}><rect x={x} y={fy + 12} width="154" height="42" rx="5"/><text x={x + 10} y={fy + 29}>{component.label}</text><text x={x + 10} y={fy + 46} className="physical-field-value">{reportedValue(component)}</text></g>; })}</g>}
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
  const viewport = useSvgViewport(WIDTH, height, `${twin.project.id}:${lanes.join(",")}`);
  return <div className="physical-view live-twin-canvas">
    <div className="twin2d-caption"><strong>Physical 2D</strong><span>{twin.sessionLabel} · illustration from configured hardware</span></div>
    <svg className="twin2d-svg physical-svg" viewBox={`${viewport.box.x} ${viewport.box.y} ${viewport.box.w} ${viewport.box.h}`} preserveAspectRatio="xMidYMid meet" aria-label={`${twin.sessionLabel} physical twin`} {...viewport.events}>
      <defs><pattern id="physical-grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0 H0 V34" fill="none" stroke="#283344" strokeWidth=".7"/></pattern></defs>
      <rect x="-2000" y="-2000" width="5000" height="5000" fill="#0e1520"/><rect width={WIDTH} height={height} fill="url(#physical-grid)"/>
      {positioned.map((item) => <DeviceAssembly key={item.id} twin={twin} deviceId={item.id} offsetY={item.y} selectedId={selectedId} onSelect={onSelect}/>)}
    </svg>
    <div className="twin-zoom-controls" role="group" aria-label="Physical view controls"><button onClick={() => viewport.zoomAt(.82)} aria-label="Zoom in"><Plus size={16}/></button><button onClick={() => viewport.zoomAt(1.22)} aria-label="Zoom out"><Minus size={16}/></button><button onClick={viewport.fit} aria-label="Fit view"><Focus size={16}/></button><button onClick={viewport.reset} aria-label="Reset view"><RotateCcw size={16}/></button></div>
    <div className="twin2d-hint">Drag to pan · Scroll or pinch to zoom · Select a part to inspect</div>
  </div>;
}
