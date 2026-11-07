import { launchBrowser } from "./browser.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";


const base = process.env.AGENTWIN_TEST_URL || "http://127.0.0.1:5173";
if (new URL(base).port === "8000") throw Error("Use an isolated backend/database for this review.");
fs.mkdirSync("../artifacts", { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => localStorage.setItem("agentwin-theme", "dark"));
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
let id;
try {
  const response = await page.request.post(`${base}/api/projects`, {
    data: { name: "Win dock review", template: "generic", device_id: "win-dock-01", connector: "mqtt" },
  });
  assert.ok(response.ok());
  id = (await response.json()).id;
  await page.goto(`${base}/projects/${id}`);
  await page.getByRole("heading", { name: "Win dock review" }).waitFor();
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "Collapse Win assistant" }).click();
  const dock = page.getByRole("button", { name: "Open Win assistant" });
  const desktop = await dock.boundingBox();
  assert.ok(desktop && desktop.width >= 140 && desktop.height >= 188, JSON.stringify(desktop));
  assert.ok(await dock.locator("img").evaluate((image) => image.complete && image.naturalWidth > 0));
  await dock.screenshot({ path: "../artifacts/win-dock-desktop.png" });
  await dock.click();
  assert.ok(await page.getByRole("button", { name: "Collapse Win assistant" }).isVisible());

  await page.setViewportSize({ width: 390, height: 844 });
  await dock.waitFor({ state: "visible" });
  const mobile = await dock.boundingBox();
  assert.ok(mobile && mobile.width >= 192 && mobile.height >= 72, JSON.stringify(mobile));
  assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 390, JSON.stringify(mobile));
  await dock.screenshot({ path: "../artifacts/win-dock-mobile.png" });
  await dock.click();
  assert.ok(await page.getByRole("button", { name: "Collapse Win assistant" }).isVisible());
  console.log("Win dock is larger, visible, and reopens the panel on desktop and mobile.");
} finally {
  if (id) await page.request.delete(`${base}/api/projects/${id}`);
  await browser.close();
}
