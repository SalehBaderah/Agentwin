import type { TwinComponentState, TwinState } from "../model/twin.types";
import type { Anchor, BoardProfile } from "./profiles";
export type AssemblyNode = {
  component: TwinComponentState;
  x: number;
  y: number;
  board: boolean;
};
export type AssemblyWire = {
  id: string;
  source: string;
  target: string;
  category: string;
  label: string;
  inferred: boolean;
  reason: string;
  from: Anchor;
  to: Anchor;
  precise: boolean;
};
export function assemblyModel(
  twin: TwinState,
  components: TwinComponentState[],
  profile: BoardProfile,
  showInferred: boolean,
) {
  const controller = components.find((c) => c.type === "controller");
  const modules = components.filter((c) => c !== controller);
  const height = Math.max(400, modules.length * 125 + 100);
  const nodes: AssemblyNode[] = [
    ...(controller
      ? [
          {
            component: controller,
            x: 48,
            y: Math.max(80, height / 2 - 110),
            board: true,
          },
        ]
      : []),
    ...modules.map((component, i) => ({
      component,
      x: 510,
      y: 65 + i * 125,
      board: false,
    })),
  ];
  const byId = new Map(nodes.map((n) => [n.component.id, n]));
  const endpoint = (
    id: string,
    other: string,
  ): { anchor: Anchor; precise: boolean } => {
    const n = byId.get(id)!;
    const peer = byId.get(other)!;
    const pin = peer.component.pin?.toUpperCase();
    const at = n.board && pin ? profile.pins[pin] : undefined;
    return {
      anchor: at
        ? { x: n.x + at.x, y: n.y + at.y }
        : {
            x: n.x + (n.board ? profile.width : 0),
            y: n.y + (n.board ? profile.height / 2 : 37),
          },
      precise: !!at,
    };
  };
  const edges = twin.edges.filter(
    (e) => byId.has(e.source) && byId.has(e.target),
  );
  const inputs = edges.map((e) => ({
    ...e,
    inferred: false,
    reason: "Declared in project configuration",
  }));
  if (showInferred && controller?.deviceId)
    modules
      .filter(
        (c) =>
          c.deviceId === controller.deviceId &&
          !edges.some((e) => e.source === c.id || e.target === c.id),
      )
      .forEach((c) =>
        inputs.push({
          id: "inferred:" + c.id,
          source: controller.id,
          target: c.id,
          category: "context",
          label: "Same-device association",
          kind: "context",
          activity: "configured",
          inferred: true,
          reason:
            "Both components are assigned to the same device; no relationship is configured.",
        }),
      );
  const wires: AssemblyWire[] = inputs.map((e) => {
    const a = endpoint(e.source, e.target),
      b = endpoint(e.target, e.source);
    if (e.inferred) {
      const source = byId.get(e.source)!,
        target = byId.get(e.target)!;
      return {
        ...e,
        from: { x: source.x + profile.width, y: source.y + profile.height / 2 },
        to: { x: target.x, y: target.y + 37 },
        precise: false,
      };
    }
    return {
      ...e,
      from: a.anchor,
      to: b.anchor,
      precise: a.precise || b.precise,
    };
  });
  // Reserve space beside modules for readable, unscaled HTML labels.
  return { nodes, wires, width: 900, height };
}
