import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.AGENTWIN_TEST_URL || 'http://127.0.0.1:8000';
const browser = await chromium.launch({ executablePath: process.env.AGENTWIN_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
fs.mkdirSync('../artifacts/readings', { recursive: true });
try {
  const states = await (await page.request.get(`${base}/api/projects`)).json();
  await page.goto(base);
  for (const state of states) {
    await page.locator('#analytics-project').click();
    await page.getByRole('option', { name: state.project.name, exact: true }).click();
    for (const [key, metric] of Object.entries(state.project.graph.fields).filter(([key]) => !key.includes('command_id'))) {
      await page.locator('#analytics-metric').click();
      await page.getByRole('option', { name: metric.label, exact: true }).click();
      const card = page.getByRole('article', { name: `${metric.label} reading`, exact: true });
      await expect(card).toBeVisible();
      if (metric.data_type === 'boolean' && state.readings.some(r => typeof r.readings[key] === 'boolean')) {
        await expect(card.getByRole('heading', {name:'On / Off history',exact:true})).toBeVisible();
        await expect(card.getByRole('group', { name: 'Stepped On and Off history. Gaps have no reported state.' })).toBeVisible();
        await expect(card.locator('.recharts-wrapper')).toHaveCount(0);
        await card.getByRole('combobox',{name:'State history window'}).selectOption('all');
        await card.getByRole('combobox',{name:'State history window'}).selectOption('recent');
      }
      if (metric.data_type === 'categorical' && state.readings.some(r => typeof r.readings[key] === 'string')) await expect(card.getByRole('heading', { name: 'State time share', exact: true })).toBeVisible();
    }
  }
  await page.locator('#analytics-window').click();
  await page.getByRole('option', { name: 'Latest 90', exact: true }).click();
  await expect(page.locator('#analytics-window')).toHaveAttribute('data-value', '90');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: `../artifacts/readings/overview-${theme}-${width}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    }
  }
  for (const [index, state] of states.entries()) {
    await page.goto(`${base}/projects/${state.project.id}?tab=overview`);
    for (const [key, metric] of Object.entries(state.project.graph.fields).filter(([key, metric]) => metric.data_type !== 'number' && !key.includes('command_id'))) {
      const card = page.getByRole('article', { name: `${metric.label} reading`, exact: true });
      await expect(card).toBeVisible();
      if (metric.data_type === 'boolean' && state.readings.some(r => typeof r.readings[key] === 'boolean')) await expect(card.getByRole('heading', { name: 'On / Off history', exact: true })).toBeVisible();
      if (metric.data_type === 'categorical' && state.readings.some(r => typeof r.readings[key] === 'string')) await expect(card.getByRole('heading', { name: 'State time share', exact: true })).toBeVisible();
    }
    await page.goto(`${base}/projects/${state.project.id}?tab=readings`);
    await expect(page.getByRole('heading', { name: 'Live readings', exact: true })).toBeVisible();
    await expect(page.locator('article[aria-label$=" reading"]')).toHaveCount(Object.keys(state.project.graph.fields).length);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.screenshot({ path: `../artifacts/readings/${index}-${theme}-${width}.png`, fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      }
    }
  }
  expect(errors).toEqual([]);
  console.log(`Reviewed ${states.length} projects in dark/light at desktop/mobile widths; no overflow or runtime errors.`);
} finally { await browser.close(); }
