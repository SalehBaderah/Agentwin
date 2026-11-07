import { launchBrowser } from "./browser.mjs";
import { expect } from "@playwright/test";
import fs from 'node:fs';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
fs.mkdirSync('../artifacts/light-theme', { recursive: true });
try {
  await page.goto('http://127.0.0.1:8000');
  const results = await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    const style = getComputedStyle(document.documentElement);
    const color = name => {
      const probe = document.createElement('span');
      probe.style.color = 'var(' + name + ')';
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
      probe.remove();
      return rgb;
    };
    const luminance = rgb => rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => { const x = luminance(color(a)), y = luminance(color(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const pairs = [];
    for (const bg of ['--background', '--surface', '--surface-elevated', '--surface-hover', '--accent-subtle']) {
      for (const fg of ['--text-primary', '--text-secondary', '--text-muted', '--accent-text', '--operational-cyan']) pairs.push({ fg, bg, ratio: ratio(fg, bg), minimum: 4.5 });
    }
    for (const status of ['success', 'warning', 'danger']) pairs.push({ fg: '--' + status, bg: '--' + status + '-subtle', ratio: ratio('--' + status, '--' + status + '-subtle'), minimum: 4.5 });
    for (const bg of ['--accent', '--accent-hover', '--accent-pressed']) pairs.push({ fg: '--accent-foreground', bg, ratio: ratio('--accent-foreground', bg), minimum: 4.5 });
    pairs.push({ fg: '--border-strong', bg: '--surface', ratio: ratio('--border-strong', '--surface'), minimum: 3 });
    return { pairs, background: style.getPropertyValue('--background') };
  });
  for (const pair of results.pairs) expect(pair.ratio, pair.fg + ' on ' + pair.bg).toBeGreaterThanOrEqual(pair.minimum);
  for (const route of ['/', '/projects', '/events', '/settings']) {
    await page.goto('http://127.0.0.1:8000' + route);
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: '../artifacts/light-theme/' + (route.slice(1) || 'overview') + '-' + width + '.png', fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
  }
  expect(errors).toEqual([]);
  console.log('Passed ' + results.pairs.length + ' token contrast checks and four routes at desktop/mobile widths.');
} finally { await browser.close(); }
