import test from 'node:test';
import assert from 'node:assert/strict';
import { yearToPosition, positionToYear, timelineWindow, readHash, writeHash } from '../docs/js/state.js';

test('timeline is monotonic and round-trips ancient and recent years', () => {
  let previous = -1;
  for (let year = -3400; year <= 2024; year += 7) {
    const position = yearToPosition(year);
    assert.ok(position >= previous);
    assert.ok(Math.abs(positionToYear(position) - year) < 1e-8);
    previous = position;
  }
  assert.equal(yearToPosition(-3400), 0);
  assert.equal(yearToPosition(2024), 1);
  assert.equal(positionToYear(-1), -3400);
  assert.equal(positionToYear(2), 2024);
});

test('focused time windows maintain width at both dataset boundaries', () => {
  assert.deepEqual(timelineWindow(-3400, '100', -3400, 2024), [-3400, -3300]);
  assert.deepEqual(timelineWindow(2024, '100', -3400, 2024), [1924, 2024]);
  assert.deepEqual(timelineWindow(117, '100', -3400, 2024), [67, 167]);
  assert.deepEqual(timelineWindow(-3400, 'all', -3400, 2024), [-3400, 2024]);
});

test('shared state safely defaults malformed numeric and enum fields', () => {
  const state = readHash('#year=NaN&zoom=Infinity&lat=hello&scope=-1&borders=bad&view=unknown');
  assert.equal(state.year, -450); assert.equal(state.zoom, 1);
  assert.deepEqual(state.center, [0, 0]); assert.equal(state.scope, 'all');
  assert.equal(state.projection, 'flat'); assert.equal(state.borders, 'off');
  assert.equal(readHash('#year=0').year, 1);
  assert.equal(readHash('#year=9999').year, 2024);
  assert.equal(readHash('#year=').year, -450);
});

test('shared camera and selected polity survive encoded URL round-trip', () => {
  const state = { year: -513, selected: 'nm:test & polity/é', projection: 'globe', borders: 'over', cities: false, labels: false, scope: '100' };
  const view = { zoom: 2.5, center: [36.23, 28.1], rotation: [-36.23, -28.1] };
  const decoded = readHash(writeHash(state, view));
  for (const key of Object.keys(state)) assert.equal(decoded[key], state[key]);
  assert.equal(decoded.zoom, view.zoom);
  assert.deepEqual(decoded.center, view.center);
  assert.deepEqual(decoded.rotation, view.rotation);
});
