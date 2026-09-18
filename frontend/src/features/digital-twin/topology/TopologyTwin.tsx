import { useEffect, useMemo } from "react";
import { Background, Controls, MarkerType, MiniMap, Position, ReactFlow, useNodesState, type Edge, type Node } from "@xyflow/react";
import type { TwinComponentState, TwinState } from "../model/twin.types";

const relationshipColor: Record<string, string> = {
  physical: "var(--relationship-physical)",
  control: "var(--relationship-control)",
  data: "var(--accent)",
  power: "var(--relationship-power)",
  context: "var(--success)",
};

function displayMetric(component: TwinComponentState) {
  const metric = component.observed.metrics[0];
  if (!metric || metric.value === null || metric.value === undefined) return "No live measurements";
  const value = typeof metric.value === "number" ? metric.value.toLocaleString("en-US", { maximumFractionDigits: metric.precision }) : typeof metric.value === "boolean" ? (metric.value ? "On" : "Off") : String(metric.value);
  return `${metric.isLastKnown ? "Last known · " : ""}${value}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function TopologyNode({ component, selected }: { component: TwinComponentState; selected: boolean }) {
  return <div className={`twin-node ${selected ? "is-selected" : ""}`} style={{ "--node-accent": relationshipColor.data } as React.CSSProperties}>
    <div className="twin-node-heading"><span>{component.type}</span><em>{component.source.group}</em></div>
    <strong>{component.label}</strong>
    <div className="twin-node-values"><span><b>{displayMetric(component)}</b></span></div>
    <small className={`node-state ${component.health.freshness}`}>{component.observed.metrics.length ? component.health.freshness : "Configured"}</small>
  </div>;
}

export function TopologyTwin({ twin, selectedId, onSelect }: { twin: TwinState; selectedId: string; onSelect: (id: string) => void }) {
  const initialNodes = useMemo<Node[]>(() => twin.layout.map((component) => ({
    id: component.id,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    position: { x: component.x, y: component.y },
    data: { label: <TopologyNode component={component} selected={component.id === selectedId}/> },
    style: { padding: 0, border: 0, background: "transparent", width: 220 },
  })), [twin.source.project.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  useEffect(() => {
    setNodes((current) => twin.layout.map((component) => {
      const node = current.find((item) => item.id === component.id);
      return { ...node, id: component.id, sourcePosition: Position.Right, targetPosition: Position.Left, position: node?.position || { x: component.x, y: component.y }, style: { padding: 0, border: 0, background: "transparent", width: 220 }, data: { label: <TopologyNode component={component} selected={component.id === selectedId}/> } };
    }));
  }, [selectedId, setNodes, twin.layout]);
  const edges = useMemo<Edge[]>(() => twin.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: relationshipColor[edge.category] || "var(--success)" },
    style: { stroke: relationshipColor[edge.category] || "var(--success)", strokeWidth: 2.5 },
    labelStyle: { fill: "var(--text-secondary)", fontSize: 11 },
    labelBgPadding: [10, 6] as [number, number],
    labelBgStyle: { fill: "var(--surface)", fillOpacity: 1 },
  })), [twin.edges]);
  return <div className="topology-view">
    <div className="topology-note">Configured architecture · layout changes affect this view only.</div>
    <div className="twin twin-canvas" aria-label="Configured system topology">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onNodeClick={(_, node) => onSelect(node.id)} nodesDraggable nodesConnectable={false} elementsSelectable fitView fitViewOptions={{ padding: .2 }} minZoom={.4} maxZoom={1.8} proOptions={{ hideAttribution: true }}>
        <Background color="var(--border-strong)" gap={24} size={1}/><MiniMap pannable zoomable nodeColor="var(--accent)" maskColor="var(--minimap-mask)"/><Controls showInteractive={false}/>
      </ReactFlow>
    </div>
  </div>;
}
