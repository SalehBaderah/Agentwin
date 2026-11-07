// Isolated browser fixture. Never submits telemetry or commands to the backend.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  BoardArtwork,
  ModuleArtwork,
} from "../src/features/digital-twin/physical/Artwork";
import { PhysicalWorkspace } from "../src/features/digital-twin/physical/PhysicalWorkspace";
import { buildTwinState } from "../src/features/digital-twin/adapter/buildTwinState";
import type { State } from "../src/types";
import "../src/index.css";
const counts = { board: 0, module: 0 };
for (const [component, key] of [
  [BoardArtwork, "board"],
  [ModuleArtwork, "module"],
] as const) {
  const target = component as unknown as {
    type: (props: never) => React.ReactNode;
  };
  const original = target.type;
  target.type = (props) => {
    counts[key]++;
    return original(props);
  };
}
Object.assign(window, { artworkRenderCounts: counts });
const states: State[] = await (await fetch("/api/projects")).json();
const base = structuredClone(
  states.find((s) =>
    Object.values(s.project.graph.fields).some(
      (f) => f.data_type === "boolean",
    ),
  )!,
);
const field = Object.entries(base.project.graph.fields).find(
  ([, f]) => f.data_type === "boolean",
)!;
const device = field[1].device_id!;
base.project.devices.push({ id: "fixture-b", connector: "mqtt" });
base.devices.push({
  id: "fixture-b",
  connector: "mqtt",
  online: false,
  reporting: false,
});
const board =
  base.project.graph.components.find(
    (c) => c.category === "controller" || c.type.includes("arduino"),
  ) || base.project.graph.components[0];
base.project.graph.components.push({
  ...board,
  id: "fixture-board-b",
  name: "Fixture B",
  category: "controller",
  type: "controller",
  configuration: { device_id: "fixture-b" },
  controls: [],
});
base.project.graph.components.push({
  ...board,
  id: "fixture-orphan",
  name: "Unassigned fixture",
  category: "generic",
  type: "generic",
  configuration: {},
  controls: [],
});
function Fixture() {
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState("reported");
  const state = structuredClone(base);
  const now = Date.now() / 1000;
  state.readings = [
    {
      ...base.readings[0],
      device,
      received: now,
      readings: { [field[0]]: step % 2 === 1 },
      seq: step,
    },
  ];
  state.latest = state.readings[0];
  if (scenario === "empty") {
    state.readings = [];
    state.latest = null;
    state.session = { ...state.session, id: "empty-fixture-session" };
    state.actions = [];
  }
  if (scenario === "pending") {
    state.actions = [
      {
        id: "fixture-request",
        created: now,
        target: field[1].component_id,
        action: "set",
        status: "requested",
      },
    ];
  }
  const twin = buildTwinState(state, (now + (step === 2 ? 100000 : 0)) * 1000);
  const [selected, setSelected] = useState(field[1].component_id!);
  return (
    <BrowserRouter>
      <button onClick={() => setStep(step + 1)}>
        Advance fixture telemetry
      </button>
      <button onClick={() => setScenario("empty")}>
        Empty session fixture
      </button>
      <button onClick={() => setScenario("pending")}>
        Pending command fixture
      </button>
      <output data-testid="step">{step}</output>
      <PhysicalWorkspace
        twin={twin}
        selectedId={selected}
        onSelect={setSelected}
        onInspect={() => {}}
        refresh={() => {}}
      />
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
