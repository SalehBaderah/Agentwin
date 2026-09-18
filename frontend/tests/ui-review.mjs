import { chromium, expect } from "@playwright/test";
import fs from "node:fs";

const base = process.env.AGENTWIN_TEST_URL || "http://127.0.0.1:5173";
if (new URL(base).port === "8000")
  throw Error("Use an isolated backend/database for this review.");
const output = "../artifacts/ui-review";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();

const errors = [],
  checks = [],
  overflows = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`${message.location().url || "browser"}: ${message.text()}`);
});
let id;
try {
  const response = await page.request.post(base + "/api/projects", {
    data: {
      name: "Greenhouse / environmental station",
      template: "temperature",
      device_id: "greenhouse-node-01",
      connector: "mqtt",
    },
  });
  expect(response.ok()).toBeTruthy();
  id = (await response.json()).id;
  const session = await (
    await page.request.post(`${base}/api/projects/${id}/sessions`, {
      data: { mode: "simulated" },
    })
  ).json();
  await page.request.post(
    `${base}/api/projects/${id}/sessions/${session.id}/scenario`,
    { data: { scenario: "normal" } },
  );
  await page.goto(base + "/settings");
  await page.getByRole("heading", { name: "Appearance" }).waitFor();
  await page
    .getByRole("button", { name: "Dark theme", exact: true })
    .last()
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  checks.push("Dark preference persists after reload");
  await page
    .getByRole("button", { name: "System theme", exact: true })
    .last()
    .click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  checks.push("System preference follows live OS changes");
  await page.goto(`${base}/projects/${id}`);
  await page.getByRole("tab", { name: "Digital twin", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Live readings", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Copy project ID", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
  checks.push("Keyboard tab navigation and full project ID copying");
  await page
    .getByRole("button", { name: "Manage project", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage project", exact: true }),
  ).toBeFocused();
  checks.push("Delete dialog cancels with Escape and restores focus");
  const widths = [1920, 1440, 1280, 1024, 768, 430, 390, 360];
  const views = [
    ["overview", "/"],
    ["projects", "/projects"],
    ["project", `/projects/${id}?tab=overview`],
    ["twin", `/projects/${id}?tab=twin`],
    ["readings", `/projects/${id}?tab=readings`],
    ["history", `/projects/${id}?tab=events`],
    ["controls", `/projects/${id}?tab=controls`],
    ["events", "/events"],
    ["add", "/projects/new"],
    ["settings", "/settings"],
  ];
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (value) => localStorage.setItem("agentwin-theme", value),
      theme,
    );
    for (const width of widths) {
      await page.setViewportSize({
        width,
        height: width === 1920 ? 1080 : width === 1280 ? 800 : 900,
      });
      for (const [name, path] of views) {
        await page.goto(base + path);
        await page.locator("main.page").waitFor();
        if (path.startsWith(`/projects/${id}`))
          await page.locator(".tab-content").waitFor();
        if (name === "add") await page.getByLabel("Project name").waitFor();
        await expect(
          page.getByText("Backend connected", { exact: true }),
        ).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        if (name === "twin")
          await page.locator(".live-twin-canvas canvas").first().waitFor();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const overflow = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll("main *")]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return (
                r.width &&
                r.right > innerWidth + 1 &&
                !e.closest(".react-flow, .tabs")
              );
            })
            .slice(0, 8)
            .map((e) => e.className),
        }));
        if (overflow.scroll > width + 1)
          overflows.push({ theme, width, name, ...overflow });
        await page.screenshot({
          path: `${output}/${theme}-${width}-${name}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  checks.push("160 route/theme/viewport renders captured");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL(base + "/projects");
  checks.push("Mobile dialog navigation opens, navigates, and closes");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".sidebar")
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  checks.push("Reduced motion disables surface transitions");
  fs.writeFileSync(
    `${output}/results.json`,
    JSON.stringify({ checks, errors, overflows }, null, 2),
  );
  expect(overflows, "Horizontal page overflow").toEqual([]);
  expect(errors, "Browser errors").toEqual([]);
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  if (id) await page.request.delete(`${base}/api/projects/${id}`);
  await browser.close();
}
