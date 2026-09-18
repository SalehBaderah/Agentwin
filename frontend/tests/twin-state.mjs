import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/features/digital-twin/adapter/buildTwinState.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildTwinState } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const component = (id, device, category) => ({ id, name: id, category, type: category, configuration: { device_id: device } });
const state = {
  project: { freshness_seconds: 8, devices: [{ id: 'a' }, { id: 'b' }], graph: {
    fields: { led_on: { component_id: 'led', device_id: 'a', precision: 0, freshness_seconds: 8 } },
    components: [component('led', 'a', 'actuator'), component('controller', 'a', 'controller'), component('usb', 'a', 'gateway'), component('other', 'b', 'controller')],
    edges: [{ id: 'data', source: 'controller', target: 'usb', category: 'data' }],
  } },
  session: { mode: 'live' }, devices: [{ id: 'a', reporting: true }, { id: 'b', reporting: true }],
  readings: [{ device: 'a', received: 100, readings: { led_on: false }, seq: 1 }],
  latest: null, actions: [], events: [],
};
let twin = buildTwinState(state, 101000);
assert.equal(twin.components[0].observed.metrics[0].value, false);
assert.equal(twin.reportingDevices, 1);
assert.equal(twin.edges[0].activity, 'fresh');
state.latest = { device: 'a', received: 102, readings: { led_on: true }, seq: 2 };
twin = buildTwinState(state, 103000);
assert.equal(twin.components[0].observed.metrics[0].value, true);
assert.equal(twin.components[0].observed.sequence, 2);
twin = buildTwinState(state, 111000);
assert.equal(twin.reportingDevices, 0, 'Cached reporting flags must expire without new snapshots');
assert.equal(twin.edges[0].activity, 'stale');
assert.equal(twin.components[0].observed.metrics[0].isLastKnown, true);
state.latest = { device: 'b', received: 112, readings: { led_on: false } };
twin = buildTwinState(state, 113000);
assert.equal(twin.components[0].health.freshness, 'stale', 'Another device cannot refresh this component');
assert.equal(twin.reportingDevices, 1);
state.readings = []; state.latest = null;
twin = buildTwinState(state, 114000);
assert.equal(twin.components[0].observed.metrics[0].value, undefined);
assert.equal(twin.freshness, 'unavailable');
console.log('Twin state checks passed: updates, expiry, device isolation, and empty sessions.');
