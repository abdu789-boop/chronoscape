import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRuler, getRulers, validateRulers } from '../docs/js/rulers.js';

// Synthetic records exercise evidence comparisons. They are not historical data.
const polityKey = 'nm:synthetic';
const index = { [polityKey]: { n: 'Synthetic polity', first: -5, last: 20 }, _span: [-3400, 2024] };
const observed = overrides => ({ personKey: 'person:one', polityKey, role: 'Sovereign', from: -3, to: 2, precision: 'year', calendar: 'historical', ...overrides });

function addPair(sources, left, right, facts = observed(), suffix = '') {
  for (const id of [left, right]) sources[id] ||= { title: `Synthetic publication ${id}`, url: `https://example.org/${id}`, lineage: `independent-research:${id}`, admission: 'passed', kind: 'scholarly', checks: [] };
  const records = Object.fromEntries([left, right].map(id => [id, { id: `${id}:record${suffix}`, locator: `${id}:table1:row${suffix || '1'}` }]));
  for (const [id, other] of [[left, right], [right, left]]) {
    sources[id].checks.push({ sourceRecordId: records[id].id, locator: records[id].locator, againstSourceId: other, againstRecordId: records[other].id, againstLocator: records[other].locator, outcome: 'matched', observed: { ...facts }, againstObserved: { ...facts } });
  }
  return [left, right].map(id => ({ sourceId: id, sourceRecordId: records[id].id, locator: records[id].locator, ...facts }));
}

function fixture(facts = observed()) {
  const sources = {}, assertions = addPair(sources, 'a', 'b', facts);
  const claim = { id: 'synthetic:reign1', name: 'Synthetic Ruler', ...facts, assertions };
  const data = { schemaVersion: 1, sources, polities: { [polityKey]: { name: 'Synthetic polity', scope: 'Sovereigns of the synthetic polity', coverage: 'partial', note: 'Synthetic test evidence only.', rulers: [claim], sourceIds: ['a', 'b'], research: { status: 'reviewed' } } } };
  return { data, sources, claim, polity: data.polities[polityKey] };
}

function uncertainty(claim, kind, overrides = {}) {
  return { kind, reason: `Synthetic scholarship explicitly assesses ${kind}.`, evidence: [{ sourceId: 'a', personKey: claim.personKey, polityKey, classification: kind, locator: 'a:historical-assessment', text: `Synthetic classification: ${kind}.` }], ...overrides };
}

test('independently cross-checked identity, office, and dates are corroborated at year precision', () => {
  const { claim, sources, data } = fixture();
  const before = structuredClone({ claim, sources });
  assert.equal(assessRuler(claim, sources).accepted, true);
  assert.equal(assessRuler(claim, sources).status, 'corroborated');
  assert.deepEqual(validateRulers(data, index), []);
  assert.deepEqual({ claim, sources }, before, 'comparison must not annotate source facts');
});

test('passed admission flags without extracted-record checks cannot establish accuracy', () => {
  const { claim, sources, data } = fixture();
  sources.a.checks = []; sources.b.checks = [];
  assert.equal(assessRuler(claim, sources).accepted, false);
  assert.ok(validateRulers(data, index).length > 0);
});

test('Wikipedia and a downstream import or mirror count as one lineage', () => {
  const { claim, sources } = fixture();
  sources.a.lineage = sources.b.lineage = 'wikipedia:one-article';
  assert.equal(assessRuler(claim, sources).accepted, false);
});

test('unknown source lineage cannot count as independent corroboration', () => {
  const { claim, sources } = fixture();
  delete sources.b.lineage;
  assert.equal(assessRuler(claim, sources).accepted, false);
});

test('candidate and rejected sources cannot be promoted by syntactically matching claims', () => {
  for (const admission of ['candidate', 'rejected']) {
    const { claim, sources } = fixture(); sources.b.admission = admission;
    assert.equal(assessRuler(claim, sources).accepted, false, admission);
  }
});

test('a source check must have a real matching counterpart record and locator', () => {
  for (const field of ['sourceRecordId', 'locator', 'againstRecordId', 'againstLocator']) {
    const { claim, sources } = fixture(); sources.b.checks[0][field] = 'fabricated';
    assert.equal(assessRuler(claim, sources).accepted, false, field);
  }
});

test('a matched flag cannot conceal differing extracted observations', () => {
  const { claim, sources, data } = fixture();
  sources.a.checks[0].againstObserved.to = 3;
  assert.equal(assessRuler(claim, sources).accepted, false);
  assert.ok(validateRulers(data, index).some(error => error.includes('same facts')));
});

test('admitting a source does not admit another unchecked record from it', () => {
  const { claim, sources } = fixture();
  claim.assertions[1].sourceRecordId = 'b:uninspected-row';
  assert.equal(assessRuler(claim, sources).accepted, false);
});

for (const [field, wrong] of [['personKey', 'homonym:another-person'], ['polityKey', 'nm:another-jurisdiction'], ['role', 'Military commander']]) {
  test(`matching names and dates do not repair a mismatched ${field}`, () => {
    const { claim, sources } = fixture();
    const other = addPair(sources, 'c', 'd', observed({ [field]: wrong }));
    claim.assertions = [claim.assertions[0], ...other];
    assert.equal(assessRuler(claim, sources).accepted, false);
  });
}

test('a record supporting only the name cannot verify the reign dates', () => {
  const { claim, sources } = fixture();
  claim.assertions = addPair(sources, 'c', 'd', observed({ from: null, to: null }));
  assert.equal(assessRuler(claim, sources).accepted, false);
});

test('unsupported calendar or finer date precision cannot be silently normalized', () => {
  for (const patch of [{ calendar: 'julian' }, { precision: 'day' }]) {
    const { claim, sources } = fixture(); Object.assign(claim.assertions[1], patch);
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
});

test('approximate source dates remain approximate after agreement', () => {
  const { claim, sources, data } = fixture(observed({ precision: 'approximate' }));
  const assessment = assessRuler(claim, sources);
  assert.equal(assessment.accepted, true); assert.equal(assessment.status, 'approximate');
  const row = getRulers(data, polityKey, 1).rulers[0];
  assert.equal(row.active, false); assert.equal(row.possiblyActive, true);
});

test('known contradictory inspected evidence prevents a settled majority result', () => {
  const { claim, sources } = fixture();
  claim.assertions.push(...addPair(sources, 'c', 'd', observed({ from: -2 })));
  const result = assessRuler(claim, sources);
  assert.equal(result.status, 'disputed'); assert.equal(result.accepted, false);
});

test('a locatable contradictory row from an admitted source blocks agreement without its own paired check', () => {
  const { claim, sources } = fixture();
  addPair(sources, 'c', 'd', observed({ personKey: 'calibration:another-ruler' }), ':calibration');
  claim.assertions.push({ sourceId: 'c', sourceRecordId: 'c:unpaired-disagreement', locator: 'c:table2:row1', ...observed({ from: -2 }) });
  const result = assessRuler(claim, sources);
  assert.equal(result.status, 'disputed'); assert.equal(result.accepted, false);
  assert.ok(result.sourceIds.includes('c'), 'the contrary source remains visible for review');
  claim.uncertainty = uncertainty(claim, 'disputed', { alternatives: [{ from: -3, to: 2 }, { from: -2, to: 2 }] });
  assert.equal(assessRuler(claim, sources).accepted, true, 'a specifically documented dispute can retain the unpaired contrary estimate');
});

test('absence of a date in an admitted source is not evidence contradicting a known date', () => {
  const { claim, sources } = fixture();
  addPair(sources, 'c', 'd', observed({ personKey: 'calibration:another-ruler' }), ':calibration');
  claim.assertions.push({ sourceId: 'c', sourceRecordId: 'c:name-only', locator: 'c:table2:row1', ...observed({ from: null, to: null }) });
  assert.equal(assessRuler(claim, sources).status, 'corroborated');
});

test('a date dispute is publishable only with scholarly assessment and all supported alternatives', () => {
  const { claim, sources, data, polity } = fixture();
  claim.assertions.push(...addPair(sources, 'c', 'd', observed({ from: -2 })));
  polity.sourceIds.push('c', 'd');
  claim.uncertainty = uncertainty(claim, 'disputed', { alternatives: [{ from: -3, to: 2 }, { from: -2, to: 2 }] });
  assert.equal(assessRuler(claim, sources).accepted, true);
  assert.deepEqual(validateRulers(data, index), []);
  const row = getRulers(data, polityKey, -3).rulers[0];
  assert.equal(row.active, false); assert.equal(row.possiblyActive, true);
  claim.uncertainty.alternatives = [{ from: -3, to: 2 }];
  assert.equal(assessRuler(claim, sources).accepted, false);
});

test('invented or duplicate alternatives cannot manufacture a scholarly date dispute', () => {
  for (const alternatives of [[{ from: -3, to: 2 }, { from: -3, to: 2 }], [{ from: -3, to: 2 }, { from: -300, to: 200 }]]) {
    const { claim, sources } = fixture();
    claim.uncertainty = uncertainty(claim, 'disputed', { alternatives });
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
});

test('traditional historicality must be explicitly supported, not inferred from missing sources', () => {
  for (const kind of ['semi-legendary', 'legendary']) {
    const { claim, sources, data } = fixture();
    claim.assertions = [claim.assertions[0]];
    claim.uncertainty = uncertainty(claim, kind);
    assert.equal(assessRuler(claim, sources).accepted, true);
    assert.equal(assessRuler(claim, sources).status, kind);
    assert.equal(getRulers(data, polityKey, 1).rulers[0].active, false);
    delete claim.uncertainty.evidence;
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
});

test('one inspected scholarly tradition record may be published without a second matching reign record', () => {
  const { claim, sources, data } = fixture();
  // A/B remain admitted from the unrelated historical calibration fixture.
  claim.personKey = 'tradition:synthetic-figure'; claim.from = null; claim.to = null;
  claim.assertions = [{ sourceId: 'a', sourceRecordId: 'a:traditional-list:row1', locator: 'a:traditional-list:section1', ...observed({ personKey: claim.personKey, from: null, to: null }), inspected: true, snapshot: { path: 'synthetic-fixtures/traditional-list.txt', sha256: 'a'.repeat(64) } }];
  claim.uncertainty = uncertainty(claim, 'semi-legendary');
  const result = assessRuler(claim, sources);
  assert.equal(result.status, 'semi-legendary'); assert.equal(result.accepted, true);
  const row = getRulers(data, polityKey, 1).rulers[0];
  assert.equal(row.from, null); assert.equal(row.to, null);
  assert.equal(row.active, false); assert.equal(row.possiblyActive, false);
  claim.from = -3;
  assert.equal(assessRuler(claim, sources).accepted, false, 'unknown dates cannot be filled from the calibration ruler');
});

test('single-source tradition exception requires an inspected snapshot and matching scholarly classification', () => {
  const { claim, sources } = fixture();
  claim.personKey = 'tradition:synthetic-figure';
  claim.assertions = [{ sourceId: 'a', sourceRecordId: 'a:traditional-row', locator: 'a:traditional-section', ...observed({ personKey: claim.personKey }), inspected: true, snapshot: { path: 'synthetic-fixtures/traditional-list.txt', sha256: 'a'.repeat(64) } }];
  claim.uncertainty = uncertainty(claim, 'legendary');
  assert.equal(assessRuler(claim, sources).accepted, true);
  for (const mutate of [
    value => { value.assertions[0].inspected = false; },
    value => { delete value.assertions[0].snapshot; },
    value => { value.assertions[0].snapshot.sha256 = 'not-a-hash'; },
    value => { value.uncertainty.evidence = []; },
    value => { value.uncertainty.evidence[0].classification = 'semi-legendary'; },
  ]) {
    const changed = structuredClone(claim); mutate(changed);
    assert.equal(assessRuler(changed, sources).accepted, false);
  }
});

test('another person, classification, jurisdiction, or nonscholarly source cannot attest a legend label', () => {
  for (const patch of [{ personKey: 'another-person' }, { polityKey: 'nm:elsewhere' }, { classification: 'legendary' }, { locator: '' }, { text: '' }]) {
    const { claim, sources } = fixture();
    claim.uncertainty = uncertainty(claim, 'semi-legendary'); Object.assign(claim.uncertainty.evidence[0], patch);
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
  const { claim, sources } = fixture(); claim.uncertainty = uncertainty(claim, 'semi-legendary'); sources.a.kind = 'aggregator';
  assert.equal(assessRuler(claim, sources).accepted, false);
});

test('unknown tenure bounds cannot establish an infinite or undated reign', () => {
  for (const patch of [{ from: null }, { to: null }, { from: null, to: null }]) {
    const { claim, sources, data } = fixture(observed(patch));
    assert.equal(assessRuler(claim, sources).accepted, false);
    assert.deepEqual(getRulers(data, polityKey, 2024).rulers, []);
  }
});

test('ongoing tenures are bounded by inspected as-of evidence', () => {
  const { claim, sources, data } = fixture(observed({ from: 10, to: null, ongoing: true, asOf: 20 }));
  assert.equal(assessRuler(claim, sources).accepted, true);
  assert.equal(getRulers(data, polityKey, 20).rulers[0].active, true);
  assert.equal(getRulers(data, polityKey, 21).rulers[0].active, false);
  claim.assertions[0].asOf = 2024;
  assert.equal(assessRuler(claim, sources).accepted, false, 'a changed as-of year needs a new checked source record');
});

test('BCE/CE boundary, both endpoints, and invalid years preserve activity semantics', () => {
  const { data } = fixture();
  for (const selectedYear of [-3, -1, 1, 2]) assert.equal(getRulers(data, polityKey, selectedYear).rulers[0].active, true);
  for (const selectedYear of [-4, 3, 0, NaN, Infinity, null, undefined, '1', 1.5]) {
    const row = getRulers(data, polityKey, selectedYear).rulers[0];
    assert.equal(row.active, false, String(selectedYear)); assert.equal(row.possiblyActive, false, String(selectedYear));
  }
});

test('full history preserves repeat reigns and concurrent rulers without claiming exclusivity', () => {
  const { data, polity, sources } = fixture();
  const second = { ...polity.rulers[0], id: 'synthetic:reign2', from: 5, to: 9, assertions: addPair(sources, 'a', 'b', observed({ from: 5, to: 9 }), ':second-reign') };
  const co = { ...polity.rulers[0], id: 'synthetic:co', name: 'Synthetic Co-ruler', personKey: 'person:two', from: 1, to: 2, assertions: addPair(sources, 'a', 'b', observed({ personKey: 'person:two', from: 1, to: 2 }), ':co-ruler') };
  polity.rulers = [second, co, polity.rulers[0]];
  const atOne = getRulers(data, polityKey, 1);
  assert.equal(atOne.rulers.length, 3);
  assert.deepEqual(atOne.rulers.filter(row => row.active).map(row => row.id), ['synthetic:reign1', 'synthetic:co']);
  assert.deepEqual(getRulers(data, polityKey, 6).rulers.filter(row => row.active).map(row => row.id), ['synthetic:reign2']);
});

test('unverified and wrong-jurisdiction candidates never appear as ruled', () => {
  const { data, polity } = fixture();
  polity.rulers.push({ ...structuredClone(polity.rulers[0]), id: 'synthetic:unchecked', assertions: [] });
  assert.equal(getRulers(data, polityKey, 1).rulers.length, 1);
  assert.equal(getRulers(data, polityKey, 1).unverifiedCount, 1);
  assert.ok(validateRulers(data, index).some(error => error.includes('unaccepted published ruler')));
  data.polities.other = polity;
  assert.equal(getRulers(data, 'other', 1).rulers.length, 0);
});

test('a passing row comparison does not establish roster completeness', () => {
  const { data, polity } = fixture(); polity.coverage = 'complete';
  polity.rosterCheck = { passed: true, scope: polity.scope, sourceIds: ['a', 'b'] };
  assert.ok(validateRulers(data, index).some(error => error.includes('roster reconciliations')));
  assert.equal(getRulers(data, polityKey, 1).coverage, 'partial');
});

test('complete status requires independent roster contents to match the declared scope and entries', () => {
  const { data, polity } = fixture(); polity.coverage = 'complete';
  const entries = polity.rulers.map(({ personKey, role, from, to }) => ({ personKey, role, from, to }));
  polity.rosterCheck = { passed: true, scope: polity.scope, sourceIds: ['a', 'b'], rosters: ['a', 'b'].map(sourceId => ({ sourceId, locator: `${sourceId}:complete-roster`, entries: structuredClone(entries) })) };
  assert.deepEqual(validateRulers(data, index), []);
  polity.rosterCheck.rosters[1].entries.push({ personKey: 'omitted:ruler', role: 'Sovereign', from: 3, to: 4 });
  assert.ok(validateRulers(data, index).some(error => error.includes('roster reconciliations')));
});

test('every atlas identity needs its own coverage record; extra or missing identities fail', () => {
  const { data } = fixture();
  assert.ok(validateRulers(data, { ...index, another: { n: 'Another polity' } }).some(error => error.includes('missing polity coverage')));
  data.polities.extra = { ...data.polities[polityKey], rulers: [] };
  assert.ok(validateRulers(data, index).some(error => error.includes('unknown atlas identity')));
});

test('empty search results cannot establish unattested or collective political organization', () => {
  for (const coverage of ['unattested', 'collective', 'identity-conflict']) {
    const { data, polity } = fixture(); polity.coverage = coverage; polity.rulers = [];
    assert.ok(validateRulers(data, index).some(error => error.includes('specific researched evidence')), coverage);
    polity.research.evidence = [{ sourceId: 'a', polityKey, classification: coverage, locator: 'a:scope-assessment', text: `Synthetic source explicitly supports ${coverage}.` }];
    assert.deepEqual(validateRulers(data, index), []);
  }
});

test('unknown selections are safe and zero years are rejected as source dates', () => {
  for (const data of [null, undefined, {}, fixture().data]) assert.deepEqual(getRulers(data, 'missing', 1).rulers, []);
  const { claim, sources } = fixture(); claim.from = 0;
  assert.equal(assessRuler(claim, sources).accepted, false);
});

function sampledFixture(total = 10, conflicts = 0) {
  const sources = {}, ids = [];
  for (let i = 0; i < total; i++) {
    const pair = addPair(sources, 'a', 'b', observed({ personKey: `sample:person-${i}` }), `:sample-${i}`);
    ids.push(pair[0].sourceRecordId);
    if (i < conflicts) {
      const left = sources.a.checks.at(-1), right = sources.b.checks.at(-1);
      left.outcome = right.outcome = 'conflict';
      left.againstObserved.from = -2; right.observed.from = -2;
    }
  }
  sources.a.review = { method: 'sampled', sampleRecordIds: ids, samplingNote: 'Synthetic sample includes every selected record, including failures.' };
  const facts = observed({ personKey: 'imported:another-person', from: 10, to: 20 });
  const claim = { id: 'synthetic:source-import', name: 'Synthetic Imported Ruler', ...facts,
    assertions: [{ ...facts, sourceId: 'a', sourceRecordId: 'a:imported-record', locator: 'a:table3:row7', imported: true,
      snapshot: { path: 'synthetic-fixtures/source-snapshot.txt', sha256: 'a'.repeat(64) } }] };
  const data = { schemaVersion: 1, sources, polities: { [polityKey]: { name: 'Synthetic polity', scope: 'Sovereigns', coverage: 'partial', note: 'Synthetic sample evidence.', rulers: [claim], sourceIds: ['a'], research: { status: 'source-reviewed' } } } };
  return { sources, claim, data };
}

test('sample review requires five distinct inspected records and includes failures in its denominator', () => {
  for (const [count, conflicts, accepted] of [[4, 0, false], [5, 0, true], [10, 1, true], [10, 2, false]]) {
    const { sources, claim } = sampledFixture(count, conflicts);
    assert.equal(assessRuler(claim, sources).accepted, accepted, `${count} sampled with ${conflicts} conflicts`);
  }
  const { sources, claim } = sampledFixture();
  sources.a.review.sampleRecordIds[9] = sources.a.review.sampleRecordIds[0];
  assert.equal(assessRuler(claim, sources).accepted, false, 'duplicate samples cannot inflate the pass rate');
});

test('a missing or fabricated sample check cannot be discarded to manufacture a passing review', () => {
  for (const change of [
    source => { source.review.sampleRecordIds.push('uninspected:sample'); },
    source => { source.checks[0].againstRecordId = 'fabricated:peer'; },
    source => { source.checks[0].outcome = 'conflict'; source.checks[0].againstObserved = {}; },
    source => { source.review.samplingNote = ''; },
  ]) {
    const { sources, claim } = sampledFixture(); change(sources.a);
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
});

test('a sampled import remains visibly distinct from individual corroboration', () => {
  const { sources, claim, data } = sampledFixture(10, 1);
  const result = assessRuler(claim, sources);
  assert.equal(result.accepted, true); assert.equal(result.status, 'source-reviewed');
  assert.deepEqual(result.sourceIds, ['a']);
  const row = getRulers(data, polityKey, 15).rulers[0];
  assert.equal(row.assessment.status, 'source-reviewed'); assert.equal(row.active, true);
  assert.equal(getRulers(data, polityKey, 21).rulers[0].active, false);
  assert.deepEqual(validateRulers(data, index), []);
});

test('source imports require an explicit imported flag and a locatable fingerprinted snapshot', () => {
  for (const change of [
    assertion => { delete assertion.imported; },
    assertion => { delete assertion.snapshot; },
    assertion => { assertion.snapshot.path = ''; },
    assertion => { assertion.snapshot.sha256 = 'unrecorded'; },
    assertion => { assertion.sourceRecordId = ''; },
    assertion => { assertion.locator = ''; },
  ]) {
    const { sources, claim } = sampledFixture(); change(claim.assertions[0]);
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
});

test('sample admission does not repair wrong identity, jurisdiction, office, or unknown tenure bounds', () => {
  for (const change of [{ personKey: 'homonym:elsewhere' }, { polityKey: 'nm:another' }, { role: 'General' }, { calendar: 'unknown' }, { precision: 'day' }]) {
    const { sources, claim } = sampledFixture(); Object.assign(claim.assertions[0], change);
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
  for (const bounds of [{ from: null }, { to: null }, { from: 0 }]) {
    const { sources, claim } = sampledFixture(); Object.assign(claim, bounds); Object.assign(claim.assertions[0], bounds);
    assert.equal(assessRuler(claim, sources).accepted, false);
  }
});

test('a credible contrary observation still blocks a source-reviewed import', () => {
  const { sources, claim, data } = sampledFixture();
  claim.assertions.push({ ...observed({ personKey: claim.personKey, from: 11, to: 20 }), sourceId: 'b', sourceRecordId: 'b:unpaired-contrary-record', locator: 'b:table4:row2' });
  const result = assessRuler(claim, sources);
  assert.equal(result.status, 'disputed'); assert.equal(result.accepted, false);
  assert.deepEqual(getRulers(data, polityKey, 15).rulers, []);
});

test('sample admission preserves approximate dates without asserting definite activity', () => {
  const { sources, claim, data } = sampledFixture();
  claim.precision = claim.assertions[0].precision = 'approximate';
  const result = assessRuler(claim, sources);
  assert.equal(result.accepted, true); assert.equal(result.status, 'approximate');
  const row = getRulers(data, polityKey, 15).rulers[0];
  assert.equal(row.active, false); assert.equal(row.possiblyActive, true);
});
