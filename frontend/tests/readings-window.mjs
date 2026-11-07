import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { launchBrowser } from "./browser.mjs";
import { chooseValue } from "./helpers.mjs";

// Browser-only telemetry fixtures: never ingest synthetic data into Live storage.
const base = process.env.AGENTWIN_TEST_URL || "http://127.0.0.1:8000";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const snapshots = new Map();
const sockets = new Set();
const numeric = page.getByRole("article", { name: "Temperature reading", exact: true });
const indicator = page.getByRole("article", { name: "Indicator reading", exact: true });
const mode = page.getByRole("article", { name: "Mode reading", exact: true });
const minimum = numeric.locator("dl > div").filter({ has: page.getByText("Min", { exact: true }) }).locator("dd");

function withReadings(state, count, end = count) {
  const now = Date.now() / 1000;
  const readings = Array.from({ length: count }, (_, index) => {
    const value = end - count + index + 1;
    return {
      id: value, received: now - (count - index - 1) * 10, device: state.project.device_id,
      readings: { temperature_c: value, led_on: value % 2 === 0, mode: value <= 120 ? "idle" : "active", last_command_id: null },
      original: null,
    };
  });
  return {
    ...state, readings, latest: readings.at(-1) ?? null, server_time: now,
    field_status: Object.fromEntries(Object.keys(state.project.graph.fields).map(key => [key, { received: now, fresh: count > 0 }])),
  };
}
function send(socket) {
  const id = new URL(socket.url()).searchParams.get("project");
  socket.send(JSON.stringify(id
    ? { type: "project_snapshot", state: snapshots.get(id) }
    : { type: "snapshot", projects: [...snapshots.values()] }));
}
function publish(state) {
  snapshots.set(state.project.id, state);
  for (const socket of sockets) send(socket);
}

try {
  for (const count of [180, 3]) {
    const response = await page.request.post(base + "/api/projects", { data: {
      name: `Reading window fixture ${count}`, device_id: "window-device", connector: "mqtt",
      components: [
        { component_id: "temp", component_type: "temperature", label: "Temperature", device_id: "window-device", field_key: "temperature_c", field_type: "number", unit: "°C", precision: 1 },
        { component_id: "led", component_type: "led", label: "Indicator", device_id: "window-device", field_key: "led_on", field_type: "boolean" },
        { component_id: "mode", component_type: "readonly", label: "Mode", device_id: "window-device", field_key: "mode", field_type: "categorical" },
      ],
    } });
    assert.ok(response.ok(), await response.text());
    const project = await response.json();
    const state = await (await page.request.get(`${base}/api/projects/${project.id}`)).json();
    snapshots.set(project.id, withReadings(state, count));
  }
  const [firstId, secondId] = [...snapshots.keys()];
  await page.route("**/api/projects**", route => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/")[3];
    return route.fulfill({ json: id ? snapshots.get(id) : [...snapshots.values()] });
  });
  await page.routeWebSocket("**/api/ws**", socket => {
    sockets.add(socket);
    socket.onClose(() => sockets.delete(socket));
    send(socket);
  });
  await page.goto(`${base}/projects/${firstId}?tab=readings`);
  await expect(page.getByLabel("Window", { exact: true })).toHaveAttribute("data-value", "30");
  await expect(numeric.locator("footer")).toContainText("30 observations");
  await expect(minimum).toHaveText("151 °C");
  await expect(indicator.locator("footer")).toContainText("30 observations");
  await expect(mode.locator("footer")).toContainText("30 observations");

  await chooseValue(page, page.getByLabel("Window", { exact: true }), "60");
  await expect(minimum).toHaveText("121 °C");
  await expect(numeric.locator("footer")).toContainText("60 observations");
  // 10-second spacing spans more than five minutes: the global sample window
  // must control boolean history instead of silently applying another time cap.
  await expect(indicator.locator('svg g[aria-label^="On:"], svg g[aria-label^="Off:"]')).toHaveCount(59);
  await expect(indicator.locator('svg g[aria-label^="Unknown / gap:"]')).toHaveCount(59);
  await expect(indicator.getByLabel("State history window")).toHaveCount(0);

  publish(withReadings(snapshots.get(firstId), 180, 181));
  await expect(page.getByLabel("Window", { exact: true })).toHaveAttribute("data-value", "60");
  await expect(minimum).toHaveText("122 °C");
  await chooseValue(page, page.getByLabel("Window", { exact: true }), "all");
  await expect(numeric.locator("footer")).toContainText("180 observations");
  await expect(minimum).toHaveText("2 °C");
  await expect(mode.locator("footer")).toContainText("180 observations");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Window", { exact: true })).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Reading controls overflow on mobile");
  await page.goto(`${base}/projects/${secondId}?tab=readings`);
  await expect(numeric.locator("footer")).toContainText("3 observations");
  await expect(minimum).toHaveText("1 °C");
  publish(withReadings(snapshots.get(secondId), 0));
  await expect(page.getByLabel("Window", { exact: true })).toBeDisabled();
  await expect(page.getByText("Showing 0 of 0 recent readings.", { exact: false })).toBeVisible();
  assert.deepEqual(errors, []);
  for (const id of snapshots.keys()) {
    const stored = await (await page.request.get(`${base}/api/projects/${id}`)).json();
    assert.equal(stored.latest, null, "Synthetic browser fixtures must never populate Live storage");
  }
  console.log("Reading windows passed: 30/60/all, metrics and statistics, boolean history, live updates, project isolation, empty data, and mobile layout.");
} finally {
  for (const id of snapshots.keys()) await page.request.delete(`${base}/api/projects/${id}`);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
}
