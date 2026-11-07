import { launchBrowser } from "./browser.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { expect } from "@playwright/test";

// All device evidence below is a synthetic browser fixture. It is never ingested.
// Refuse production's port even when an environment override is supplied.
const base = new URL(process.env.AGENTWIN_TEMPLATE_TEST_URL || 'http://127.0.0.1:8011');
assert.equal(base.port, '8011', 'Use the isolated, background-disabled test backend on port 8011.');
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname), 'Test backend must be local.');
assert.equal(base.protocol, 'http:');
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const failures = [];
const sockets = new Set();
const stages = ['Configured', 'Firmware downloaded', 'Upload confirmed', 'Reporting', 'Telemetry verified'];
const output = '../artifacts/onboarding-stepper-fixture';
let projectId;
let snapshot;
let disconnected = false;
page.on('pageerror', error => failures.push(error.message));
await fs.mkdir(output, { recursive: true });

const progress = page.getByRole('region', { name: 'Device setup progress', exact: true });
const list = page.getByRole('list', { name: 'Device onboarding progress', exact: true });
// Radix retains closed content briefly for exit animations.
const tooltip = page.locator('[role="tooltip"]:not([data-state="closed"])');
const stage = index => list.locator('li').nth(index);
const checkProgress = async (completed, current) => {
  await expect(list).toBeVisible();
  await expect(list.locator('li')).toHaveCount(5);
  for (const [index, label] of stages.entries()) {
    await expect(stage(index)).toContainText(label);
    await expect(stage(index)).toHaveAttribute('data-complete', String(completed.includes(index + 1)));
  }
  await expect(list.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(stage(current - 1)).toHaveAttribute('aria-current', 'step');
};
const publish = async next => {
  snapshot = next;
  for (const socket of sockets) {
    const url = new URL(socket.url());
    if (!url.searchParams.has('project')) socket.send(JSON.stringify({ type: 'snapshot', projects: [snapshot] }));
    else socket.send(JSON.stringify({ type: 'project_snapshot', state: snapshot }));
  }
};
const withReadings = (count = 2, { age = 0, mode = 'live' } = {}) => {
  const now = Date.now() / 1000;
  const readings = Array.from({ length: count }, (_, index) => ({
    id: index + 1, device: snapshot.project.device_id, boot: 'synthetic-test-boot', seq: index + 1,
    uptime: index + 1, received: now - age - (count - index),
    readings: { led_on: index % 2 === 0, last_command_id: null }, original: null,
  }));
  const session = mode === 'live'
    ? snapshot.sessions.find(item => item.mode === 'live')
    : { id: 'synthetic-' + mode, mode, created: now, scenario: '', provenance: { origin: 'synthetic browser fixture only' } };
  return {
    ...snapshot, server_time: now, readings, latest: readings.at(-1) || null,
    session, sessions: [...snapshot.sessions.filter(item => item.mode === 'live'), ...(mode === 'live' ? [] : [session])],
    field_status: { ...snapshot.field_status, led_on: { received: readings.at(-1)?.received ?? null, fresh: age === 0 && count > 0, device_id: snapshot.project.device_id } },
    devices: snapshot.devices.map(device => ({ ...device, online: age === 0 && count > 0, reporting: age === 0 && count > 0 })),
  };
};
const recordKey = () => 'agentwin-setup:' + projectId + ':' + snapshot.project.device_id + ':arduino_uno_d13_led';

try {
  const response = await page.request.post(new URL('/api/projects', base).href, {
    headers: { origin: 'http://127.0.0.1:8000' },
    data: { name: 'Synthetic stepper test fixture', template: 'arduino_uno_d13_led', device_id: 'stepper-fixture', freshness_seconds: 120 },
  });
  assert.equal(response.ok(), true, await response.text());
  const created = await response.json();
  projectId = created.project?.id || created.id;
  assert.ok(projectId, 'Creation must return a project ID.');
  const stateResponse = await page.request.get(new URL('/api/projects/' + projectId, base).href);
  assert.equal(stateResponse.ok(), true);
  snapshot = await stateResponse.json();
  assert.equal(snapshot.latest, null, 'Isolated project must contain no ingested readings.');

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/projects') {
      return route.fulfill({ json: [snapshot] });
    }
    if (request.method() === 'GET' && url.pathname === '/api/projects/' + projectId) {
      return route.fulfill({ json: snapshot });
    }
    // Isolated port is deliberately outside production's CORS origin allowlist.
    const fetched = await route.fetch({ headers: { ...request.headers(), origin: 'http://127.0.0.1:8000' } });
    await route.fulfill({ response: fetched });
  });
  await page.routeWebSocket(url => url.host === base.host && url.pathname === '/api/ws', socket => {
    const url = new URL(socket.url());
    if (disconnected && !url.searchParams.has('project')) {
      void socket.close({ code: 1001, reason: 'Synthetic disconnected fixture' });
      return;
    }
    sockets.add(socket);
    socket.onClose(() => { sockets.delete(socket); });
    socket.send(JSON.stringify(url.searchParams.has('project')
      ? { type: 'project_snapshot', state: snapshot }
      : { type: 'snapshot', projects: [snapshot] }));
  });
  await page.goto(new URL('/projects/' + projectId + '?tab=setup', base).href);
  await page.getByText('Saved configuration matches this firmware.', { exact: true }).waitFor();
  await checkProgress([1], 2);

  // Tooltip opens through keyboard focus, and Escape dismisses it.
  const details = progress.getByRole('button', { name: 'Configured details', exact: true });
  await details.scrollIntoViewIfNeeded();
  // Flush the scroll event before focusing: Radix dismisses tooltips on scroll.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await progress.locator('[aria-label^="Current confirmed state:"]').focus();
  await expect(tooltip).toContainText(/confirmed evidence/i);
  await page.keyboard.press('Tab');
  await expect(details).toBeFocused();
  await expect(tooltip).toContainText(/saved|configuration/i);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  for (const [label, explanation] of [
    ['Firmware downloaded', /browser|package/i],
    ['Upload confirmed', /operator|upload/i],
    ['Reporting', /fresh.*Live|Live.*fresh/i],
    ['Telemetry verified', /contract|advanc/i],
  ]) {
    const trigger = progress.getByRole('button', { name: label + ' details', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(tooltip).toContainText(explanation);
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
  }

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download firmware package', exact: true }).click();
  const download = await downloadEvent;
  assert.equal(await download.failure(), null);
  await checkProgress([1, 2], 3);
  await page.getByRole('button', { name: 'I uploaded this package', exact: true }).click();
  await checkProgress([1, 2, 3], 4);
  const legacyRecord = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), recordKey());
  assert.ok(legacyRecord.downloadedAt && legacyRecord.flashedAt, 'Legacy flashedAt must remain compatible.');
  await page.reload();
  await page.getByRole('button', { name: 'Undo upload confirmation', exact: true }).waitFor();
  await checkProgress([1, 2, 3], 4);

  await publish(withReadings(1));
  await checkProgress([1, 2, 3, 4], 5);
  await publish(withReadings(2));
  await expect(list).toHaveCount(0);
  await expect(progress.getByText('Telemetry verified', { exact: true })).toBeVisible();
  const view = progress.getByRole('button', { name: 'View setup progress', exact: true });
  await expect(view).toHaveAttribute('aria-expanded', 'false');
  await view.click();
  await checkProgress([1, 2, 3, 4, 5], 5);
  await expect(progress.getByRole('button', { name: 'Hide setup progress', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await progress.getByRole('button', { name: 'Hide setup progress', exact: true }).click();
  await expect(list).toHaveCount(0);

  for (const [theme, width] of [['dark', 1440], ['light', 1440], ['dark', 390], ['light', 390]]) {
    await publish(withReadings(2));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      localStorage.setItem('agentwin-theme', theme);
    }, theme);
    await expect(progress.getByRole('button', { name: 'View setup progress', exact: true })).toBeVisible();
    await page.screenshot({ path: output + '/synthetic-complete-' + theme + '-' + width + '.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Stepper causes horizontal overflow.');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Current evidence loss reopens full progress rather than retaining a green badge.
  await progress.getByRole('button', { name: 'View setup progress', exact: true }).click();
  await checkProgress([1, 2, 3, 4, 5], 5);
  await publish(withReadings(2, { age: 125 }));
  await checkProgress([1, 2, 3], 4);
  await publish(withReadings(2));
  await expect(list).toHaveCount(0);
  disconnected = true;
  for (const socket of [...sockets]) {
    if (!new URL(socket.url()).searchParams.has('project')) {
      sockets.delete(socket);
      await socket.close({ code: 1001, reason: 'Synthetic disconnected fixture' });
    }
  }
  await checkProgress([1, 2, 3], 4);
  disconnected = false;
  await expect.poll(() => [...sockets].some(socket => !new URL(socket.url()).searchParams.has('project'))).toBe(true);
  await publish(withReadings(2));
  await expect(list).toHaveCount(0);

  for (const mode of ['simulated', 'replay']) {
    await publish(withReadings(2, { mode }));
    await checkProgress([1, 2, 3], 4);
    await publish(withReadings(2));
    await expect(list).toHaveCount(0);
  }

  // Fresh telemetry never invents this browser's download or upload history.
  await page.evaluate(key => localStorage.removeItem(key), recordKey());
  await page.reload();
  await page.getByText('Saved configuration matches this firmware.', { exact: true }).waitFor();
  await checkProgress([1, 4, 5], 2);
  await expect(progress.getByRole('button', { name: 'View setup progress', exact: true })).toHaveCount(0);
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key: recordKey(), record: legacyRecord });
  await page.reload();
  await progress.getByRole('button', { name: 'View setup progress', exact: true }).waitFor();
  await expect(list).toHaveCount(0);

  const unchanged = await (await page.request.get(new URL('/api/projects/' + projectId, base).href)).json();
  assert.equal(unchanged.latest, null, 'Browser fixtures must never write simulated telemetry into the backend.');
  assert.deepEqual(unchanged.project, snapshot.project, 'Stepper must never modify project configuration.');
  assert.deepEqual(failures, []);
  console.log('Onboarding stepper: evidence stages, keyboard tooltips, collapse/expand, legacy records, stale/disconnected/session regressions, and themes/mobile passed using synthetic browser fixtures only.');
} catch (error) {
  await page.screenshot({ path: output + '/synthetic-failure.png', fullPage: true });
  console.error(await page.locator('body').innerText(), failures);
  throw error;
} finally {
  if (projectId) await page.request.delete(new URL('/api/projects/' + projectId, base).href);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await browser.close();
}
