import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("public/favicon.svg");
const target = resolve("../backend/assets/agentwin-logo.png");
mkdirSync(resolve("../backend/assets"), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 96, height: 80 }, deviceScaleFactor: 2 });
  const svg = readFileSync(source, "utf8").replace('viewBox="0 0 48 40"', 'width="96" height="80" viewBox="0 0 48 40"');
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
  await page.screenshot({ path: target, omitBackground: true });
} finally {
  await browser.close();
}
