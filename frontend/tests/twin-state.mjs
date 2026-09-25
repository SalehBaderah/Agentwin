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
assert.equal(twin.components[0].transport, undefined);
state.latest = { device: 'a', received: 102, readings: { led_on: true }, seq: 2 };
twin = buildTwinState(state, 103000);
assert.equal(twin.components[0].observed.metrics[0].value, true);
assert.equal(twin.components[0].observed.sequence, 2);
twin = buildTwinState(state, 108000);
assert.equal(twin.components[0].health.freshness, 'aging');
assert.equal(twin.edges[0].activity, 'aging');
twin = buildTwinState(state, 111000);
assert.equal(twin.reportingDevices, 0, 'Cached reporting flags must expire without new snapshots');
assert.equal(twin.edges[0].activity, 'stale');
assert.equal(twin.components[0].observed.metrics[0].isLastKnown, true);
twin = buildTwinState(state, 127000);
assert.equal(twin.components[0].health.freshness, 'unavailable', 'Old observations become unavailable');
assert.equal(twin.components[0].observed.metrics[0].isLastKnown, true);
state.latest = { device: 'b', received: 112, readings: { led_on: false } };
twin = buildTwinState(state, 113000);
assert.equal(twin.components[0].health.freshness, 'stale', 'Another device cannot refresh this component');
assert.equal(twin.reportingDevices, 1);
state.readings = []; state.latest = null;
twin = buildTwinState(state, 114000);
assert.equal(twin.components[0].observed.metrics[0].value, undefined);
assert.equal(twin.freshness, 'unavailable');
state.session.mode = 'simulation';
twin = buildTwinState(state, 114000);
assert.equal(twin.sessionLabel, 'SIMULATION');
state.session.mode = 'replay';
assert.equal(buildTwinState(state, 114000).sessionLabel, 'REPLAY');

const sceneSource = fs.readFileSync(new URL('../src/features/digital-twin/view2d/flowModel.ts', import.meta.url), 'utf8');
const sceneCode = ts.transpileModule(sceneSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildFlowModel } = await import(`data:text/javascript;base64,${Buffer.from(sceneCode).toString('base64')}`);
const genericScene = buildFlowModel(twin);
assert.equal(genericScene.nodes.length, 6);
assert.ok(genericScene.links.length > 0);
state.project.graph.components.push(component('new-future-hardware', 'b', 'unrecognized'));
twin = buildTwinState(state, 114000);
assert.equal(twin.components.at(-1).type, 'generic');
assert.equal(buildFlowModel(twin).nodes.length, 7, 'New configured hardware appears without a renderer change');
state.project.name = 'arduino_uno_d13_led';
state.session.mode = 'live';
twin = buildTwinState(state, 114000);
assert.equal(twin.components.find(item => item.id === 'controller').visualKey, 'arduino-uno');
state.project.name = 'R4 RF Jamming Detector';
assert.equal(buildTwinState(state, 114000).components.find(item => item.id === 'controller').visualKey, 'uno-r4');
console.log('Twin state checks passed: updates, expiry, device isolation, and empty sessions.');
