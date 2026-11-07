import { launchBrowser } from "./browser.mjs";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chooseValue } from "./helpers.mjs";

const base = process.env.AGENTWIN_BASE || "http://127.0.0.1:8002";
const projectId = process.env.AGENTWIN_PROJECT_ID;
const otherProjectId = process.env.AGENTWIN_OTHER_PROJECT_ID;
const artifacts = process.env.AGENTWIN_ARTIFACTS || "../artifacts";
if (!projectId) throw new Error("Set AGENTWIN_PROJECT_ID to a disposable review project");
await mkdir(artifacts, { recursive: true });
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/settings?project=${projectId}`);
  await expect(page.getByRole("heading", { name: "Project monitoring" })).toBeVisible();
  const projectSelector = page.locator(".monitoring-heading [role=combobox]");
  await expect(projectSelector).toHaveAttribute("data-value", projectId);
  if (otherProjectId) {
    await chooseValue(page, projectSelector, otherProjectId);
    await page.waitForTimeout(1500);
    await expect(projectSelector).toHaveAttribute("data-value", otherProjectId);
    await chooseValue(page, projectSelector, projectId);
  }
  await expect(page.getByLabel("Alert after device silence")).toHaveValue("30");
  await expect(page.getByLabel("Every")).toHaveValue("10");
  if (await page.getByRole("spinbutton", { name: "Limit" }).count() === 0) {
    await page.getByRole("button", { name: "Add limit" }).click();
    await page.getByRole("spinbutton", { name: "Limit" }).fill("30");
  }
  await expect(page.getByRole("spinbutton", { name: "Limit" })).toHaveValue("30");
  await page.getByRole("button", { name: "Save monitoring settings" }).click();
  await expect(page.locator(".monitoring-actions [role='status']")).toHaveText("Monitoring settings saved.");
  await page.reload();
  await expect(page.locator(".monitoring-heading [role=combobox]")).toHaveAttribute("data-value", projectId);
  await expect(page.getByRole("spinbutton", { name: "Limit" })).toHaveValue("30");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(artifacts, "monitoring-settings-review.png"), fullPage: true });
  await page.goto(`${base}/projects/${projectId}`);
  await expect(page.getByRole("region", { name: "Latest scheduled summary" })).toBeVisible();
  await page.locator(".physical-svg").waitFor();
  await page.screenshot({ path: join(artifacts, "monitoring-win-review.png"), fullPage: true });
  await page.goto(`${base}/events`);
  await expect(page.getByRole("heading", { name: "Events across your systems." })).toBeVisible();
  if (await page.getByRole("heading", { name: "Recent summaries" }).count()) {
    await expect(page.getByRole("heading", { name: "Recent summaries" }).first()).toBeVisible();
  } else {
    await expect(page.getByText("No recorded alerts.").first()).toBeVisible();
  }
  await page.screenshot({ path: join(artifacts, "monitoring-events-review.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/settings?project=${projectId}`);
  await expect(page.getByRole("heading", { name: "Project monitoring" })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 12).map((element) => ({ tag: element.tagName, className: String(element.className).slice(0, 100), right: Math.round(element.getBoundingClientRect().right) })),
  }));
  if (overflow.width > overflow.viewport + 1) throw new Error(`Mobile horizontal overflow: ${JSON.stringify(overflow)}`);
  await page.locator(".topbar-search-trigger").click();
  await expect(page.getByRole("dialog", { name: "Search Agentwin" })).toBeVisible();
  const openWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  if (openWidth > 391) throw new Error(`Open mobile search overflows to ${openWidth}px`);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: join(artifacts, "monitoring-settings-mobile-review.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.setItem("agentwin-theme", "dark"));
  await page.goto(`${base}/settings?project=${projectId}`);
  await expect(page.getByRole("heading", { name: "Project monitoring" })).toBeVisible();
  await page.screenshot({ path: join(artifacts, "monitoring-settings-dark-review.png"), fullPage: true });
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
} finally {
  await browser.close();
}
