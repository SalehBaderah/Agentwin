import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { TwinComponentState } from "../model/twin.types";

type VisualProps = { component: TwinComponentState; selected: boolean; onSelect: (id: string) => void; onboardLed?: TwinComponentState };
type Visual = (props: VisualProps) => ReactNode;

const clickable = (component: TwinComponentState, onSelect: (id: string) => void) => ({ role: "button", tabIndex: 0, "aria-label": `${component.label}, ${component.health.freshness}`, onClick: (event: MouseEvent<SVGGElement>) => { event.stopPropagation(); onSelect(component.id); }, onKeyDown: (event: KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect(component.id); } } });
const boardColor = "#176b70";

function BoardBase({ component, selected, onSelect, onboardLed, r4 }: VisualProps & { r4?: boolean }) {
  const ledMetric = onboardLed?.observed.metrics.find((metric) => typeof metric.value === "boolean");
  const ledFresh = ledMetric?.freshness === "fresh" || ledMetric?.freshness === "aging";
  const ledOn = ledFresh && ledMetric?.value === true;
  return <g>
    <g {...clickable(component, onSelect)} className="physical-part">
      <path d="M44 24 H402 Q416 24 416 38 V212 Q416 226 402 226 H42 Q28 226 28 212 V171 H16 V75 H28 V38 Q28 24 44 24Z" fill={boardColor} stroke={selected ? "#b99cff" : "#4ac2c2"} strokeWidth={selected ? 4 : 2}/>
      <path d="M44 24 H402 Q416 24 416 38 V212 Q416 226 402 226 H42 Q28 226 28 212 V171 H16 V75 H28 V38 Q28 24 44 24Z" fill="none" stroke="#70d0cb" strokeWidth=".8" opacity=".5" transform="translate(0 5) scale(1 .95)"/>
      {[ [51,44], [393,44], [51,205], [393,205] ].map(([x,y]) => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="7" fill="#103d45" stroke="#72bec0"/><circle cx={x} cy={y} r="3" fill="#0b1923"/></g>)}
      <rect x="106" y="15" width="238" height="20" rx="4" fill="#111d27" stroke="#647886"/>
      {Array.from({ length: 14 }, (_, index) => <rect key={index} x={115 + index * 16} y="21" width="9" height="8" rx="1" fill={index === 13 ? "#dbb875" : "#3b4c56"}/>)}
      <text x="113" y="10" className="board-micro">DIGITAL · 0–13</text>
      <rect x="120" y="214" width="156" height="20" rx="4" fill="#111d27" stroke="#647886"/>
      {Array.from({ length: 6 }, (_, index) => <rect key={index} x={128 + index * 24} y="219" width="13" height="8" rx="1" fill="#3b4c56"/>)}
      <text x="122" y="248" className="board-micro">ANALOG · A0–A5</text>
      <rect x="174" y="84" width="130" height="72" rx="5" fill="#18282f" stroke="#5ea2a5" strokeWidth="2"/>
      <rect x="191" y="97" width="96" height="45" rx="3" fill="#101820" stroke="#445b62"/>
      <text x="202" y="118" className="board-micro" fill="#98bac0">{r4 ? "RA4M1" : "ATMEGA328P"}</text>
      <text x="201" y="134" className="board-micro" fill="#628b93">CONTROLLER</text>
      <text x="326" y="128" className="board-logo">UNO</text>
      <text x="328" y="147" className="board-micro">{r4 ? "R4 WiFi" : "REV 3"}</text>
      <path d="M88 91 H169 M305 120 H350 M87 161 H176 M305 151 H368" stroke="#73c8b9" strokeWidth="2" opacity=".46" fill="none"/>
      <rect x="58" y="70" width="34" height="30" rx="3" fill="#173c43" stroke="#b9d2cd"/>
      <text x="59" y="64" className="board-micro">RESET</text>
      {r4 && <g><rect x="335" y="163" width="49" height="38" rx="4" fill="#b8c3c8" stroke="#e0e7e8"/><path d="M339 182 H380 M359 166 V198" stroke="#85979e" opacity=".5"/><text x="333" y="213" className="board-micro">Wi-Fi</text></g>}
      <text x="348" y="53" className="board-pin">D13</text>
      <path d="M329 68 L347 38" stroke="#f1d594" strokeWidth="2"/>
    </g>
    <g aria-label="USB connector" className="physical-decor"><rect x="0" y="105" width={r4 ? 35 : 45} height={r4 ? 30 : 43} rx="4" fill="#b4c4cb" stroke="#e2edf0" strokeWidth="2"/><rect x="6" y={r4 ? 111 : 112} width={r4 ? 25 : 31} height={r4 ? 18 : 29} rx="2" fill="#667981"/><rect x="12" y="119" width="19" height="7" fill="#263d47"/><text x="3" y="162" className="board-micro">{r4 ? "USB-C" : "USB"}</text></g>
    {!r4 && <g className="physical-decor"><rect x="15" y="169" width="51" height="37" rx="7" fill="#131b23" stroke="#526771"/><circle cx="42" cy="187" r="10" fill="#0a1118" stroke="#7b8a8e"/><text x="9" y="219" className="board-micro">POWER</text></g>}
    <g {...(onboardLed ? clickable(onboardLed, onSelect) : {})} className="physical-part" aria-label={onboardLed ? `${onboardLed.label}, ${ledMetric?.isLastKnown ? "last known" : "reported"} ${ledMetric?.value === true ? "on" : "off"}` : "Built-in status LED"}>
      {ledOn && <circle cx="330" cy="74" r="16" fill="#79e8a7" opacity=".17"/>}
      <rect x="319" y="65" width="22" height="17" rx="3" fill="#203338" stroke="#c7d5c0"/>
      <circle cx="330" cy="73" r="5" fill={ledOn ? "#8ceabb" : "#697b7a"}/>
      <text x="347" y="78" className="board-micro">L</text>
    </g>
  </g>;
}

export function ArduinoUnoVisual(props: VisualProps) { return <BoardBase {...props}/>; }
export function UnoR4Visual(props: VisualProps) { return <BoardBase {...props} r4/>; }

function GenericBoard({ component, selected, onSelect }: VisualProps) {
  return <g {...clickable(component, onSelect)} className="physical-part"><path d="M36 28 H398 Q416 28 416 46 V204 Q416 222 398 222 H36 Q18 222 18 204 V46 Q18 28 36 28Z" fill="#263744" stroke={selected ? "#b99cff" : "#6c8293"} strokeWidth="3"/>
    <rect x="130" y="72" width="174" height="110" rx="8" fill="#15232d" stroke="#8aa0ac"/><rect x="155" y="96" width="124" height="62" rx="4" fill="#0c1720"/><text x="176" y="131" className="board-logo">DEVICE</text>
    {Array.from({ length: 12 }, (_, index) => <rect key={index} x={39 + index * 29} y="31" width="16" height="11" rx="1" fill="#9bafae"/>)}<text x="32" y="250" className="board-micro">CONFIGURED CONTROLLER</text>
  </g>;
}

export function LedVisual({ component, selected, onSelect }: VisualProps) { const metric = component.observed.metrics.find((item) => typeof item.value === "boolean"); const active = metric?.value === true && (metric.freshness === "fresh" || metric.freshness === "aging"); return <g {...clickable(component, onSelect)} className="physical-part"><rect x="25" y="37" width="124" height="72" rx="9" fill="#253540" stroke={selected ? "#b99cff" : "#718995"} strokeWidth="2"/><circle cx="87" cy="73" r="26" fill={active ? "#41735d" : "#34444b"} stroke={active ? "#8ee6ad" : "#819397"} strokeWidth="3"/>{active && <circle cx="87" cy="73" r="38" fill="#8ee6ad" opacity=".12"/>}<circle cx="87" cy="73" r="12" fill={active ? "#91eab5" : "#819494"}/><path d="M63 110 V123 M111 110 V123" stroke="#b6c3bd" strokeWidth="4"/><text x="15" y="145" className="board-micro">{component.pin || "ACTUATOR"}</text></g>; }
export function SensorVisual({ component, selected, onSelect }: VisualProps) { return <g {...clickable(component, onSelect)} className="physical-part"><rect x="19" y="29" width="138" height="91" rx="7" fill="#1c656c" stroke={selected ? "#b99cff" : "#5ebac3"} strokeWidth="2"/><rect x="46" y="48" width="83" height="54" rx="5" fill="#b6c7c9" stroke="#e6f1ed"/><circle cx="87" cy="75" r="17" fill="#485f69" stroke="#e5dcb4" strokeWidth="3"/>{[37,59,81,103,125].map((x) => <rect key={x} x={x} y="116" width="11" height="15" fill="#cfb87c"/>)}<text x="13" y="148" className="board-micro">{component.pin || "SENSOR"}</text></g>; }
export function GatewayVisual({ component, selected, onSelect }: VisualProps) { return <g {...clickable(component, onSelect)} className="physical-part"><path d="M20 45 Q20 29 36 29 H138 Q154 29 154 45 V112 H20Z" fill="#263745" stroke={selected ? "#b99cff" : "#718796"} strokeWidth="2"/><rect x="33" y="47" width="108" height="49" rx="4" fill="#15212d"/>{[47,67,87,107].map((x) => <rect key={x} x={x} y="104" width="11" height="5" rx="1" fill="#658193"/>)}<circle cx="46" cy="59" r="4" fill={component.health.reporting ? "#65ccbd" : "#667581"}/><path d="M27 112 H147 L161 123 H13Z" fill="#445766"/><text x="38" y="82" className="board-micro">{component.transport?.toUpperCase() || "GATEWAY"}</text></g>; }
function ModuleVisual({ component, selected, onSelect }: VisualProps) { return <g {...clickable(component, onSelect)} className="physical-part"><rect x="18" y="28" width="140" height="98" rx="9" fill="#253644" stroke={selected ? "#b99cff" : "#768b9a"} strokeWidth="2"/><path d="M43 57 H132 M43 74 H132 M43 91 H104" stroke="#657e8d" strokeWidth="4" strokeLinecap="round"/><circle cx="125" cy="96" r="10" fill="#a18bc4" opacity=".55"/><text x="13" y="148" className="board-micro">{component.type.toUpperCase()}</text></g>; }

const specialized: Record<string, Visual> = { "arduino-uno": ArduinoUnoVisual, "uno-r4": UnoR4Visual, led: LedVisual, indicator_led: LedVisual, gateway: GatewayVisual, telemetry_gateway: GatewayVisual, sensor: SensorVisual, analog_input: SensorVisual };
const generic: Record<string, Visual> = { controller: GenericBoard, sensor: SensorVisual, actuator: ModuleVisual, gateway: GatewayVisual, transport: GatewayVisual, processor: ModuleVisual, derived: ModuleVisual, generic: ModuleVisual };

export function visualFor(component: TwinComponentState): Visual { return specialized[component.visualKey] || generic[component.type] || ModuleVisual; }
