import { launchBrowser } from "./browser.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { chooseValue } from './helpers.mjs';

// Point creation tests at the isolated, background-disabled backend on 8011.
const base = process.env.AGENTWIN_TEMPLATE_TEST_URL || 'http://127.0.0.1:8011';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const failures = [];
const created = [];
page.on('pageerror', (error) => failures.push(error.message));
await page.route('**/*', async (route) => {
  // The test port is intentionally outside production's origin allowlist.
  const headers = { ...route.request().headers(), origin: 'http://127.0.0.1:8000' };
  const response = await route.fetch({ headers });
  await route.fulfill({ response });
});
await fs.mkdir('../artifacts/firmware-template-review/screenshots', { recursive: true });
try {
  const catalog = await (await page.request.get(base + '/api/project-templates')).json();
  const supported = catalog.filter(item => item.hardware);
  assert.ok(supported.length > 0, 'No supported Hardware Templates in catalog');
  for (const [id, name, device, fields, baud] of [
    ['arduino_uno_d13_led', 'Template UI UNO', 'ui-uno', ['led_on', 'last_command_id'], 38400],
    ['r4_rf_jamming_detector', 'Template UI R4', 'ui-r4', ['rf_detector_v', 'rf_mean_v', 'rf_std_v', 'jamming_probability_percent', 'jamming_state'], 115200],
  ]) {
    await page.goto(base + '/projects/new');
    await page.getByLabel('Project name', { exact: true }).fill(name);
    assert.equal(await page.getByRole('radio', { name: 'Supported hardware', exact: true }).isChecked(), true);
    await page.getByLabel('Hardware Template', { exact: true }).click();
    const options = page.getByRole('listbox').getByRole('option');
    assert.deepEqual((await options.allTextContents()).sort(), supported.map(item => item.name).sort());
    for (const item of catalog.filter(item => !item.hardware)) {
      assert.equal(await options.filter({ hasText: item.name }).count(), 0, 'Custom preset leaked into Hardware Template dropdown');
    }
    await page.locator(`[role="option"][data-value="${id}"]`).click();
    assert.equal(await page.locator('[aria-label="Project setup progress"] li').count(), 4);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Device ID', { exact: true }).fill(device);
    assert.equal(await page.getByLabel('Serial baud').inputValue(), String(baud));
    assert.equal(await page.getByLabel('Serial baud').isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Add device' }).count(), 0);
    if (id === 'arduino_uno_d13_led') await page.getByLabel('Serial port').fill('COM4');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'Timing and retention' }).waitFor();
    await page.getByLabel('Sample interval (seconds)').fill('2');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'Review configuration' }).waitFor();
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
    const projectId = new URL(page.url()).pathname.split('/').at(-1); created.push(projectId);
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'setup');
    await page.getByText('Saved configuration matches this firmware.', { exact: true }).waitFor();
    const state = await (await page.request.get(base + '/api/projects/' + projectId)).json();
    assert.deepEqual(Object.keys(state.project.graph.fields).sort(), fields.sort());
    assert.equal(state.latest, null);
    const profile = id === 'arduino_uno_d13_led' ? 'arduino-uno-r3' : 'arduino-uno-r4-wifi';
    assert.equal(state.project.graph.components.find(c => c.category === 'controller').visual.model, profile);
    const progress = page.locator('[aria-label="Device onboarding progress"]');
    assert.equal(await progress.locator('li').count(), 5);
    assert.equal(await progress.locator('li[data-complete="true"]').count(), 1);
    assert.equal(state.project.devices[0].baud_rate, baud);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download firmware package' }).click();
    const download = await downloadEvent;
    assert.equal(await download.failure(), null);
    await download.saveAs(`../artifacts/firmware-template-review/${id}-ui.zip`);
    await page.getByRole('button', { name: 'I uploaded this package', exact: true }).waitFor();
    assert.equal(await progress.locator('li[data-complete="true"]').count(), 2);
    await page.reload();
    await page.getByRole('button', { name: 'I uploaded this package', exact: true }).click();
    await page.getByRole('button', { name: 'Undo upload confirmation', exact: true }).waitFor();
    assert.equal(await progress.locator('li[data-complete="true"]').count(), 3);
    await page.getByRole('button', { name: 'Undo upload confirmation', exact: true }).click();
    assert.equal(await progress.locator('li[data-complete="true"]').count(), 2);
    await page.getByRole('button', { name: 'I uploaded this package', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Undo upload confirmation', exact: true }).waitFor();
    assert.equal(await progress.locator('li[data-complete="true"]').count(), 3);
    await chooseValue(page, page.getByLabel('Hardware Template', { exact: true }), id === 'arduino_uno_d13_led' ? 'r4_rf_jamming_detector' : 'arduino_uno_d13_led');
    await page.getByText('Resolve these configuration differences before downloading:', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download firmware package' }).isDisabled(), true);
    assert.equal(await progress.locator('li[data-complete="true"]').count(), 1);
    await chooseValue(page, page.getByLabel('Hardware Template', { exact: true }), id);
    await page.getByText('Saved configuration matches this firmware.', { exact: true }).waitFor();
    for (const [theme, width] of [['dark', 1440], ['light', 1440], ['dark', 390], ['light', 390]]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; localStorage.setItem('agentwin-theme', theme); }, theme);
      await page.waitForTimeout(300); // Let theme transitions settle before visual review.
      await page.screenshot({ path: `../artifacts/firmware-template-review/screenshots/${id}-${theme}-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Horizontal overflow');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('link', { name: 'Open Digital Twin' }).click();
    await page.getByText(/Artwork from Hardware Template configuration .* not hardware detection\./).waitFor();
    await page.screenshot({ path: `../artifacts/firmware-template-review/screenshots/${id}-configured-twin.png`, fullPage: true });
    await page.goto(base + '/projects/' + projectId + '?tab=setup');
    await page.getByRole('button', { name: 'Use suggested artwork in this browser' }).click();
    assert.equal(await page.evaluate(([project, device]) => JSON.parse(localStorage.getItem('agentwin-artwork:' + project + ':' + device)), [projectId, device]), profile);
  }
  await page.goto(base + '/projects/new');
  await page.getByLabel('Project name', { exact: true }).fill('Custom configuration');
  await page.getByRole('radio', { name: 'Custom configuration', exact: true }).check();
  assert.equal(await page.getByLabel('Hardware Template', { exact: true }).count(), 0);
  assert.equal(await page.locator('[aria-label="Project setup progress"] li').count(), 6);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Add device' }).isVisible(), true);
  await page.getByRole('button', { name: 'Add device', exact: true }).click();
  assert.equal(await page.getByLabel('Device ID', { exact: true }).count(), 2);
  assert.equal(await page.getByLabel('Serial baud', { exact: true }).first().isDisabled(), false);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Add component' }).isVisible(), true);
  const componentCount = await page.getByLabel('Label', { exact: true }).count();
  await page.getByRole('button', { name: 'Add component', exact: true }).click();
  assert.equal(await page.getByLabel('Label', { exact: true }).count(), componentCount + 1);
  assert.deepEqual(failures, []);
  console.log('Hardware template onboarding, contract checks, downloads, themes, mobile, and custom configurations, setup records and configured artwork passed.');
} catch (error) {
  await page.screenshot({ path: '../artifacts/firmware-template-review/screenshots/failure.png', fullPage: true });
  console.error(await page.locator('body').innerText(), failures);
  throw error;
} finally {
  for (const id of created) await page.request.delete(base + '/api/projects/' + id);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await browser.close();
}
