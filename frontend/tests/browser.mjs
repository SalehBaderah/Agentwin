import { chromium } from "@playwright/test";

/** Use Playwright's Chromium by default; allow an installed browser for local runs. */
export function launchBrowser() {
  const executablePath = process.env.AGENTWIN_BROWSER_PATH;
  const channel = process.env.AGENTWIN_BROWSER_CHANNEL;
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : channel ? { channel } : {}),
  });
}
