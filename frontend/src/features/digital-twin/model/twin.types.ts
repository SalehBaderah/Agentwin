import type { Component, Event, State } from "../../../types";

export type TwinFreshness = "fresh" | "aging" | "stale" | "unavailable";
export type TwinEvidenceLevel = "configured" | "reported" | "verified";
export type TwinComponentType =
  | "controller"
  | "sensor"
  | "actuator"
  | "gateway"
  | "transport"
  | "processor"
  | "derived"
  | "generic";

export type TwinMetricState = {
  key: string;
  label: string;
  unit: string;
  value: number | boolean | string | null | undefined;
  precision: number;
  source: string;
  receivedAt?: number;
  ageMs?: number;
  freshness: TwinFreshness;
  isLastKnown: boolean;
};

export type TwinComponentState = {
  id: string;
  type: TwinComponentType;
  source: Component;
  label: string;
  deviceId?: string;
  pin?: string;
  transport?: string;
  visualKey: string;
  configured: {
    relationships: string[];
    values: Record<string, unknown>;
  };
  observed: {
    metrics: TwinMetricState[];
    receivedAt?: number;
    bootId?: string;
    sequence?: number;
  };
  health: {
    reporting: boolean;
    freshness: TwinFreshness;
    ageMs?: number;
    transportAvailable?: boolean;
  };
  evidence: {
    level: TwinEvidenceLevel;
    independentPhysicalVerification: boolean;
  };
  events: Event[];
  actions: State["actions"];
};

export type TwinEdgeState = {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: string;
  category: string;
  activity: TwinFreshness | "configured" | "command";
};

export type TwinLayoutNode = TwinComponentState & {
  x: number;
  y: number;
  width: number;
  height: number;
  lane: string;
};

export type TwinState = {
  source: State;
  project: { id: string; name: string; mode: string };
  devices: { id: string; connector: string; freshness: TwinFreshness; reporting: boolean }[];
  components: TwinComponentState[];
  edges: TwinEdgeState[];
  layout: TwinLayoutNode[];
  width: number;
  height: number;
  reportingDevices: number;
  openEvents: number;
  lastReceivedAt?: number;
  freshness: TwinFreshness;
  sessionLabel: "LIVE" | "SIMULATION" | "REPLAY" | "SESSION";
};
