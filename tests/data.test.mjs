import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cityPresent, createAtlas, fmtArea, fmtAreaWords, fmtPop, fmtPopulation, fmtYear, loadAtlas, loadRulers, majorChange, mapChanges, matchScore, nearestYear, parseYear, timelineDensity } from '../docs/js/data.js';
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

test('population uses log interpolation; cities start at their first figure and skip long gaps', () => {
  const city = { n: 'Test city', s: [[100, 100], [200, 10000]] };
  const other = { n: 'Large city', s: [[100, 5000], [200, 5000]] };
  const atlas = createAtlas({ cities: [city, other], worldPop: [[100, 100], [200, 10000]] });
  assert.ok(Math.abs(atlas.population(150) - 1000) < 0.000001);
  assert.equal(atlas.population(0), 100);
  assert.equal(atlas.population(300), 10000);
  assert.equal(atlas.population(100), 100);
  assert.deepEqual(atlas.cityEntries(99), [], 'a city does not appear before its first population figure');
  assert.equal(atlas.cityEntries(100).length, 2);
  assert.equal(atlas.cityEntries(250).length, 2, 'last point can extend 50 years later');
  assert.deepEqual(atlas.cityEntries(251), []);
  const gapped = createAtlas({ cities: [{ n: 'Gap city', s: [[-1400, 32000], [1975, 1271000]] }] });
  assert.equal(gapped.cityEntries(-1400).length, 1);
  assert.deepEqual(gapped.cityEntries(1200), [], 'a 3,375-year gap is not interpolated');
  assert.equal(gapped.cityEntries(1975).length, 1, 'an exact figure inside a long gap still shows the city');
  assert.equal(cityPresent([[100, 1], [400, 2]], 250), true, 'a gap of exactly 300 years is interpolated');
  assert.equal(cityPresent([[100, 1], [401, 2]], 250), false);
  assert.equal(cityPresent([], 1), false);
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
  assert.equal(fmtYear(-3400), '3400 BCE');
  assert.equal(fmtYear(1970), '1970 CE');
  assert.equal(fmtYear(117), '117 CE');
  assert.equal(fmtYear(-10000), '10,000 BCE');
  assert.equal(fmtYear(0), '—');
  // The year box displays fmtYear output and parses it back on submit.
  for (const year of [-10000, -3400, -1, 1, 1970, 2024]) assert.equal(parseYear(fmtYear(year)), year);
  assert.equal(fmtArea(1200345), '1.20M km²');
  assert.equal(fmtArea(12345.8), '12,346 km²');
  assert.equal(fmtPop(8e9), '8.00B');
  assert.equal(fmtPop(0), '—');
  assert.equal(fmtAreaWords(2034906.97), '2.03 million km²');
  assert.equal(fmtAreaWords(93317.4), '93,317 km²');
  assert.equal(fmtPopulation(444653984), '444.7 million');
  assert.equal(fmtPopulation(8.09e9), '8.09 billion');
  assert.equal(fmtPopulation(0), '—');
});

test('search ranks names, alternative names and shared word stems', () => {
  assert.equal(matchScore('roman empire', 'roman empire'), 0);
  assert.equal(matchScore('romeo bosque', 'rome'), 1);
  assert.equal(matchScore('prome kingdom', 'rome'), 2);
  assert.equal(matchScore('kingdom of macedon', 'macedon kingdom'), 3);
  assert.equal(matchScore('byzantine empire', 'byzantium'), 3.5, 'six or more letters may match a word stem');
  assert.equal(matchScore('roman empire', 'romes'), Infinity, 'short queries stay literal');
  const atlas = createAtlas({ polities: records, aliases: { roman: ['Rome', 'Imperium Romanum'], cafe: ['Roman Café'] } });
  const result = atlas.search('rome', 20);
  assert.equal(result[0].name, 'Roman Empire');
  assert.equal(result[0].alias, 'Rome', 'the matching alternative name is reported for display');
  assert.equal(atlas.search('roman', 20)[0].alias, null, 'a canonical name match needs no alternative name');
  assert.deepEqual(atlas.search('imperium romanum', 20).map(entry => entry.key), ['roman']);
  assert.equal(atlas.search('', 20).length, 0);
});

test('map changes compare the map in force with the one before it', () => {
  const history = [
    { k: 'old', n: 'Old Kingdom', f: 1, t: 9, a: 100000 },
    { k: 'old', n: 'Old Kingdom', f: 10, t: 19, a: 40000 },
    { k: 'old', n: 'Old Kingdom', f: 20, t: 30, a: 41000 },
    { k: 'gone', n: 'Lost State', f: 1, t: 9, a: 500 },
    { k: 'gone', n: 'Lost State', f: 25, t: 30, a: 600 },
    { k: 'last', n: 'Last State', f: 1, t: 9, a: 700 },
    { k: 'new', n: 'New State', f: 10, t: 30, a: 60000 },
  ];
  const atlas = createAtlas({ polities: history, index: { new: { n: 'New State' } } });
  const years = [1, 10, 20, 25];
  const changes = mapChanges(atlas, years, 15);
  assert.equal(changes.year, 10); assert.equal(changes.previous, 1);
  assert.deepEqual(changes.first.map(item => item.key), ['new']);
  assert.deepEqual(changes.gone.map(item => [item.key, item.returns, item.lastMapped]), [['last', null, 9], ['gone', 25, 9]]);
  assert.deepEqual(changes.changed.map(item => [item.key, item.delta]), [['old', -60000]]);
  assert.equal(majorChange(changes.changed[0]), true);
  assert.equal(majorChange({ from: 40000, delta: 1000 }), false);
  assert.deepEqual(mapChanges(atlas, years, 20).changed, [{ key: 'old', name: 'Old Kingdom', from: 40000, to: 41000, delta: 1000 }]);
  assert.deepEqual(mapChanges(atlas, years, 5), { year: 1, previous: null, first: [], gone: [], changed: [] }, 'the earliest map has nothing to compare');
  assert.equal(mapChanges(atlas, years, 0), null);
});

test('timeline density counts record starts and ends inside the window', () => {
  const counts = timelineDensity([{ f: -3400, t: 9 }, { f: 10, t: 19 }, { f: 500, t: 2024 }], 4, year => (year + 1000) / 4000, -3400, 2024);
  // -3400 is the dataset start and 2025 lies beyond it: neither counts as a change.
  // The remaining starts and ends (10, 10, 20, 500) all fall in the second slice.
  assert.deepEqual(counts, [0, 4, 0, 0]);
});

test('versioned request fingerprints match all published data files', async () => {
  for (const [name, fingerprint] of Object.entries(DATA_VERSIONS)) {
    const bytes = await readFile(new URL(`../docs/data/${name}.json`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 16), fingerprint, name);
  }
  assert.equal(Object.keys(DATA_VERSIONS).length, 9);
});

test('loading exposes the basemap before historical geometry and uses stable URLs', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [], events = [];
  let releaseHistorical;
  const gate = new Promise(resolve => { releaseHistorical = resolve; });
  const fixture = {
    land: { type: 'FeatureCollection', features: [] }, borders: { type: 'MultiLineString', coordinates: [] },
    polities: [], years: [-500, 1], cities: [], polity_index: {}, population: { world: [[1, 100]] },
    rulers: { schemaVersion: 1, sources: {}, polities: {} }, aliases: {},
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
    assert.equal(calls.length, 9);
    await atlas.rulersReady;
    assert.deepEqual(atlas.rulers, fixture.rulers);
    assert.equal(atlas.rulersError, null);
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

test('ruler records failures leave map data available and can be retried separately', async () => {
  const oldFetch = globalThis.fetch;
  const fixture = {
    land: { type: 'FeatureCollection', features: [] }, borders: { type: 'MultiLineString', coordinates: [] },
    polities: [], years: [1], cities: [], polity_index: {}, population: { world: [[1, 100]] },
  };
  globalThis.fetch = async url => {
    const name = new URL(url).pathname.split('/').at(-1).replace('.json', '');
    return name === 'rulers' ? { ok: false, status: 503 } : { ok: true, json: async () => fixture[name] };
  };
  try {
    const atlas = await loadAtlas();
    assert.equal(atlas.population(1), 100);
    await atlas.rulersReady;
    assert.equal(atlas.rulers, null);
    assert.match(atlas.rulersError, /rulers.*503/);
    const details = { schemaVersion: 1, sources: {}, polities: {} };
    globalThis.fetch = async url => {
      assert.match(new URL(url).pathname, /rulers\.json$/);
      return { ok: true, json: async () => details };
    };
    assert.deepEqual(await loadRulers(), details);
  } finally { globalThis.fetch = oldFetch; }
});

test('a delayed ruler download does not block the map and updates its existing atlas when ready', async () => {
  const oldFetch = globalThis.fetch;
  let releaseRulers;
  const gate = new Promise(resolve => { releaseRulers = resolve; });
  const fixture = {
    land: { type: 'FeatureCollection', features: [] }, borders: { type: 'MultiLineString', coordinates: [] },
    polities: records, years: [1], cities: [], polity_index: {}, population: { world: [[1, 100]] },
    rulers: { schemaVersion: 1, sources: { sample: { checks: [] } }, polities: {} },
  };
  const updates = [];
  globalThis.fetch = async url => {
    const name = new URL(url).pathname.split('/').at(-1).replace('.json', '');
    if (name === 'rulers') await gate;
    return { ok: true, json: async () => fixture[name] };
  };
  let watchdog;
  try {
    const loading = loadAtlas({ onRulers: atlas => updates.push(atlas) });
    const atlas = await Promise.race([loading, new Promise((_, reject) => {
      watchdog = setTimeout(() => reject(new Error('Map waited for optional rulers')), 1000);
    })]);
    clearTimeout(watchdog);
    assert.equal(atlas.population(1), 100);
    assert.ok(atlas.search('roman', 1).length, 'map search works before rulers arrive');
    assert.equal(atlas.rulersLoading, true);
    assert.equal(atlas.rulers, null);
    assert.equal(atlas.rulersError, null);
    assert.deepEqual(updates, []);
    releaseRulers();
    assert.equal(await atlas.rulersReady, fixture.rulers);
    assert.equal(atlas.rulersLoading, false);
    assert.equal(atlas.rulers, fixture.rulers);
    assert.deepEqual(updates, [atlas], 'callback receives the same atlas exactly once after settlement');
    assert.ok(Object.isFrozen(atlas.rulers.sources.sample.checks), 'source indexes can reuse immutable evidence');
  } finally {
    clearTimeout(watchdog); releaseRulers(); globalThis.fetch = oldFetch;
  }
});

test('ruler timeout aborts only its request and allows a fresh independent retry', async () => {
  const oldFetch = globalThis.fetch;
  const parent = new AbortController();
  let requestSignal;
  globalThis.fetch = async (_url, { signal }) => {
    requestSignal = signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  };
  try {
    await assert.rejects(loadRulers(parent.signal, { timeoutMs: 10 }), /too long.*retry/);
    assert.equal(requestSignal.aborted, true);
    assert.equal(parent.signal.aborted, false, 'optional timeout never aborts the map controller');
    const details = { sources: {}, polities: {} };
    globalThis.fetch = async (_url, { signal }) => {
      assert.equal(signal.aborted, false);
      return { ok: true, json: async () => details };
    };
    assert.equal(await loadRulers(parent.signal), details);
  } finally { globalThis.fetch = oldFetch; }
});
