import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandAcknowledgementModel, isCommandAcknowledgement } from '../src/features/workspace/commandAcknowledgementModel.ts';

const fixture = ({ readings = [], actions = [], components, capabilities = [], fresh = false } = {}) => ({
  project: { graph: {
    fields: { ack: { label: 'Acknowledged command', device_id: 'device-a' }, arbitrary_id: { data_type: 'categorical' } },
    components: components ?? [{ id: 'lamp', controls: [{ expected: { field: 'state', command_field: 'ack' } }] }],
    capabilities,
  } },
  readings,
  actions,
  field_status: { ack: { fresh, received: readings.at(-1)?.received ?? null } },
});
const reading = (id, commandId, device = 'device-a') => ({ id, device, received: id, readings: { ack: commandId } });

test('confirmation metadata identifies command IDs without project or field-name rules', () => {
  assert.equal(isCommandAcknowledgement(fixture(), 'ack'), true);
  assert.equal(isCommandAcknowledgement(fixture(), 'arbitrary_id'), false);
  const state = fixture({ components: [], capabilities: [{ component_id: 'lamp', expected: { command_field: 'arbitrary_id' } }] });
  assert.equal(isCommandAcknowledgement(state, 'arbitrary_id'), true);
  assert.equal(isCommandAcknowledgement(fixture({ components: [], capabilities: [{ expected: null }, { expected: 'ack' }] }), 'ack'), false);
});

test('the latest explicit null clears an earlier acknowledgement', () => {
  const model = commandAcknowledgementModel(fixture({ readings: [reading(1, 'old-command'), reading(2, null)], fresh: true }), 'ack');
  assert.equal(model.commandId, null);
  assert.equal(model.latest.received, 2);
  assert.equal(model.fresh, true);
});

test('acknowledgement IDs do not imply completion without an existing matching action', () => {
  const model = commandAcknowledgementModel(fixture({ readings: [reading(1, 'command')] }), 'ack');
  assert.equal(model.commandId, 'command');
  assert.equal(model.action, undefined);
  const requested = { id: 'command', target: 'lamp', status: 'requested' };
  assert.equal(commandAcknowledgementModel(fixture({ readings: [reading(1, 'command')], actions: [requested] }), 'ack').action.status, 'requested');
});

test('device and component boundaries reject unrelated evidence', () => {
  const state = fixture({ readings: [reading(1, 'own-command'), reading(2, 'other-command', 'device-b')], actions: [{ id: 'own-command', target: 'other-lamp', status: 'completed' }], fresh: true });
  const model = commandAcknowledgementModel(state, 'ack');
  assert.equal(model.commandId, 'own-command');
  assert.equal(model.action, undefined);
  assert.equal(model.fresh, false);
});

test('empty selected sessions cannot inherit the global latest acknowledgement', () => {
  const state = { ...fixture(), latest: reading(1, 'another-session') };
  assert.equal(commandAcknowledgementModel(state, 'ack').commandId, null);
  assert.equal(commandAcknowledgementModel(state, 'ack').latest, undefined);
});

test('capability-only targets can resolve the existing backend action status', () => {
  const state = fixture({ components: [], capabilities: [{ component_id: 'lamp', expected: { command_field: 'ack' } }], readings: [reading(1, 'command')], actions: [{ id: 'command', target: 'lamp', status: 'completed' }] });
  assert.equal(commandAcknowledgementModel(state, 'ack').action.status, 'completed');
});
