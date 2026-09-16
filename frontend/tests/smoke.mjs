import { chromium } from "@playwright/test";
import fs from "node:fs";
const output = "../artifacts";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const base = "http://127.0.0.1:8000";
async function check(condition, message) {
  if (!condition) throw Error(message);
}
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "Systems at a glance" }).waitFor();
  await page.screenshot({
    path: output + "/overview-laptop.png",
    fullPage: true,
  });
  await page.goto(base + "/projects/smart-connectivity");
  const simulatedSession = await page.locator(".source-picker option").filter({ hasText: "simulated" }).first().getAttribute("value");
  await page.locator(".source-picker select").selectOption(simulatedSession);
  await page.getByRole("button", { name: "Start normal", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".status-line")?.textContent.includes("reporting"),
  );
  await page.waitForTimeout(3500);
  await page.screenshot({
    path: output + "/workspace-laptop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Detector / level change", exact: true })
    .click();
  await page.waitForTimeout(3500);
  await page.getByRole("tab", { name: "Events & history" }).click();
  await page.getByText("high reading", { exact: true }).first().waitFor();
  await page
    .getByRole("button", { name: /high reading/ })
    .first()
    .click();
  await page.getByRole("heading", { name: "Event evidence" }).waitFor();
  await page
    .getByRole("button", { name: "Acknowledge event", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Pause telemetry", exact: true })
    .click();
  await page.waitForTimeout(9500);
  await page.getByText("missing telemetry", { exact: true }).first().waitFor();
  await page.screenshot({
    path: output + "/events-laptop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Recover", exact: true }).click();
  await page.waitForTimeout(3500);
  await check(
    (await page.locator(".event-select .badge").allTextContents()).every(
      (s) => s === "Recovered",
    ),
    "Events did not recover",
  );
  await page.getByRole("tab", { name: "Digital twin" }).click();
  await page.getByLabel("Relationship legend").waitFor();
  await page.getByText("AD8313 detector", { exact: true }).click();
  await page.getByRole("heading", { name: "AD8313 detector", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ask agent about this component" }).click();
  await check((await page.locator(".agent-panel textarea, .agent-panel input").inputValue()).includes("AD8313 detector"), "Component agent prompt was not scoped");
  await page.screenshot({ path: output + "/twin-laptop.png", fullPage: true });
  await page.getByRole("button", { name: "Send question" }).click();
  await page.locator(".agent-answer").waitFor();
  await check(
    (await page.locator(".agent-answer").textContent()).includes(
      "AI agent unavailable",
    ),
    "Missing-key status absent",
  );
  await page
    .getByRole("button", { name: "Replay recording", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.querySelector(".status-line")?.textContent.includes("replay"),
  );
  await check(
    (await page.locator(".status-line").textContent()).includes("synthetic"),
    "Replay provenance absent",
  );
  await page.goto(base + "/projects/new");
  await page.getByLabel("Project name").fill("Browser verification sensor");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Device identity").fill("browser-sensor-01");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Telemetry field").fill("water_cm");
  await page.getByLabel("Unit", { exact: true }).fill("cm");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Browser verification sensor", exact: true })
    .waitFor();
  const createdUrl = page.url();
  await page.reload();
  await page
    .getByRole("heading", { name: "Browser verification sensor", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, name] of [
    ["/", "overview"],
    ["/projects/smart-connectivity", "workspace"],
    ["/projects/smart-connectivity", "twin"],
    ["/projects/new", "add"],
  ]) {
    await page.goto(base + route);
    await page.waitForTimeout(1500);
    if (name === "twin") {
      await page.getByRole("tab", { name: "Digital twin" }).click();
      await page.getByLabel("Selected component details").waitFor();
    }
    await check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Horizontal overflow on " + route,
    );
    await page.screenshot({
      path: output + "/" + name + "-mobile.png",
      fullPage: true,
    });
  }
  await check(errors.length === 0, "Browser errors: " + errors.join("\n"));
  fs.writeFileSync(
    output + "/browser-results.json",
    JSON.stringify(
      {
        passed: true,
        viewportChecks: ["1440x1100", "390x844"],
        createdUrl,
        errors,
        flows: [
          "simulation",
          "level event",
          "acknowledgement",
          "missing telemetry",
          "recovery",
          "twin selection",
          "agent unavailable",
          "synthetic replay",
          "project creation",
          "reload persistence",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Browser smoke passed; screenshots and results in artifacts/");
} finally {
  await browser.close();
}
