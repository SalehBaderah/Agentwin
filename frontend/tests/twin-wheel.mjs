import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  const states = await (await page.request.get('http://127.0.0.1:8000/api/projects')).json();
  await page.goto(`http://127.0.0.1:8000/projects/${states[0].project.id}?tab=twin`);
  for (const [name, selector] of [['Physical 2D', '.physical-svg'], ['Data Flow', '.flow-svg']]) {
    await page.getByRole('tab', { name, exact: true }).click();
    const canvas = page.locator(selector);
    await canvas.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Fit view', exact: true }).click();
    await canvas.hover();
    const before = await canvas.getAttribute('viewBox');
    const scroll = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, -240);
    await expect(canvas).not.toHaveAttribute('viewBox', before);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  }
  await page.mouse.move(1400, 300);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, -240);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(before);
  console.log('Canvas wheel zoom keeps page position; scrolling outside canvas still works.');
} finally { await browser.close(); }
