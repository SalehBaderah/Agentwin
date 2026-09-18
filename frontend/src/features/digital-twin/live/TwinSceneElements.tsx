import { Arrow, Circle, Group, Line, Rect, Text } from "react-konva";
import type { TwinEdgeState, TwinLayoutNode } from "../model/twin.types";

export type TwinPalette = {
  canvas: string;
  grid: string;
  surface: string;
  elevated: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  physical: string;
  control: string;
  power: string;
};

const valueText = (node: TwinLayoutNode) => {
  const metric = node.observed.metrics[0];
  if (!metric || metric.value === undefined || metric.value === null) return "No bound live reading";
  const value = typeof metric.value === "number"
    ? metric.value.toLocaleString("en-US", { maximumFractionDigits: metric.precision })
    : typeof metric.value === "boolean" ? (metric.value ? "ON" : "OFF") : String(metric.value);
  return `${metric.isLastKnown ? "Last known  " : ""}${value}${metric.unit ? ` ${metric.unit}` : ""}`;
};

const ageText = (node: TwinLayoutNode) => {
  if (node.health.ageMs === undefined) return "Configured · data unavailable";
  const value = node.health.ageMs < 1000 ? `${Math.round(node.health.ageMs)} ms` : `${(node.health.ageMs / 1000).toFixed(1)} s`;
  return `${node.health.freshness[0].toUpperCase()}${node.health.freshness.slice(1)} · ${value}`;
};

function HardwareGlyph({ node, palette }: { node: TwinLayoutNode; palette: TwinPalette }) {
  if (node.type === "actuator") {
    const active = node.observed.metrics[0]?.value === true;
    return <><Circle x={27} y={30} radius={10} fill={active ? palette.warning : palette.elevated} stroke={palette.border}/><Line points={[27, 40, 27, 49]} stroke={palette.muted} strokeWidth={2}/></>;
  }
  if (node.type === "sensor") {
    return <Line points={[13, 34, 20, 34, 24, 22, 30, 44, 35, 28, 42, 28]} stroke={palette.accent} strokeWidth={2} lineCap="round" lineJoin="round"/>;
  }
  if (node.type === "controller") {
    return <><Rect x={13} y={19} width={31} height={29} cornerRadius={4} stroke={palette.accent}/><Rect x={20} y={25} width={17} height={16} cornerRadius={2} fill={palette.elevated}/>{[18, 25, 32, 39].map((x) => <Line key={x} points={[x, 15, x, 19]} stroke={palette.muted}/>)}</>;
  }
  if (node.type === "gateway" || node.type === "transport") {
    return <><Circle x={28} y={37} radius={3} fill={palette.accent}/><Line points={[17, 29, 28, 18, 39, 29]} stroke={palette.muted} strokeWidth={2} lineCap="round"/><Line points={[21, 33, 28, 26, 35, 33]} stroke={palette.accent} strokeWidth={2} lineCap="round"/></>;
  }
  return <><Rect x={14} y={20} width={29} height={28} cornerRadius={5} stroke={palette.muted}/><Circle x={28} y={34} radius={5} fill={palette.elevated} stroke={palette.accent}/></>;
}

export function TwinDevice({ node, selected, palette, onSelect, onMove }: { node: TwinLayoutNode; selected: boolean; palette: TwinPalette; onSelect: (id: string) => void; onMove: (id: string, position: { x: number; y: number }) => void }) {
  const statusColor = node.health.freshness === "fresh" ? palette.success : node.health.freshness === "aging" || node.health.freshness === "stale" ? palette.warning : palette.muted;
  return <Group x={node.x} y={node.y} draggable onDragStart={event => { event.cancelBubble = true; onSelect(node.id); }} onDragMove={event => { event.cancelBubble = true; onMove(node.id, event.target.position()); }} onDragEnd={event => { event.cancelBubble = true; onMove(node.id, event.target.position()); }} onMouseEnter={event => { const container = event.target.getStage()?.container(); if (container) container.style.cursor = 'grab'; }} onMouseLeave={event => { const container = event.target.getStage()?.container(); if (container) container.style.cursor = 'default'; }} onClick={() => onSelect(node.id)} onTap={() => onSelect(node.id)}>
    <Rect width={node.width} height={node.height} cornerRadius={12} fill={palette.surface} stroke={selected ? palette.accent : palette.border} strokeWidth={selected ? 2 : 1} shadowColor={selected ? palette.accent : "black"} shadowOpacity={selected ? .16 : .08} shadowBlur={selected ? 16 : 8}/>
    <Rect width={56} height={node.height} cornerRadius={[12, 0, 0, 12]} fill={palette.elevated}/>
    <HardwareGlyph node={node} palette={palette}/>
    <Text x={70} y={17} width={134} text={node.type === "processor" ? "Model / processor" : node.type[0].toUpperCase() + node.type.slice(1)} fontFamily="DM Sans" fontSize={10} fill={palette.muted}/>
    <Text x={70} y={35} width={134} height={36} text={node.label} fontFamily="Manrope" fontStyle="bold" fontSize={14} lineHeight={1.15} fill={palette.text} ellipsis/>
    <Text x={70} y={78} width={134} text={valueText(node)} fontFamily="DM Sans" fontStyle="bold" fontSize={13} fill={palette.text} ellipsis/>
    <Circle x={76} y={115} radius={3} fill={statusColor}/>
    <Text x={84} y={109} width={120} text={ageText(node)} fontFamily="DM Sans" fontSize={10} fill={palette.muted} ellipsis/>
    {node.pin && <Text x={13} y={111} width={42} align="center" text={node.pin} fontFamily="DM Sans" fontSize={10} fill={palette.muted}/>}
    {node.events.some((event) => !event.recovered) && <><Circle x={node.width - 13} y={13} radius={7} fill={palette.warning}/><Text x={node.width - 16} y={7} width={6} text="!" fontStyle="bold" fontSize={10} fill={palette.canvas}/></>}
  </Group>;
}

export function TwinConnection({ edge, source, target, palette, pulse }: { edge: TwinEdgeState; source: TwinLayoutNode; target: TwinLayoutNode; palette: TwinPalette; pulse: number }) {
  const forward = target.x + target.width / 2 >= source.x + source.width / 2;
  const startX = forward ? source.x + source.width : source.x;
  const startY = source.y + source.height / 2;
  const endX = forward ? target.x : target.x + target.width;
  const endY = target.y + target.height / 2;
  const color = edge.category === "physical" ? palette.physical : edge.category === "control" ? palette.control : edge.category === "power" ? palette.power : palette.accent;
  const dash = edge.activity === "stale" ? [5, 8] : edge.category === "context" ? [8, 7] : edge.category === "control" ? [3, 4] : undefined;
  const isActive = edge.activity === "fresh" || edge.activity === "aging" || edge.activity === "command";
  const px = startX + (endX - startX) * pulse;
  const py = startY + (endY - startY) * pulse;
  return <Group listening={false}>
    <Arrow points={[startX, startY, endX, endY]} stroke={color} fill={color} strokeWidth={2.5} opacity={1} dash={dash} pointerLength={10} pointerWidth={9}/>
    <Circle x={startX} y={startY} radius={4} fill={palette.surface} stroke={color} strokeWidth={2}/>
    <Rect x={(startX + endX) / 2 - 70} y={(startY + endY) / 2 - 32} width={140} height={24} cornerRadius={5} fill={palette.surface} stroke={color}/>
    <Text x={(startX + endX) / 2 - 66} y={(startY + endY) / 2 - 26} width={132} align="center" text={`${edge.label}${source.pin ? ` · ${source.pin}` : ''}`} fontFamily="DM Sans" fontSize={11} fill={palette.text} ellipsis/>
    {isActive && <Circle x={px} y={py} radius={3.5} fill={edge.activity === "command" ? palette.warning : palette.accent}/>} 
  </Group>;
}
