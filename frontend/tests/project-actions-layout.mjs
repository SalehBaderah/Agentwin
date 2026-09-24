import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const css = ["tokens.css", "styles.css", "modern.css"]
  .map((name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8"))
  .join("\n");

const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 300 } });
  await page.setContent(`<style>${css}</style>
    <div class="project-actions" style="width:560px">
      <label class="source-picker">Session<select><option>live · 10:20:58 PM</option></select></label>
      <a href="#settings" class="button ghost project-manage">Monitoring settings</a>
      <button class="ghost project-manage">Manage project</button>
    </div>`);
  const edges = await page.evaluate(() => [...document.querySelectorAll(".project-actions select, .project-actions a, .project-actions button")]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }));
  assert.equal(edges.length, 3);
  assert.ok(edges.every((edge) => Math.abs(edge.top - edges[0].top) <= 1), JSON.stringify(edges));
  assert.ok(edges.every((edge) => Math.abs(edge.bottom - edges[0].bottom) <= 1), JSON.stringify(edges));
  await page.setViewportSize({ width: 600, height: 400 });
  const mobile = await page.evaluate(() => [...document.querySelectorAll(".project-actions select, .project-actions a, .project-actions button")]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, width: rect.width };
    }));
  assert.ok(mobile[0].bottom < mobile[1].top && mobile[1].bottom < mobile[2].top, JSON.stringify(mobile));
  assert.ok(mobile.every((edge) => Math.abs(edge.width - mobile[0].width) <= 1), JSON.stringify(mobile));
  console.log("Project controls align on desktop and stack evenly on narrow screens.");
} finally {
  await browser.close();
}
