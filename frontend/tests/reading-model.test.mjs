import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingModel } from '../src/features/workspace/readingModel.ts';

const fixture = (metric, values) => ({
  project: { freshness_seconds: 5, graph: { fields: { sensor: { label: 'Sensor', unit: '', data_type: 'number', ...metric } } } },
  readings: values.map((value, i) => ({ id: i, received: i === 3 ? 20 : i + 1, readings: { sensor: value } })),
});
test('continuous integers and ADC counts remain continuous', () => {
  assert.equal(readingModel(fixture({ unit: 'count' }, [0, 1]), 'sensor').kind, 'continuous');
});
test('declared boolean states are stepped, with missing values preserved', () => {
  const model = readingModel(fixture({ data_type: 'boolean' }, [false, null, true]), 'sensor');
  assert.equal(model.kind, 'state');
  assert.deepEqual(model.rows.map(row => row.value), [0, null, 1]);
  assert.deepEqual(model.range, [0, 1]);
});
test('event semantics choose bars; categorical fields stay categorical', () => {
  assert.equal(readingModel(fixture({ label: 'Packet count' }, [1, 2]), 'sensor').kind, 'count');
  assert.equal(readingModel(fixture({ data_type: 'categorical' }, ['ready']), 'sensor').kind, 'category');
});
test('percent and probability ranges come from semantics', () => {
  assert.deepEqual(readingModel(fixture({ unit: '%' }, [10, 30]), 'sensor').range, [0, 100]);
  assert.deepEqual(readingModel(fixture({ label: 'Probability' }, [0.2, 0.6]), 'sensor').range, [0, 1]);
  assert.equal(readingModel(fixture({}, [0.2, 0.6]), 'sensor').range, undefined);
});
test('invalid samples and long reporting gaps are never connected or averaged', () => {
  const model = readingModel(fixture({}, [2, null, NaN, 8]), 'sensor');
  assert.deepEqual(model.numbers, [2, 8]);
  assert.equal(model.rows.at(-2).value, null);
  assert.equal(model.latest.received, 20);
});
test('empty sessions cannot inherit another session value', () => {
  assert.equal(readingModel(fixture({}, []), 'sensor').latest, undefined);
});
test('categorical distribution counts valid observations without inferring durations', () => {
  const model = readingModel(fixture({ data_type: 'categorical' }, ['normal', null, 'attack', 'normal']), 'sensor');
  assert.equal(model.count, 3);
  assert.deepEqual(model.categories.map(({ label, count }) => ({ label, count })), [{ label: 'normal', count: 2 }, { label: 'attack', count: 1 }]);
  assert.equal(model.categories[0].percent, 2 / 3 * 100);
  assert.deepEqual(readingModel(fixture({ data_type: 'categorical' }, []), 'sensor').categories, []);
});
