import { launchBrowser } from "./browser.mjs";
import { expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chooseValue } from "./helpers.mjs";

const base = process.env.AGENTWIN_TEST_URL || "http://127.0.0.1:5173";
if (new URL(base).port === "8000")
  throw Error("Use an isolated database and MQTT test broker.");
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let id, fixture;
try {
  const response = await page.request.post(`${base}/api/projects`, {
    data: {
      name: "Verified LED fixture",
      template: "led",
      device_id: "ui-led-fixture",
      connector: "mqtt",
      freshness_seconds: 3,
    },
  });
  expect(response.ok()).toBeTruthy();
  id = (await response.json()).id;
  const initial = await (
    await page.request.get(`${base}/api/projects/${id}`)
  ).json();
  const live = initial.sessions.find((session) => session.mode === "live");
  fixture = spawn(
    "../.venv/Scripts/python.exe",
    ["tests/device-fixture.py", id, "ui-led-fixture", "18839"],
    { stdio: "ignore" },
  );
  await page.goto(`${base}/projects/${id}?tab=controls`);
  await chooseValue(page, page.locator(".source-picker [role=combobox]"), live.id);
  const on = page.getByRole("button", { name: "Turn on", exact: true });
  await expect(on).toBeEnabled({ timeout: 30000 });
  await on.click();
  await expect(page.locator(".control-card .badge")).toHaveText("requested");
  await expect(
    page.locator(".control-state").getByText("Off", { exact: true }),
  ).toBeVisible();
  await expect(on).toBeDisabled();
  await page.screenshot({
    path: "../artifacts/ui-review/command-requested.png",
    fullPage: true,
  });
  await expect(page.locator(".control-card .badge")).toHaveText("completed", {
    timeout: 12000,
  });
  await expect(
    page.locator(".control-state").getByText("On", { exact: true }),
  ).toBeVisible();
  checks.push(
    "Real MQTT fixture: requested remains pending until matching device telemetry; WebSocket delivers completion",
  );
  await page.getByRole("tab", { name: "Live readings", exact: true }).click();
  await expect(page.locator(".transition-list")).toContainText("On");
  checks.push("Boolean reading history updates from device telemetry");
  fixture.kill();
  fixture = null;
  await page
    .getByRole("tab", { name: "Events & history", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Acknowledge event", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Acknowledge event", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Acknowledged", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".event-item .badge")).toHaveText("Open");
  checks.push(
    "Missing telemetry opens event; acknowledgement does not show recovery",
  );
  fixture = spawn(
    "../.venv/Scripts/python.exe",
    ["tests/device-fixture.py", id, "ui-led-fixture", "18839"],
    { stdio: "ignore" },
  );
  await expect(page.locator(".event-item .badge")).toHaveText("Recovered", {
    timeout: 15000,
  });
  checks.push("Fresh telemetry produces actual event recovery");
  const simulated = await (
    await page.request.post(`${base}/api/projects/${id}/sessions`, {
      data: { mode: "simulated" },
    })
  ).json();
  await page.request.post(
    `${base}/api/projects/${id}/sessions/${simulated.id}/scenario`,
    { data: { scenario: "normal" } },
  );
  await page.locator(".source-picker [role=combobox]").click();
  await page.locator(`[role="option"][data-value="${simulated.id}"]`).click({ timeout: 5000 });
  await page.getByRole("tab", { name: "Controls", exact: true }).click();
  await expect(on).toBeDisabled();
  await expect(page.locator(".source-note")).toContainText(
    "Test data is isolated",
  );
  checks.push("Session switching preserves hardware-control restrictions");
  await page
    .getByRole("button", { name: "What changed recently?", exact: true })
    .click();
  await page.route("**/agent", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Review fixture: provider unavailable" }),
    }),
  );
  await page
    .getByRole("button", { name: "Send question to Win", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Review fixture: provider unavailable",
  );
  checks.push(
    "Agent request failure is visible and does not create an unhandled rejection",
  );
  await page
    .getByRole("button", { name: "Manage project", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/projects`);
  expect((await page.request.get(`${base}/api/projects`)).ok()).toBeTruthy();
  id = null;
  checks.push("Confirmed deletion returns to project list");
  expect(errors).toEqual([]);
  fs.writeFileSync(
    "../artifacts/ui-review/operations-results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  fixture?.kill();
  if (id) await page.request.delete(`${base}/api/projects/${id}`);
  await browser.close();
}
