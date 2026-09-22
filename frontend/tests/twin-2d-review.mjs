import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const ids = [];
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));

async function create(body) {
  const response = await page.request.post(`${base}/api/projects`, { data: body });
  assert.equal(response.ok(), true, await response.text());
  const project = await response.json();
  ids.push(project.id);
  return project.id;
}

async function open(id) {
  await page.goto(`${base}/projects/${id}?tab=twin`);
  await page.getByRole('tab', { name: 'Physical 2D' }).waitFor();
  await page.locator('.physical-svg').waitFor();
}

try {
  const uno = await create({ name: 'arduino_uno_d13_led', template: 'led', device_id: 'uno-d13-review', connector: 'usb', components: [
    { component_id: 'led', component_type: 'led', label: 'Built-in LED', device_id: 'uno-d13-review', pin: 'D13', field_key: 'led_on', field_type: 'boolean' },
  ] });
  await open(uno);
  await page.locator('.physical-svg .board-logo', { hasText: 'UNO' }).waitFor();
  await page.locator('.physical-svg').getByText('D13 · onboard LED').waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: '../artifacts/twin-2d-review.png', fullPage: true });
  await page.locator('.physical-svg g[aria-label^="Built-in LED,"]').click();
  await page.getByRole('complementary', { name: 'Selected component details' }).getByRole('heading', { name: 'Built-in LED' }).waitFor();
  await page.getByRole('tab', { name: 'Topology' }).click();
  await page.locator('.twin-node.is-selected', { hasText: 'Built-in LED' }).waitFor();
  await page.getByRole('tab', { name: 'Data Flow' }).click();
  await page.locator('.flow-node.is-active', { hasText: 'Built-in LED' }).waitFor();
  await page.getByRole('button', { name: 'Close component inspector' }).click();
  await page.waitForTimeout(350);
  await page.locator('.live-twin-workspace').screenshot({ path: '../artifacts/twin-flow-review.png' });
  await page.getByRole('tab', { name: 'Physical 2D' }).click();
  const simulated = await page.locator('.source-picker option').filter({ hasText: 'simulated' }).getAttribute('value');
  await page.locator('.source-picker select').selectOption(simulated);
  await page.locator('.session-kicker.simulation').waitFor();
  await page.locator('.twin2d-caption', { hasText: 'SIMULATION' }).waitFor();

  const r4 = await create({ name: 'R4 RF Jamming Detector', template: 'connectivity', device_id: 'r4-rf-review', connector: 'mqtt', components: [
    { component_id: 'rf-detector', component_type: 'analog', label: 'AD8313 detector', device_id: 'r4-rf-review', pin: 'A5', field_key: 'rf_raw' },
    { component_id: 'rf-mean', component_type: 'readonly', label: 'Rolling mean', device_id: 'r4-rf-review', field_key: 'rf_mean' },
    { component_id: 'jamming-probability', component_type: 'readonly', label: 'Jamming probability', device_id: 'r4-rf-review', field_key: 'jamming_probability' },
  ] });
  await open(r4);
  await page.locator('.physical-svg').getByText('R4 WiFi').waitFor();
  await page.locator('.physical-svg').getByText('A5').first().waitFor();
  await page.getByRole('tab', { name: 'Data Flow' }).click();
  await page.locator('.flow-node', { hasText: 'Rolling mean' }).waitFor();
  await page.locator('.flow-node', { hasText: 'Jamming probability' }).waitFor();
  await page.locator('.live-twin-workspace').screenshot({ path: '../artifacts/twin-r4-flow-review.png' });

  const future = await create({ name: 'Future generic station', template: 'generic', device_id: 'future-review', connector: 'mqtt', components: Array.from({ length: 6 }, (_, index) => ({
    component_id: `module-${index}`, component_type: 'readonly', label: `Future field ${index}`, device_id: 'future-review', field_key: `future_${index}`,
  })) });
  await open(future);
  await page.locator('.physical-svg').getByText('Future field 5').waitFor();
  await page.getByRole('tab', { name: 'Data Flow' }).click();
  await page.locator('.flow-node', { hasText: 'Future field 5' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.physical-svg').waitFor();
  await page.getByRole('tab', { name: 'Data Flow' }).click();
  await page.locator('.flow-svg').waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('2D browser review passed: UNO, R4, future project, shared selection, simulation, mobile.');
} finally {
  for (const id of ids) await page.request.delete(`${base}/api/projects/${id}`).catch(() => {});
  await browser.close();
}
