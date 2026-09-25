import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.AGENTWIN_TEST_URL || "http://127.0.0.1:5173";
if (new URL(base).port === "8000") throw Error("Use an isolated backend/database for this review.");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const controls = () => page.evaluate(() => [...document.querySelectorAll(".project-actions [role=combobox], .project-actions a, .project-actions button:not([role=combobox])")]
  .map((element) => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, width: rect.width }; }));
let id;
try {
  const response = await page.request.post(`${base}/api/projects`, { data: { name: "Layout review", template: "generic", device_id: "layout-01", connector: "mqtt" } });
  assert.ok(response.ok());
  id = (await response.json()).id;
  await page.goto(`${base}/projects/${id}`);
  await page.locator(".project-actions [role=combobox]").waitFor();
  const edges = await controls();
  assert.equal(edges.length, 3);
  assert.ok(edges.every((edge) => Math.abs(edge.top - edges[0].top) <= 1), JSON.stringify(edges));
  assert.ok(edges.every((edge) => Math.abs(edge.bottom - edges[0].bottom) <= 1), JSON.stringify(edges));
  await page.setViewportSize({ width: 600, height: 800 });
  const mobile = await controls();
  assert.ok(mobile[0].bottom < mobile[1].top && mobile[1].bottom < mobile[2].top, JSON.stringify(mobile));
  assert.ok(mobile.every((edge) => Math.abs(edge.width - mobile[0].width) <= 1), JSON.stringify(mobile));
  console.log("Project controls align on desktop and stack evenly on narrow screens.");
} finally {
  if (id) await page.request.delete(`${base}/api/projects/${id}`);
  await browser.close();
}
