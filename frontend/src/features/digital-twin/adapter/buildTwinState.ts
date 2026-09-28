import type { Component, Reading, State } from "../../../types";
import type {
  TwinComponentState,
  TwinComponentType,
  TwinFreshness,
  TwinLayoutNode,
  TwinState,
} from "../model/twin.types";

const WIDTH = 218;
const HEIGHT = 138;

function componentType(component: Component): TwinComponentType {
  const value = `${component.category} ${component.type}`.toLowerCase();
  if (value.includes("controller") || value.includes("arduino")) return "controller";
  if (value.includes("actuator") || value.includes("led") || value.includes("relay")) return "actuator";
  if (value.includes("sensor") || value.includes("analog") || value.includes("detector")) return "sensor";
  if (value.includes("gateway")) return "gateway";
  if (value.includes("transport") || value.includes("mqtt") || value.includes("usb")) return "transport";
  if (value.includes("processor") || value.includes("model") || value.includes("mlp")) return "processor";
  if (value.includes("derived")) return "derived";
  return "generic";
}

function freshness(ageMs: number | undefined, limitSeconds: number): TwinFreshness {
  if (ageMs === undefined) return "unavailable";
  if (ageMs <= limitSeconds * 650) return "fresh";
  if (ageMs <= limitSeconds * 1000) return "aging";
  return "stale";
}

function readingFor(readings: Reading[], field: string, deviceId?: string | null) {
  for (let index = readings.length - 1; index >= 0; index -= 1) {
    if ((!deviceId || readings[index].device === deviceId) && Object.hasOwn(readings[index].readings, field) && readings[index].readings[field] !== null) return readings[index];
  }
  return undefined;
}

function worstFreshness(values: TwinFreshness[]): TwinFreshness {
  if (!values.length || values.every((value) => value === "unavailable")) return "unavailable";
  if (values.some((value) => value === "unavailable")) return "unavailable";
  if (values.some((value) => value === "stale")) return "stale";
  if (values.some((value) => value === "aging")) return "aging";
  return "fresh";
}

function layout(components: TwinComponentState[], deviceIds: string[]): { nodes: TwinLayoutNode[]; width: number; height: number } {
  const lanes = deviceIds.length ? deviceIds : ["Configured system"];
  const grouped = new Map(lanes.map((id) => [id, [] as TwinComponentState[]]));
  const unassigned: TwinComponentState[] = [];
  components.forEach((component) => {
    const target = component.deviceId && grouped.get(component.deviceId);
    (target || unassigned).push(component);
  });
  if (unassigned.length) grouped.set("System", unassigned);

  const rank: Record<TwinComponentType, number> = {
    sensor: 0,
    actuator: 0,
    generic: 0,
    controller: 1,
    processor: 2,
    derived: 2,
    gateway: 3,
    transport: 3,
  };
  const nodes: TwinLayoutNode[] = [];
  let laneY = 70;
  grouped.forEach((items, lane) => {
    const columns = new Map<number, TwinComponentState[]>();
    items.forEach((item) => {
      const column = rank[item.type];
      columns.set(column, [...(columns.get(column) || []), item]);
    });
    const orderedColumns = [...columns.keys()].sort((left, right) => left - right);
    const laneHeight = Math.max(240, ...[...columns.values()].map((itemsInColumn) => itemsInColumn.length * 158 + 42));
    columns.forEach((itemsInColumn, column) => {
      const displayColumn = orderedColumns.indexOf(column);
      itemsInColumn.forEach((item, row) => {
        nodes.push({ ...item, x: 56 + displayColumn * 390, y: laneY + 40 + row * 158, width: WIDTH, height: HEIGHT, lane });
      });
    });
    laneY += laneHeight + 28;
  });
  const width = Math.max(640, ...nodes.map((node) => node.x + node.width + 56));
  return { nodes, width, height: Math.max(420, laneY + 24) };
}

export function buildTwinState(state: State, nowMs: number): TwinState {
  const readings = [...state.readings, ...(state.latest ? [state.latest] : [])].sort((a, b) => a.received - b.received);
  const deviceFreshness = (id: string) => {
    const reading = readings.filter((item) => item.device === id).at(-1);
    return freshness(reading ? Math.max(0, nowMs - reading.received * 1000) : undefined, state.project.freshness_seconds);
  };
  const fields = Object.entries(state.project.graph.fields);
  const components: TwinComponentState[] = state.project.graph.components.map((component) => {
    const role = componentType(component);
    const componentFields = fields.filter(([, metric]) => metric.component_id === component.id);
    const metrics = componentFields
      .filter(([key]) => !key.includes("command_id"))
      .map(([key, metric]) => {
        const reading = readingFor(readings, key, metric.device_id);
        const ageMs = reading ? Math.max(0, nowMs - reading.received * 1000) : undefined;
        const metricFreshness = freshness(ageMs, metric.freshness_seconds || state.project.freshness_seconds);
        return {
          key,
          label: metric.label,
          unit: metric.unit,
          value: reading?.readings[key],
          precision: metric.precision,
          source: metric.source,
          receivedAt: reading?.received,
          ageMs,
          freshness: metricFreshness,
          isLastKnown: Boolean(reading && (metricFreshness === "stale" || metricFreshness === "unavailable")),
        };
      });
    const latestMetric = metrics.reduce<(typeof metrics)[number] | undefined>((latest, metric) =>
      !latest || (metric.receivedAt || 0) > (latest.receivedAt || 0) ? metric : latest, undefined);
    const deviceId = String(component.configuration.device_id || componentFields[0]?.[1].device_id || "") || undefined;
    const deviceReading = deviceId ? readings.filter((item) => item.device === deviceId).at(-1) : undefined;
    const reportsDevice = role === "controller" || role === "gateway" || role === "transport";
    const relatedEvents = state.events.filter((event) =>
      event.evidence.field_key ? componentFields.some(([key]) => key === event.evidence.field_key) : event.evidence.device_id ? componentFields.some(([, metric]) => metric.device_id === event.evidence.device_id) : event.evidence.readings.some((reading) => componentFields.some(([key]) => Object.hasOwn(reading.readings, key))),
    );
    const componentFreshness = metrics.length ? worstFreshness(metrics.map((metric) => metric.freshness)) : reportsDevice && deviceId ? deviceFreshness(deviceId) : "unavailable";
    const reported = metrics.some((metric) => metric.receivedAt !== undefined) || Boolean(reportsDevice && deviceReading);
    const device = state.project.devices.find((item) => item.id === deviceId);
    const declaredVisual = component.visual?.model || component.configuration.board || component.configuration.model;
    const visualKey = String(declaredVisual || component.type).toLowerCase();
    return {
      id: component.id,
      type: role,
      source: component,
      label: component.name || component.label,
      deviceId,
      transport: device?.connector || (typeof component.configuration.connector === "string" ? component.configuration.connector : undefined),
      visualKey,
      pin: typeof component.configuration.pin === "string" ? component.configuration.pin : undefined,
      configured: {
        relationships: state.project.graph.edges.filter((edge) => edge.source === component.id || edge.target === component.id).map((edge) => edge.id),
        values: component.configuration,
      },
      observed: {
        metrics,
        receivedAt: latestMetric?.receivedAt || (reportsDevice ? deviceReading?.received : undefined),
        bootId: latestMetric ? readingFor(readings, latestMetric.key, deviceId)?.boot : reportsDevice ? deviceReading?.boot : undefined,
        sequence: latestMetric ? readingFor(readings, latestMetric.key, deviceId)?.seq : reportsDevice ? deviceReading?.seq : undefined,
      },
      health: {
        reporting: componentFreshness === "fresh" || componentFreshness === "aging",
        freshness: componentFreshness,
        ageMs: latestMetric?.ageMs ?? (reportsDevice && deviceReading ? Math.max(0, nowMs - deviceReading.received * 1000) : undefined),
        transportAvailable: role === "gateway" || role === "transport" ? state.devices.find((item) => item.id === deviceId)?.online : undefined,
      },
      evidence: {
        level: reported ? "reported" : "configured",
        independentPhysicalVerification: false,
      },
      events: relatedEvents,
      actions: state.actions.filter((action) => action.target === component.id),
    };
  });

  const byId = new Map(components.map((component) => [component.id, component]));
  const edges = state.project.graph.edges.map((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const pending = source?.actions.some((action) => action.status === "requested") || target?.actions.some((action) => action.status === "requested");
    const edgeFreshness = worstFreshness([source?.health.freshness || "unavailable", target?.health.freshness || "unavailable"]);
    const recentData = edge.category === "data" && source?.health.freshness === "fresh" && target?.health.freshness === "fresh";
    return {
      ...edge,
      activity: pending && edge.category === "control" ? "command" as const
        : edge.category === "data" ? recentData ? "fresh" as const : edgeFreshness
        : "configured" as const,
    };
  });
  const latest = readings.at(-1);
  const latestAge = latest ? Math.max(0, nowMs - latest.received * 1000) : undefined;
  const sceneFreshness = freshness(latestAge, state.project.freshness_seconds);
  const positioned = layout(components, state.project.devices.map((device) => device.id));
  const mode = state.session.mode.toLowerCase();
  return {
    source: state,
    project: { id: state.project.id, name: state.project.name, mode: state.session.mode },
    devices: state.project.devices.map((device) => ({ id: device.id, connector: device.connector, freshness: deviceFreshness(device.id), reporting: ["fresh", "aging"].includes(deviceFreshness(device.id)) })),
    components,
    edges,
    layout: positioned.nodes,
    width: positioned.width,
    height: positioned.height,
    reportingDevices: state.devices.filter((device) => ["fresh", "aging"].includes(deviceFreshness(device.id))).length,
    openEvents: state.events.filter((event) => !event.recovered).length,
    lastReceivedAt: latest?.received,
    freshness: sceneFreshness,
    sessionLabel: mode === "live" ? "LIVE" : mode.includes("sim") ? "SIMULATION" : mode.includes("replay") ? "REPLAY" : "SESSION",
  };
}
