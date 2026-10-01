import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAtlas } from '../docs/js/data.js';
import { createSearch } from '../docs/js/search.js';

// Search runs against the published data, so these are regression guards for
// the names a reader is likely to type.
const json = name => JSON.parse(readFileSync(new URL(`../docs/data/${name}.json`, import.meta.url), 'utf8'));
// The app freezes ruler evidence on load, which lets source indexes be reused.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const atlas = createAtlas({ polities: json('polities'), cities: json('cities'), index: json('polity_index'), aliases: json('aliases') });
const rulers = freeze(json('rulers'));
const search = createSearch(atlas);

test('alternative names find the polity a reader means', () => {
  const rome = search('rome', 1200);
  assert.equal(rome.polities[0].name, 'Roman Empire');
  assert.equal(rome.polities[0].alias, 'Rome');
  assert.deepEqual(rome.polities.slice(0, 3).map(entry => entry.name).sort(), ['Roman Empire', 'Roman Kingdom', 'Roman Republic']);
  assert.ok(rome.polities.some(entry => entry.name === 'Prome Kingdom'), 'literal substring matches remain, ranked later');
  assert.equal(search('persia', 1200).polities[0].name, 'Achaemenid Empire');
  assert.ok(search('byzantium', 1200).polities.some(entry => entry.name === 'Byzantine Empire'), 'a shared word stem finds Byzantine Empire');
});

test('places, years and rulers are searchable alongside polities', () => {
  const rome = search('rome', 1200, rulers);
  assert.equal(rome.places[0].city.n, 'Rome');
  assert.equal(rome.places[0].first, -500);
  assert.ok(rome.rulers.some(row => row.claim.name === 'Romeo Bosque'));
  assert.deepEqual(search('1453', 1200).years, [{ type: 'year', year: 1453 }]);
  assert.deepEqual(search('500 BCE', 1200).years, [{ type: 'year', year: -500 }]);
  assert.deepEqual(search('0', 1200).years, [], 'there is no year zero');
  assert.deepEqual(search('9999', 1200).years, [], 'years outside the atlas are not offered');
  const saladin = search('saladin', 1200, rulers);
  assert.equal(saladin.rulers[0].polity, 'Ayyubid Sultanate');
  assert.equal(saladin.rulers[0].key, 'wd:Q180114');
  assert.deepEqual(search('rome', 1200).rulers, [], 'rulers wait for their optional download');
});
