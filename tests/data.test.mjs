import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createAtlas, fmtArea, fmtPop, fmtYear, loadAtlas, nearestYear, parseYear } from '../docs/js/data.js';
import { DATA_VERSIONS } from '../docs/js/data-version.js';

const records = [
  { k: 'rome', n: 'Roman Republic', f: -500, t: -28, a: 100 },
  { k: 'rome', n: 'Roman Republic', f: -27, t: 5, a: 200 },
  { k: 'roman', n: 'Roman Empire', f: 6, t: 400, a: 1000 },
  { k: 'gap', n: 'Restored State', f: 1, t: 10, a: 10 },
  { k: 'gap', n: 'Restored State', f: 30, t: 40, a: 20 },
  { k: 'cafe', n: 'Café State', f: 10, t: 90, a: 20 },
];

test('historical year entry accepts era notation and rejects ambiguous or invalid years', () => {
  for (const [input, expected] of [
    ['450 BCE', -450], ['44 BC', -44], ['AD 1453', 1453], ['1453 ce', 1453],
    ['-450', -450], ['−450', -450], ['3,400 B.C.E.', -3400], ['BCE 1200', -1200],
    ['1', 1], [2024, 2024], [' 117 A.D. ', 117], ['1 B.C.', -1],
  ]) assert.equal(parseYear(input), expected, String(input));
  for (const input of ['', '0', '0 BCE', 'year 100', '1453.5', '14,53', '2e3', '100 AD BCE', '-20 AD', null, NaN, Infinity]) {
    assert.equal(parseYear(input), null, String(input));
  }
});

test('nearest data-change navigation handles ties, missing years, and dataset edges', () => {
  const years = [-500, -10, 1, 100, 2024];
  assert.equal(nearestYear(years, -900), -500);
  assert.equal(nearestYear(years, 2100), 2024);
  assert.equal(nearestYear(years, 0), 1);
  assert.equal(nearestYear(years, 100), 100);
  assert.equal(nearestYear([-20, -10], -15), -20);
  assert.equal(nearestYear([], 10), null);
  assert.equal(nearestYear(years, NaN), null);
});

test('snapshots preserve inclusive temporal boundaries and paint large territories first', () => {
  const atlas = createAtlas({ polities: records });
  assert.deepEqual(atlas.snapshot(-28).map(record => record.a), [100]);
  assert.deepEqual(atlas.snapshot(-27).map(record => record.a), [200]);
  assert.deepEqual(atlas.snapshot(6).map(record => record.a), [1000, 10]);
  assert.deepEqual(atlas.snapshot(-9000), []);
  assert.deepEqual(atlas.snapshot(2025), []);
  assert.equal(atlas.byKey.get('rome').length, 2);
  assert.equal(records[0].a, 100, 'source records retain their original order');
});

test('snapshot caching reuses recent years and evicts older years with a bounded LRU', () => {
  const atlas = createAtlas({ polities: records });
  const first = atlas.snapshot(-500);
  for (let year = 1; year < 32; year++) atlas.snapshot(year);
  assert.equal(atlas.snapshot(-500), first, 'reading the oldest entry refreshes it');
  atlas.snapshot(32);
  assert.equal(atlas.snapshot(-500), first, 'recently read entry survives an eviction');
  for (let year = 33; year < 66; year++) atlas.snapshot(year);
  assert.notEqual(atlas.snapshot(-500), first, 'old entry is eventually evicted');
});

test('population uses log interpolation and source city extrapolation windows', () => {
  const city = { n: 'Test city', s: [[100, 100], [200, 10000]] };
  const other = { n: 'Large city', s: [[100, 5000], [200, 5000]] };
  const atlas = createAtlas({ cities: [city, other], worldPop: [[100, 100], [200, 10000]] });
  assert.ok(Math.abs(atlas.population(150) - 1000) < 0.000001);
  assert.equal(atlas.population(0), 100);
  assert.equal(atlas.population(300), 10000);
  assert.equal(atlas.population(100), 100);
  assert.deepEqual(atlas.cityEntries(-1), []);
  assert.equal(atlas.cityEntries(0).length, 2, 'first point can extend 100 years earlier');
  assert.equal(atlas.cityEntries(250).length, 2, 'last point can extend 50 years later');
  assert.deepEqual(atlas.cityEntries(251), []);
  const entries = atlas.cityEntries(150);
  assert.equal(entries[0].city.n, 'Large city');
  assert.ok(Math.abs(entries[1].pop - 1000) < 0.000001);
  assert.equal(atlas.cityEntries(150), entries, 'panning at a fixed year reuses city ranking');
  assert.equal(createAtlas().population(1), 0);
  assert.equal(createAtlas({ worldPop: [[0, 0], [100, 100]] }).population(50), 50);
});

test('search covers all eras, folds accents, ranks exact names first, and respects temporal gaps', () => {
  const atlas = createAtlas({ polities: records, index: { rome: { n: 'Roman Republic', first: -500, last: 5, peak_year: -27 } } });
  const result = atlas.search('roman republic', 200);
  assert.equal(result[0].name, 'Roman Republic');
  assert.equal(result[0].active, false, 'historical search is not limited to the current map');
  assert.equal(result[0].peakYear, -27);
  assert.equal(atlas.search('roman', 200)[0].name, 'Roman Empire', 'active matches lead within the same textual rank');
  assert.equal(atlas.search('cafe', 20)[0].name, 'Café State');
  assert.equal(atlas.search('restored', 20)[0].active, false, 'a gap in a lifespan is not an active record');
  assert.equal(atlas.search('restored', 30)[0].active, true);
  assert.deepEqual(atlas.search('no such empire', 30), []);
  assert.equal(atlas.search('roman', 200).filter(entry => entry.key === 'rome').length, 1);
});

test('formatters keep historical notation and compact readable units', () => {
  assert.equal(fmtYear(-3400), '3,400 BCE');
  assert.equal(fmtYear(117), '117 CE');
  assert.equal(fmtYear(0), '—');
  assert.equal(fmtArea(1200345), '1.20M km²');
  assert.equal(fmtArea(12345.8), '12,346 km²');
  assert.equal(fmtPop(8e9), '8.00B');
  assert.equal(fmtPop(0), '—');
});

test('versioned request fingerprints match all published data files', async () => {
  for (const [name, fingerprint] of Object.entries(DATA_VERSIONS)) {
    const bytes = await readFile(new URL(`../docs/data/${name}.json`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), fingerprint, name);
  }
  assert.equal(Object.keys(DATA_VERSIONS).length, 7);
});

test('loading exposes the basemap before historical geometry and uses stable URLs', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [], events = [];
  let releaseHistorical;
  const gate = new Promise(resolve => { releaseHistorical = resolve; });
  const fixture = {
    land: { type: 'FeatureCollection', features: [] }, borders: { type: 'MultiLineString', coordinates: [] },
    polities: [], years: [-500, 1], cities: [], polity_index: {}, population: { world: [[1, 100]] },
  };
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    const name = parsed.pathname.split('/').at(-1).replace('.json', '');
    calls.push(parsed);
    if (name === 'polities') await gate;
    return { ok: true, json: async () => fixture[name] };
  };
  try {
    const loading = loadAtlas({
      onBase: base => { assert.deepEqual(base.land, fixture.land); events.push('base'); releaseHistorical(); },
      onProgress: status => events.push(status.phase),
    });
    const atlas = await loading;
    assert.equal(atlas.population(1), 100);
    assert.ok(events.indexOf('base') < events.indexOf('ready'));
    assert.equal(calls.length, 7);
    for (const url of calls) assert.match(url.searchParams.get('v'), /^[0-9a-f]{16}$/);
  } finally { globalThis.fetch = oldFetch; }
});

test('HTTP errors name the failed resource and allow an explicit retry', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    await assert.rejects(loadAtlas(), /Could not load .*HTTP 503.*retry/);
  } finally { globalThis.fetch = oldFetch; }
});
