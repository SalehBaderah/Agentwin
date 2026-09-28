import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Cable,
  Focus,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/OptionSelect";
import { ReadingCard } from "@/features/workspace/Readings";
import { ControlsPanel } from "@/features/workspace/ControlsPanel";
import { metricValue } from "@/lib/format";
import type { TwinComponentState, TwinState } from "../model/twin.types";
import { useSvgViewport } from "../view2d/useSvgViewport";
import { BoardArtwork, ModuleArtwork } from "./Artwork";
import { assemblyModel } from "./assemblyModel";
import {
  boardProfiles,
  profilePreferenceKey,
  readProfilePreference,
  resolveProfile,
  type BoardProfile,
} from "./profiles";
import "./physical.css";

function evidenceLabel(component: TwinComponentState) {
  return component.evidence.level === "configured"
    ? "Configured only"
    : component.health.reporting
      ? "Reported state"
      : "Last known state";
}
const categoryColor: Record<string, string> = {
  physical: "var(--relationship-physical)",
  power: "var(--relationship-power)",
  control: "var(--relationship-control)",
  data: "var(--operational-cyan)",
  context: "var(--text-muted)",
};

function Assembly({
  twin,
  components,
  profile,
  selectedId,
  onSelect,
  showInferred,
  deviceId,
}: {
  twin: TwinState;
  components: TwinComponentState[];
  profile: BoardProfile;
  selectedId: string;
  onSelect: (id: string) => void;
  showInferred: boolean;
  deviceId: string;
}) {
  const model = assemblyModel(twin, components, profile, showInferred);
  const viewport = useSvgViewport(
    model.width,
    model.height,
    `physical-v2:${twin.project.id}:${deviceId}:${profile.id}:${components.map((c) => c.id).join(",")}`,
  );
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 700, height: 480 });
  const [wireDetail, setWireDetail] = useState("");
  const gridId = useId().replaceAll(":", "");
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = element.getBoundingClientRect();
      if (event.deltaY)
        viewport.zoomAt(
          event.deltaY > 0 ? 1.12 : 0.89,
          (event.clientX - rect.left) / rect.width,
          (event.clientY - rect.top) / rect.height,
        );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [viewport.zoomAt]);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const handler = (event: Event) => {
      const node = model.nodes.find(
        (n) => n.component.id === (event as CustomEvent<string>).detail,
      );
      if (node)
        viewport.focus(
          node.x + (node.board ? 160 : 53),
          node.y + (node.board ? 110 : 37),
        );
    };
    window.addEventListener("agentwin-focus-component", handler);
    return () =>
      window.removeEventListener("agentwin-focus-component", handler);
  });
  const scale = Math.min(
    size.width / viewport.box.w,
    size.height / viewport.box.h,
  );
  const position = (x: number, y: number) => ({
    left:
      (size.width - viewport.box.w * scale) / 2 + (x - viewport.box.x) * scale,
    top:
      (size.height - viewport.box.h * scale) / 2 + (y - viewport.box.y) * scale,
  });
  return (
    <div className="hardware-assembly">
      <div className="assembly-heading">
        <span>Hardware assembly</span>
        <span>{components.length} components</span>
      </div>
      <div ref={host} className="assembly-canvas">
        <svg
          className="physical-svg twin2d-svg"
          aria-label="Physical hardware assembly"
          viewBox={`${viewport.box.x} ${viewport.box.y} ${viewport.box.w} ${viewport.box.h}`}
          {...viewport.events}
        >
          <defs>
            <pattern
              id={gridId}
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx="1"
                cy="1"
                r=".7"
                fill="var(--border-strong)"
                opacity=".3"
              />
            </pattern>
          </defs>
          <rect
            x="-4000"
            y="-4000"
            width="10000"
            height="10000"
            fill="var(--background)"
          />
          <rect
            x="-4000"
            y="-4000"
            width="10000"
            height="10000"
            fill={`url(#${gridId})`}
          />
          <g className="assembly-wiring">
            {model.wires.map((wire, i) => {
              const selected =
                wire.source === selectedId || wire.target === selectedId;
              const middle = 400 + (i % 5) * 12;
              const description = `${wire.label}. ${wire.reason} ${wire.precise ? "Configured pin anchor." : "Schematic endpoints; exact pin not configured."}`;
              return (
                <g
                  key={wire.id}
                  data-provenance={wire.inferred ? "inferred" : "configured"}
                  tabIndex={0}
                  role="img"
                  aria-label={description}
                  onFocus={() => setWireDetail(description)}
                  onBlur={() => setWireDetail("")}
                  onMouseEnter={() => setWireDetail(description)}
                  onMouseLeave={() => setWireDetail("")}
                >
                  <title>{description}</title>
                  <path
                    d={`M${wire.from.x} ${wire.from.y} H${middle} V${wire.to.y} H${wire.to.x}`}
                    fill="none"
                    stroke={
                      categoryColor[wire.category] || categoryColor.context
                    }
                    strokeWidth={selected ? 3 : 1.5}
                    strokeDasharray={wire.inferred ? "6 5" : undefined}
                    opacity={selected ? 1 : 0.55}
                    strokeLinejoin="round"
                  />
                  <circle
                    cx={wire.from.x}
                    cy={wire.from.y}
                    r="3"
                    fill={categoryColor[wire.category] || categoryColor.context}
                  />
                  <circle
                    cx={wire.to.x}
                    cy={wire.to.y}
                    r="3"
                    fill={categoryColor[wire.category] || categoryColor.context}
                  />
                </g>
              );
            })}
          </g>
          {model.nodes.map((node) => (
            <g
              key={node.component.id}
              transform={`translate(${node.x} ${node.y})`}
            >
              {node.board ? (
                <BoardArtwork profileId={profile.id} />
              ) : (
                <ModuleArtwork kind={node.component.type} />
              )}
              <g data-live-overlay={node.component.id}>
                {node.component.type === "actuator" && (
                  <circle
                    cx="53"
                    cy="34"
                    r="11"
                    fill={
                      node.component.health.reporting &&
                      node.component.observed.metrics.some(
                        (m) => m.value === true && !m.isLastKnown,
                      )
                        ? "var(--operational-cyan)"
                        : "var(--text-muted)"
                    }
                    opacity={node.component.health.reporting ? 1 : 0.45}
                  />
                )}
                <rect
                  x="-5"
                  y="-5"
                  width={node.board ? profile.width + 10 : 116}
                  height={node.board ? profile.height + 10 : 90}
                  rx="13"
                  fill="transparent"
                  stroke={
                    selectedId === node.component.id
                      ? "var(--accent-text)"
                      : "transparent"
                  }
                  strokeWidth="2"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${node.component.label}`}
                  onClick={() => onSelect(node.component.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(node.component.id);
                    }
                  }}
                />
              </g>
            </g>
          ))}
        </svg>
        <div className="assembly-labels">
          {model.nodes.map((node) => (
            <button
              key={node.component.id}
              className={`assembly-label ${selectedId === node.component.id ? "is-selected" : ""}`}
              style={position(
                node.x + (node.board ? 0 : 120),
                node.y + (node.board ? profile.height + 14 : 8),
              )}
              onClick={() => onSelect(node.component.id)}
              title={node.component.label}
            >
              <strong>{node.component.label}</strong>
              <span>
                {node.component.pin ? node.component.pin + " · " : ""}
                {evidenceLabel(node.component)}
              </span>
            </button>
          ))}
        </div>
        <div
          className="assembly-tools"
          role="group"
          aria-label="Physical view controls"
        >
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom in"
            onClick={() => viewport.zoomAt(0.82)}
          >
            <Plus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Zoom out"
            onClick={() => viewport.zoomAt(1.22)}
          >
            <Minus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Fit view"
            onClick={viewport.fit}
          >
            <Focus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Reset view"
            onClick={viewport.reset}
          >
            <RotateCcw />
          </Button>
        </div>
      </div>
      <div className="assembly-mobile-labels">
        {model.nodes.map(({ component }) => (
          <button
            key={component.id}
            aria-pressed={selectedId === component.id}
            onClick={() => onSelect(component.id)}
          >
            <strong>{component.label}</strong>
            <span>
              {component.pin ? component.pin + " · " : ""}
              {evidenceLabel(component)}
            </span>
          </button>
        ))}
      </div>
      <div className="assembly-legend">
        {[...new Set(model.wires.map((w) => w.category))].map((category) => (
          <span key={category}>
            <i
              style={{
                background: categoryColor[category] || categoryColor.context,
              }}
            />
            {category === "physical" ? "Signal / physical" : category}
          </span>
        ))}
        {showInferred && <span>Dashed: inferred</span>}
      </div>
      <p className="assembly-explanation" aria-live="polite">
        {wireDetail ||
          "Schematic representation of project configuration. Artwork does not verify hardware or physical wiring."}
      </p>
    </div>
  );
}

function DeviceWorkspace({
  twin,
  deviceId,
  selectedId,
  onSelect,
  onInspect,
  refresh,
}: {
  twin: TwinState;
  deviceId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  refresh: () => void;
}) {
  const components = twin.components.filter((c) =>
    deviceId === "unassigned"
      ? !twin.devices.some((d) => d.id === c.deviceId)
      : c.deviceId === deviceId,
  );
  const selected = components.find((c) => c.id === selectedId) || components[0];
  const controller = components.find((c) => c.type === "controller");
  const device = twin.devices.find((d) => d.id === deviceId);
  const preferenceKey = profilePreferenceKey(twin.project.id, deviceId);
  const [local, setLocal] = useState(() =>
    readProfilePreference(localStorage, preferenceKey),
  );
  const [preferenceError, setPreferenceError] = useState("");
  const [query, setQuery] = useState("");
  const [showInferred, setShowInferred] = useState(false);
  const configured =
    controller?.source.visual?.model ||
    controller?.source.configuration.board_model ||
    controller?.source.configuration.board ||
    controller?.source.configuration.model;
  const resolved = resolveProfile(local, configured);
  if (!selected)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        No components assigned to this device.
      </p>
    );
  const changeProfile = (value: string) => {
    const next = value === "default" ? undefined : value;
    setLocal(next);
    try {
      if (next) localStorage.setItem(preferenceKey, JSON.stringify(next));
      else localStorage.removeItem(preferenceKey);
      setPreferenceError("");
    } catch {
      setPreferenceError(
        "Artwork changed for this visit; browser storage is unavailable.",
      );
    }
  };
  const filtered = components.filter((c) =>
    (c.label + " " + c.type + " " + (c.pin || ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const state = twin.source;
  const selectedState = {
    ...state,
    project: {
      ...state.project,
      graph: { ...state.project.graph, components: [selected.source] },
    },
  };
  const instrumentState = {
    ...state,
    field_status: {
      ...state.field_status,
      ...Object.fromEntries(
        selected.observed.metrics.map((metric) => [
          metric.key,
          {
            ...state.field_status[metric.key],
            received: metric.receivedAt ?? null,
            fresh: metric.freshness === "fresh" || metric.freshness === "aging",
          },
        ]),
      ),
    },
  };
  return (
    <>
      <div className="physical-profile-bar">
        <label>
          <span>Artwork profile · this browser</span>
          <OptionSelect
            aria-label="Artwork profile"
            value={local || "default"}
            onValueChange={changeProfile}
            options={[
              { value: "default", label: "Use configured/default" },
              ...Object.values(boardProfiles).map((p) => ({
                value: p.id,
                label: p.label,
              })),
              ...(local && !Object.hasOwn(boardProfiles, local)
                ? [{ value: local, label: "Unknown: " + local }]
                : []),
            ]}
          />
        </label>
        <label className="inferred-toggle">
          <input
            type="checkbox"
            checked={showInferred}
            onChange={(e) => setShowInferred(e.target.checked)}
          />
          Show inferred associations
        </label>
        <Button
          variant="outline"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("agentwin-focus-component", {
                detail: selected.id,
              }),
            )
          }
        >
          Focus selected
        </Button>
      </div>
      {resolved.unknown && (
        <p className="px-4 pb-3 text-xs text-warning">
          Unknown profile—generic artwork ({resolved.requested}).
        </p>
      )}
      {preferenceError && (
        <p className="px-4 text-xs text-warning" role="status">
          {preferenceError}
        </p>
      )}
      <div className="physical-workbench">
        <Assembly
          twin={twin}
          components={components}
          profile={resolved.profile}
          selectedId={selected.id}
          onSelect={onSelect}
          showInferred={showInferred}
          deviceId={deviceId}
        />
        <aside
          className="physical-instruments"
          aria-label="Live instrument panel"
        >
          <header className="instrument-device">
            <Cable size={16} />
            <div>
              <strong>{device?.id || "Unassigned components"}</strong>
              <span>
                {device?.connector.toUpperCase() || "No registered device"} ·{" "}
                {device?.freshness || "unavailable"} · {twin.sessionLabel}
              </span>
            </div>
          </header>
          <div className="instrument-selection">
            <span>Selected component</span>
            <h4>{selected.label}</h4>
            <div className="evidence-label">{evidenceLabel(selected)}</div>
            <p>
              <ShieldCheck size={13} />
              Not independently verified
            </p>
          </div>
          <details className="instrument-browser">
            <summary>
              <Search size={13} />
              Components on this device ({components.length})
            </summary>
            <Input
              aria-label="Find component"
              placeholder="Find component or pin…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={c.id === selected.id}
                  onClick={() => onSelect(c.id)}
                >
                  <span>{c.label}</span>
                  <small>
                    {c.observed.metrics[0]
                      ? metricValue(
                          c.observed.metrics[0].value,
                          c.observed.metrics[0].precision,
                        )
                      : c.type}
                  </small>
                </button>
              ))}
              {!filtered.length && <p>No matching components</p>}
            </div>
          </details>
          <div className="instrument-readings">
            {selected.observed.metrics.length ? (
              selected.observed.metrics.map((metric) => (
                <ReadingCard
                  key={state.session.id + ":" + metric.key}
                  state={instrumentState}
                  field={metric.key}
                  embedded
                  categoricalView="timeline"
                />
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                No measurement fields are bound to this component. Connection
                status does not independently verify hardware.
              </p>
            )}
          </div>
          {!!selected.source.controls?.length && (
            <div className="instrument-controls">
              <ControlsPanel state={selectedState} refresh={refresh} />
            </div>
          )}
          <details className="instrument-evidence">
            <summary>Configuration & evidence</summary>
            <p>Device: {selected.deviceId || "Unassigned"}</p>
            {selected.pin && <p>Configured pin: {selected.pin}</p>}
            <p>
              {selected.evidence.level === "configured"
                ? "Configured only; no observations in this session."
                : "Firmware-reported observations; no independent physical verification."}
            </p>
            <p>Artwork: {resolved.profile.label} · visual preference only</p>
            <p>
              {selected.events.filter((e) => !e.recovered).length} related open
              events
            </p>
            <Link to="/events">View operational events</Link>
          </details>
          <Button
            className="physical-mobile-details"
            variant="outline"
            onClick={() => onInspect(selected.id)}
          >
            Open component details
          </Button>
        </aside>
      </div>
    </>
  );
}

export function PhysicalWorkspace({
  twin,
  selectedId,
  onSelect,
  onInspect,
  refresh,
}: {
  twin: TwinState;
  selectedId: string;
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  refresh: () => void;
}) {
  const selected = twin.components.find((c) => c.id === selectedId);
  const deviceId = twin.devices.some((d) => d.id === selected?.deviceId)
    ? selected!.deviceId!
    : "unassigned";
  const devices = [
    ...twin.devices.map((d) => ({ value: d.id, label: d.id })),
    ...(twin.components.some(
      (c) => !twin.devices.some((d) => d.id === c.deviceId),
    )
      ? [{ value: "unassigned", label: "Unassigned components" }]
      : []),
  ];
  return (
    <div className="physical-workspace">
      <div className="physical-device-bar">
        <div>
          <h4>Device workspace</h4>
          <p>Hardware representation and live instruments</p>
        </div>
        <OptionSelect
          aria-label="Physical device"
          value={deviceId}
          options={devices}
          onValueChange={(id) => {
            const candidates = twin.components.filter((c) =>
              id === "unassigned"
                ? !twin.devices.some((d) => d.id === c.deviceId)
                : c.deviceId === id,
            );
            const component =
              candidates.find((c) => c.observed.metrics.length) ||
              candidates[0];
            if (component) onSelect(component.id);
          }}
        />
      </div>
      <DeviceWorkspace
        key={twin.project.id + ":" + deviceId}
        twin={twin}
        deviceId={deviceId}
        selectedId={selectedId}
        onSelect={onSelect}
        onInspect={onInspect}
        refresh={refresh}
      />
    </div>
  );
}
