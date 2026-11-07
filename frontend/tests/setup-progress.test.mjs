import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupEvidence, readSetupRecord, writeSetupRecord, setupRecordKey, onboardingProgress } from '../src/features/projects/setupProgress.ts';
import { resolveProfile } from '../src/features/digital-twin/physical/profiles.ts';

const project = { id: 'p1', freshness_seconds: 8, graph: { fields: {
  led_on: { device_id: 'uno', data_type: 'boolean', freshness_seconds: 8 },
  voltage: { device_id: 'uno', data_type: 'number', freshness_seconds: 4 },
} } };
const sample = (id, received, overrides = {}) => ({ id, device: 'uno', boot: 'boot-1', seq: id, received, readings: { led_on: false, voltage: 3.3 }, ...overrides });
const state = (readings, mode = 'live') => ({ project, session: { id: 'live-1', mode }, readings, latest: readings.at(-1) ?? null });
const evidence = (snapshot, overrides = {}) => setupEvidence(snapshot, overrides.project ?? project, overrides.device ?? 'uno', ['led_on', 'voltage'], overrides.compatible ?? true, overrides.connected ?? true, overrides.now ?? 100);

test('only fresh complete advancing Live telemetry verifies the contract', () => {
  const result = evidence(state([sample(1, 98), sample(2, 99)]));
  assert.equal(result.reporting, true);
  assert.equal(result.verified, true);
  assert.match(result.note, /not independently verified/);
  assert.equal(evidence(state([sample(2, 99)])).verified, false);
});
test('non-live sessions, other projects/devices and disconnected snapshots cannot verify', () => {
  const samples = [sample(1, 98), sample(2, 99)];
  for (const mode of ['simulation', 'replay']) assert.equal(evidence(state(samples, mode)).reporting, false);
  assert.equal(evidence(state(samples), { project: { ...project, id: 'p2' } }).verified, false);
  assert.equal(evidence(state(samples), { device: 'other' }).reporting, false);
  assert.equal(evidence(state(samples), { connected: false }).reporting, false);
  assert.equal(evidence(state(samples), { compatible: false }).verified, false);
});
test('stale boundaries expire, including per-field freshness and future timestamps', () => {
  const snapshot = state([sample(1, 98), sample(2, 99)]);
  assert.equal(evidence(snapshot, { now: 103 }).verified, false); // older voltage expires
  assert.equal(evidence(snapshot, { now: 108 }).reporting, false);
  assert.equal(evidence(state([sample(1, 102), sample(2, 103)])).reporting, false);
  assert.equal(evidence(state([])).reporting, false);
});
test('duplicates, reboot boundaries, out-of-order or unknown sequences never verify', () => {
  for (const previous of [sample(2, 98), sample(3, 98), sample(1, 98, { boot: 'another-boot' }), sample(1, 98, { seq: undefined }), sample(1, 99)]) {
    assert.equal(evidence(state([previous, sample(2, 99)])).verified, false);
  }
  assert.equal(evidence(state([sample(1, 98), sample(2, 99, { boot: undefined })])).verified, false);
});
test('missing/null/mistyped measurements cannot verify, false and zero are valid', () => {
  for (const readings of [{ led_on: false }, { led_on: 0, voltage: 3 }, { led_on: null, voltage: 3 }, { led_on: false, voltage: NaN }]) {
    assert.equal(evidence(state([sample(1, 98), sample(2, 99, { readings })])).verified, false);
  }
  assert.equal(evidence(state([sample(1, 98), sample(2, 99, { readings: { led_on: false, voltage: 0 } })])).verified, true);
  assert.equal(evidence(state([sample(1, 98, { device: 'other' }), sample(2, 99)])).verified, false);
});
test('setup action records are scoped, validated and invalidated by firmware/config changes', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const key = setupRecordKey('p1', 'uno', 'template');
  writeSetupRecord(storage, key, 'version1-config1', { downloadedAt: 1, flashedAt: 2 });
  assert.deepEqual(readSetupRecord(storage, key, 'version1-config1'), { downloadedAt: 1, flashedAt: 2 });
  assert.deepEqual(readSetupRecord(storage, key, 'version2-config1'), {});
  assert.deepEqual(readSetupRecord(storage, setupRecordKey('p1', 'other', 'template'), 'version1-config1'), {});
  writeSetupRecord(storage, key, 'version1-config1', { downloadedAt: 3 });
  assert.deepEqual(readSetupRecord(storage, key, 'version1-config1'), { downloadedAt: 3 });
  for (const value of ['broken', 'null', '{"contract":"version1-config1","downloadedAt":"yes","flashedAt":9}', '{"contract":"version1-config1","downloadedAt":4,"flashedAt":3}']) {
    values.set(key, value);
    assert.equal(readSetupRecord(storage, key, 'version1-config1').flashedAt, undefined);
  }
  assert.deepEqual(readSetupRecord({ getItem: () => { throw Error('unavailable'); } }, key, ''), {});
});
test('categorical telemetry verifies type, never an assumed normal/healthy state', () => {
  const categorical = { ...project, graph: { fields: { state: { device_id: 'uno', data_type: 'categorical', freshness_seconds: 4 } } } };
  const snapshot = { ...state([sample(1, 98, { readings: { state: 'attack' } }), sample(2, 99, { readings: { state: 'attack' } })]), project: categorical };
  assert.equal(setupEvidence(snapshot, categorical, 'uno', ['state'], true, true, 100).verified, true);
  snapshot.readings[1].readings.state = null;
  assert.equal(setupEvidence(snapshot, categorical, 'uno', ['state'], true, true, 100).verified, false);
  assert.equal(evidence(state([])).verified, false, 'new empty session must not retain previous evidence');
});
test('configured unknown profile falls back; local artwork keeps precedence', () => {
  assert.equal(resolveProfile(undefined, 'future-board').profile.id, 'generic');
  assert.equal(resolveProfile(undefined, 'future-board').unknown, true);
  assert.equal(resolveProfile('arduino-uno-r3', 'arduino-uno-r4-wifi').profile.id, 'arduino-uno-r3');
});

test('onboarding stages preserve independent evidence and identify the first unfinished stage', () => {
  const result = onboardingProgress(true, {}, { reporting: true, verified: true });
  assert.deepEqual(result.steps.map(({ label }) => label), [
    'Configured', 'Firmware downloaded', 'Upload confirmed', 'Reporting', 'Telemetry verified',
  ]);
  assert.deepEqual(result.steps.map(({ id }) => id), ['configured', 'downloaded', 'uploaded', 'reporting', 'verified']);
  assert.deepEqual(result.steps.map(({ done }) => done), [true, false, false, true, true]);
  assert.equal(result.complete, false, 'fresh telemetry cannot invent browser download/upload records');
  assert.equal(result.currentIndex, 1);
  assert.equal(result.status, 'Telemetry verified', 'status describes latest confirmed evidence, not the pending next step');
});

test('configured and operator-confirmed progress stops at its next missing evidence', () => {
  const waiting = { reporting: false, verified: false };
  const configured = onboardingProgress(true, {}, waiting);
  assert.equal(configured.status, 'Configured');
  assert.equal(configured.currentIndex, 1);
  assert.equal(configured.complete, false);
  const downloaded = onboardingProgress(true, { downloadedAt: 98 }, waiting);
  assert.equal(downloaded.status, 'Firmware downloaded');
  assert.equal(downloaded.currentIndex, 2);
  const uploaded = onboardingProgress(true, { downloadedAt: 98, flashedAt: 99 }, waiting);
  assert.deepEqual(uploaded.steps.map(({ done }) => done), [true, true, true, false, false]);
  assert.equal(uploaded.status, 'Upload confirmed');
  assert.equal(uploaded.currentIndex, 3);
});

test('reporting alone does not complete onboarding or telemetry verification', () => {
  const result = onboardingProgress(true, { downloadedAt: 98, flashedAt: 99 }, { reporting: true, verified: false });
  assert.deepEqual(result.steps.map(({ done }) => done), [true, true, true, true, false]);
  assert.equal(result.complete, false);
  assert.equal(result.currentIndex, 4);
  assert.equal(result.status, 'Reporting');
});

test('onboarding completes only when all five stages have evidence', () => {
  const result = onboardingProgress(true, { downloadedAt: 98, flashedAt: 99 }, { reporting: true, verified: true });
  assert.equal(result.steps.every(({ done }) => done), true);
  assert.equal(result.complete, true);
  assert.equal(result.currentIndex, 4);
  assert.equal(result.status, 'Telemetry verified');
});

test('stale, disconnected and non-Live evidence reopens completed onboarding', () => {
  const snapshot = state([sample(1, 98), sample(2, 99)]);
  const record = { downloadedAt: 90, flashedAt: 91 };
  assert.equal(onboardingProgress(true, record, evidence(snapshot)).complete, true);
  const partialExpiry = onboardingProgress(true, record, evidence(snapshot, { now: 103 }));
  assert.deepEqual(partialExpiry.steps.map(({ done }) => done), [true, true, true, true, false]);
  assert.equal(partialExpiry.complete, false);
  assert.equal(partialExpiry.currentIndex, 4);
  assert.equal(partialExpiry.status, 'Reporting');
  for (const result of [
    evidence(snapshot, { now: 108 }),
    evidence(snapshot, { connected: false }),
    evidence(state(snapshot.readings, 'replay')),
    evidence(state(snapshot.readings, 'simulation')),
    evidence(state([])),
  ]) {
    const progress = onboardingProgress(true, record, result);
    assert.deepEqual(progress.steps.map(({ done }) => done), [true, true, true, false, false]);
    assert.equal(progress.complete, false);
    assert.equal(progress.currentIndex, 3);
    assert.equal(progress.status, 'Upload confirmed');
  }
});

test('no configured device cannot inherit onboarding evidence', () => {
  const empty = onboardingProgress(false, {}, { reporting: false, verified: false });
  assert.deepEqual(empty.steps.map(({ done }) => done), [false, false, false, false, false]);
  assert.equal(empty.status, 'Configuration required');
  assert.equal(empty.currentIndex, 0);
  assert.equal(empty.complete, false);
  const later = onboardingProgress(false, { downloadedAt: 98, flashedAt: 99 }, { reporting: true, verified: true });
  assert.deepEqual(later.steps.map(({ done }) => done), [false, false, false, false, false]);
  assert.equal(later.complete, false);
  assert.equal(later.currentIndex, 0);
  assert.equal(later.status, 'Configuration required');
});

test('telemetry verification stage cannot complete without current reporting evidence', () => {
  const result = onboardingProgress(true, { downloadedAt: 98, flashedAt: 99 }, { reporting: false, verified: true });
  assert.equal(result.steps[4].done, false);
  assert.equal(result.complete, false);
  assert.equal(result.currentIndex, 3);
  assert.equal(result.status, 'Upload confirmed');
});
