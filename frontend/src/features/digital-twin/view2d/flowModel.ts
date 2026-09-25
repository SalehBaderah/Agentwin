import type { TwinComponentState, TwinFreshness, TwinState } from "../model/twin.types";

export type FlowNode = { id: string; label: string; subtitle: string; role: string; componentId?: string; freshness: TwinFreshness; x: number; y: number };
export type FlowLink = { id: string; from: string; to: string; freshness: TwinFreshness; label: string };
export type FlowModel = { nodes: FlowNode[]; links: FlowLink[]; width: number; height: number };

const summary = (component: TwinComponentState) => {
  const metric = component.observed.metrics[0];
  if (!metric || metric.value === null || metric.value === undefined) return component.pin || (["controller", "gateway", "transport"].includes(component.type) ? component.transport?.toUpperCase() || component.type : "No report");
  const value = typeof metric.value === "boolean" ? metric.value ? "Reported ON" : "Reported OFF" : typeof metric.value === "number" ? `${metric.value.toLocaleString("en-US", { maximumFractionDigits: metric.precision })} ${metric.unit}`.trim() : String(metric.value);
  return metric.isLastKnown ? `Last known ${value}` : value;
};

export function buildFlowModel(twin: TwinState): FlowModel {
  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];
  const relation = (a: string, b: string) => twin.edges.find((edge) => edge.source === a && edge.target === b || edge.source === b && edge.target === a);
  const lanes = twin.devices.length ? twin.devices : [{ id: "System", connector: "configured", freshness: "unavailable" as TwinFreshness, reporting: false }];
  let laneTop = 110;
  const add = (component: TwinComponentState, x: number, y: number, role: string = component.type) => nodes.push({ id: component.id, componentId: component.id, label: component.label, subtitle: summary(component), role, freshness: component.health.freshness, x, y });
  for (const device of lanes) {
    const items = twin.components.filter((component) => component.deviceId === device.id || (device.id === "System" && !component.deviceId));
    const controller = items.find((component) => component.type === "controller");
    const gateway = items.find((component) => component.type === "gateway" || component.type === "transport");
    const inputs = items.filter((component) => component !== controller && component !== gateway && ["sensor", "actuator"].includes(component.type));
    const fields = items.filter((component) => component !== controller && component !== gateway && !inputs.includes(component));
    const rows = Math.max(2, inputs.length, fields.length);
    const laneHeight = rows * 92 + 65;
    const middle = laneTop + laneHeight / 2 - 20;
    if (controller) add(controller, 305, middle, "controller");
    if (gateway) add(gateway, 715, middle, "gateway");
    inputs.forEach((component, index) => {
      const y = laneTop + (index + 1) * laneHeight / (inputs.length + 1);
      add(component, 105, y);
      if (controller) links.push({ id: `${component.id}:controller`, from: component.id, to: controller.id, freshness: component.health.freshness, label: relation(component.id, controller.id)?.label || "same device" });
    });
    fields.forEach((component, index) => {
      const y = laneTop + (index + 1) * laneHeight / (fields.length + 1);
      add(component, 510, y, component.observed.metrics.length ? "telemetry field" : component.type);
      if (controller) links.push({ id: `${controller.id}:${component.id}`, from: controller.id, to: component.id, freshness: component.health.freshness, label: "reported field" });
      if (gateway) links.push({ id: `${component.id}:${gateway.id}`, from: component.id, to: gateway.id, freshness: component.health.freshness, label: "telemetry route" });
    });
    if (controller && gateway && !fields.length) links.push({ id: `${controller.id}:${gateway.id}`, from: controller.id, to: gateway.id, freshness: device.freshness, label: relation(controller.id, gateway.id)?.label || "configured transport" });
    if (gateway) links.push({ id: `${gateway.id}:backend`, from: gateway.id, to: "agentwin-backend", freshness: device.freshness, label: "ingest" });
    laneTop += laneHeight + 72;
  }
  const height = Math.max(500, laneTop + 80);
  nodes.push({ id: "agentwin-backend", label: "Agentwin", subtitle: "Ingestion and validation", role: "service", freshness: twin.freshness, x: 900, y: height / 2 });
  nodes.push({ id: "agentwin-observations", label: "Operations", subtitle: "Telemetry · events · twin", role: "service", freshness: twin.freshness, x: 1080, y: height / 2 });
  links.push({ id: "backend:observations", from: "agentwin-backend", to: "agentwin-observations", freshness: twin.freshness, label: "session observations" });
  return { nodes, links, width: 1180, height };
}
