import { launchBrowser } from "./browser.mjs";
import { expect } from "@playwright/test";

const base = process.env.AGENTWIN_TEST_URL || 'http://127.0.0.1:5176';
const backend = process.env.AGENTWIN_BACKEND_URL || 'http://127.0.0.1:8000';
const response = await fetch(`${backend}/api/projects`);
if (!response.ok) throw new Error('A running backend is required for read-only fixture data.');
const snapshots = await response.json();
const seed = snapshots.find(state => state.project.graph.components.some(component => component.controls?.length));
if (!seed) throw new Error('A configured control is required for the Win regression fixture.');
const fixtures = {};
for (const letter of ['a', 'b']) {
  const state = structuredClone(seed);
  state.project.id = `fixture-${letter}`;
  state.project.name = `Fixture ${letter.toUpperCase()}`;
  state.session = { ...state.session, id: `live-${letter}`, mode: 'live' };
  state.sessions = [state.session, { ...state.session, id: `replay-${letter}`, mode: 'replay' }];
  state.actions = [];
  state.server_time = Date.now() / 1000;
  state.devices = state.devices.map(device => ({ ...device, online: true, reporting: true }));
  fixtures[state.project.id] = state;
}
const component = fixtures['fixture-a'].project.graph.components.find(item => item.controls?.length);
const control = component.controls[0];
const expected = fixtures['fixture-a'].project.graph.fields[control.expected.field];
const now = Date.now() / 1000;
function action(id, value, created, status = 'awaiting_confirmation') {
  return { id, target: component.id, action: `${control.action}:${value}`, status, created,
    proposal: { id, status, component_id: component.id, device_id: expected.device_id,
      action: control.action, value, label: component.name, control_label: control.label, expires_at: now + 120 } };
}
const oldDraft = action('older-draft', true, now - 30);
const newDraft = action('newer-draft', false, now - 10);
fixtures['fixture-a'].actions = [newDraft, oldDraft];
const answer = (finding, proposal) => ({ available: true, source: 'controller', finding,
  uncertainty: 'Fixture response only.', next_step: 'No hardware is contacted.', evidence: [], evidence_ids: [],
  ...(proposal ? { control_proposal: proposal } : {}) });
const holds = new Map();
const requests = [];
let holdGet = false;
let delayedSnapshot;
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const errors = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await context.addInitScript(() => {
  localStorage.setItem('agentwin-collapsed', 'false');
  window.fixtureSockets = [];
  window.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 1; window.fixtureSockets.push(this); }
    open() { this.onopen?.({}); }
    snapshot(state) { this.onmessage?.({ data: JSON.stringify({ type: 'project_snapshot', state }) }); }
    close() { this.readyState = 3; this.onclose?.({}); }
  };
});
await context.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  requests.push(`${request.method()} ${url.pathname}${url.search}`);
  const projectId = url.pathname.match(/^\/api\/projects\/(fixture-[ab])(?:\/|$)/)?.[1];
  if (!projectId) return route.abort();
  if (request.method() === 'GET' && url.pathname === `/api/projects/${projectId}`) {
    const state = structuredClone(fixtures[projectId]);
    const sessionId = url.searchParams.get('session');
    if (sessionId) {
      const session = state.sessions.find(item => item.id === sessionId);
      if (!session) return route.fulfill({ status: 400, json: { detail: 'Fixture session does not belong to this project.' } });
      state.session = session;
      if (session.mode !== 'live') state.actions = [];
    }
    if (holdGet) {
      holdGet = false;
      delayedSnapshot = { ...state, project: { ...state.project, name: 'Obsolete snapshot' } };
      await new Promise(resolve => holds.set('get', resolve));
      return route.fulfill({ json: delayedSnapshot });
    }
    return route.fulfill({ json: state });
  }
  if (url.pathname.endsWith('/agent') && request.method() === 'POST') {
    const { question } = request.postDataJSON();
    if (question.startsWith('slow')) {
      await new Promise(resolve => holds.set(question, resolve));
      return route.fulfill({ json: answer('Old context response') });
    }
    if (question === 'reuse older draft') {
      // Response can be older than the refreshed snapshot; snapshot status wins.
      return route.fulfill({ json: answer('Reused draft', oldDraft.proposal) });
    }
    const next = action('fresh-draft', true, now + 1);
    fixtures[projectId].actions.unshift(next);
    return route.fulfill({ json: answer('New fixture draft', next.proposal) });
  }
  if (url.pathname.endsWith('/confirm') && request.method() === 'POST') {
    return route.fulfill({ status: 400, json: { detail: 'Old command fixture error' } });
  }
  return route.abort();
});
const send = async question => {
  await page.getByRole('textbox', { name: 'Ask Win about this system' }).fill(question);
  await page.getByRole('button', { name: 'Send question to Win' }).click();
};
const release = name => { const resolve = holds.get(name); holds.delete(name); resolve(); };
const current = (name, mode = 'live') => expect(page.getByTestId('active-context')).toHaveText(`fixture-${name}:${mode}`);
const heading = name => expect(page.getByRole('heading', { name: `Fixture ${name.toUpperCase()}`, exact: true })).toBeVisible();
const openSnapshot = async state => page.evaluate(snapshot => window.fixtureSockets.at(-1).snapshot(snapshot), state);
try {
  await page.goto(`${base}/tests/agent-context-harness.html`);
  await heading('a');
  await send('slow project request');
  await expect.poll(() => holds.has('slow project request')).toBe(true);
  await page.getByRole('link', { name: 'Fixture B', exact: true }).click();
  await heading('b');
  const beforeRelease = requests.filter(item => item === 'GET /api/projects/fixture-a').length;
  release('slow project request');
  await expect(page.getByRole('button', { name: 'Send question to Win' })).toBeDisabled();
  await page.waitForTimeout(150);
  expect(requests.filter(item => item === 'GET /api/projects/fixture-a').length).toBe(beforeRelease);
  await current('b');
  await heading('b');

  await page.getByRole('link', { name: 'Fixture A', exact: true }).click();
  await heading('a');
  await send('slow session request');
  await expect.poll(() => holds.has('slow session request')).toBe(true);
  await page.getByRole('combobox', { name: 'Session', exact: true }).click();
  await page.getByRole('option', { name: /^replay/ }).click();
  await current('a', 'replay');
  const beforeSessionRelease = requests.filter(item => item === 'GET /api/projects/fixture-a').length;
  release('slow session request');
  await page.waitForTimeout(150);
  expect(requests.filter(item => item === 'GET /api/projects/fixture-a').length).toBe(beforeSessionRelease);
  await current('a', 'replay');
  // A selected session must not carry over to another project.
  await page.getByRole('link', { name: 'Fixture B', exact: true }).click();
  await heading('b');
  await current('b');
  expect(requests.some(item => item.startsWith('GET /api/projects/fixture-b?session=replay-a'))).toBe(false);

  await page.getByRole('link', { name: 'Fixture A', exact: true }).click();
  await page.getByRole('combobox', { name: 'Session', exact: true }).click();
  await page.getByRole('option', { name: /^live/ }).click();
  await current('a');
  holdGet = true;
  await page.evaluate(() => window.fixtureSockets.at(-1).open());
  await expect.poll(() => holds.has('get')).toBe(true);
  const oldSocketIndex = await page.evaluate(() => window.fixtureSockets.length - 1);
  await page.getByRole('link', { name: 'Fixture B', exact: true }).click();
  await heading('b');
  // Return to A before replying to prove an older A request cannot win a new A context.
  await page.getByRole('link', { name: 'Fixture A', exact: true }).click();
  await heading('a');
  release('get');
  await page.waitForTimeout(150);
  await heading('a');
  await expect(page.getByText('Obsolete snapshot', { exact: true })).toHaveCount(0);
  await page.evaluate(({ index, snapshot }) => window.fixtureSockets[index].snapshot(snapshot), { index: oldSocketIndex, snapshot: delayedSnapshot });
  await heading('a');
  await openSnapshot(fixtures['fixture-b']);
  await heading('a');
  await openSnapshot({ ...fixtures['fixture-a'], session: fixtures['fixture-a'].sessions[1] });
  await current('a');

  await page.getByRole('button', { name: 'Confirm & send' }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Old command fixture error' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Win project assistant' }).getByText('Old command fixture error', { exact: true })).toHaveCount(0);
  await send('new after clear');
  await expect(page.getByRole('button', { name: 'Confirm & send' })).toBeVisible();
  await expect(page.getByText('Old command fixture error', { exact: true })).toHaveCount(0);

  // Restore two visible commands in a fresh browser-scoped session.
  await page.getByRole('combobox', { name: 'Session', exact: true }).click();
  await page.getByRole('option', { name: /^replay/ }).click();
  await current('a', 'replay');
  await page.evaluate(() => localStorage.removeItem('agentwin-chat-cleared:fixture-a:live-a'));
  fixtures['fixture-a'].actions = [newDraft, { ...oldDraft, status: 'completed', proposal: { ...oldDraft.proposal, status: 'completed' } }];
  await page.getByRole('combobox', { name: 'Session', exact: true }).click();
  await page.getByRole('option', { name: /^live/ }).click();
  await current('a');
  await send('reuse older draft');
  const commands = page.getByRole('region', { name: 'Win project assistant' }).locator('section[aria-label="Win device commands"]');
  await expect(commands.locator('[data-slot="collapsible"]').first()).toContainText('completed');
  await expect(commands.locator('[data-slot="collapsible"]').first()).toContainText(`${control.label}: On`);
  await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
  await expect(commands).toHaveCount(0);
  await send('reuse older draft');
  await expect(commands.locator('[data-slot="collapsible"]').first()).toContainText('completed');
  await expect(commands.getByRole('button', { name: /Earlier commands/ })).toHaveCount(0);
  const hidden = await page.evaluate(() => JSON.parse(localStorage.getItem('agentwin-chat-cleared:fixture-a:live-a')));
  expect(hidden).toContain('newer-draft');
  expect(hidden).not.toContain('older-draft');
  expect(errors).toEqual([]);
  console.log('Win context regression passed: delayed agent/HTTP replies, closed and mismatched WebSockets, project-owned sessions, clear-chat errors, reused-draft visibility/ordering and authoritative status. All API writes were mocked; no hardware commands were sent.');
} catch (error) {
  console.error({ errors, requests, body: (await page.locator('body').innerText()).slice(0, 1800) });
  throw error;
} finally {
  for (const resolve of holds.values()) resolve();
  await browser.close();
}
