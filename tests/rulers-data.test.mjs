import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessRuler, validateRulers } from '../docs/js/rulers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fingerprint = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const data = read('docs/data/rulers.json');
const index = read('docs/data/polity_index.json');
const report = read('sources/rulers/accuracy-report.json');
const local = relative => {
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(root + path.sep), `Evidence path escapes repository: ${relative}`);
  return file;
};

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
freeze(data);

test('published ruler evidence passes admission checks and covers every exact atlas identity', () => {
  assert.deepEqual(validateRulers(data, index), []);
  assert.deepEqual(Object.keys(data.polities).sort(), Object.keys(index).filter(key => key !== '_span').sort());
  const claims = Object.values(data.polities).flatMap(polity => polity.rulers);
  assert.ok(claims.length > 0);
  const accepted = new Map(report.accepted.map(row => [row.id, row]));
  assert.equal(accepted.size, claims.length, 'audit must account for every published reign exactly once');
  for (const claim of claims) {
    const result = assessRuler(claim, data.sources);
    assert.equal(result.accepted, true, claim.id);
    assert.equal(accepted.get(claim.id)?.status, result.status, `${claim.id}: provenance label must match evidence`);
    assert.equal(accepted.get(claim.id)?.polityKey, claim.polityKey);
  }
  assert.equal(report.summary.checkedReigns, claims.length);
  assert.equal(report.summary.individuallyCrossChecked, report.accepted.filter(row => row.status === 'corroborated').length);
  assert.equal(report.summary.sourceReviewed, report.accepted.filter(row => row.status === 'source-reviewed').length);
});

test('audit input fingerprints match the compared source artifacts', () => {
  assert.ok(report.inputs.length > 0);
  for (const input of report.inputs) {
    assert.match(input.sha256, /^[a-f0-9]{64}$/);
    assert.equal(fingerprint(local(input.path)), input.sha256, `${input.path}: regenerate the ruler build after source changes`);
  }
});

test('known new conflicts cannot leave the previously published version labelled settled', () => {
  const reference = a => JSON.stringify([a.sourceId, a.sourceRecordId, a.locator]);
  const conflicts = new Map();
  for (const input of report.inputs) {
    if (!input.path.endsWith('.json')) continue;
    for (const row of read(input.path).conflicts || []) {
      const assertions = row.claim?.assertions || [row.observed, row.againstObserved].filter(Boolean);
      for (const assertion of assertions) {
        const key = reference(assertion);
        conflicts.set(key, [...(conflicts.get(key) || []), ...assertions.filter(a => a !== assertion)]);
      }
    }
  }
  for (const polity of Object.values(data.polities)) for (const claim of polity.rulers) {
    const contrary = claim.assertions.flatMap(a => conflicts.get(reference(a)) || []).filter(peer =>
      peer.personKey === claim.personKey && peer.polityKey === claim.polityKey
      && data.sources[peer.sourceId]?.admission === 'passed'
      && ['from', 'to'].some(field => Number.isInteger(peer[field]) && Number.isInteger(claim[field]) && peer[field] !== claim[field]));
    if (contrary.length) assert.equal(assessRuler(claim, data.sources).status, 'disputed', claim.id);
  }
});

test('every published imported observation points to a recorded source snapshot fingerprint', () => {
  const receipts = new Map();
  for (const input of report.inputs) for (const receipt of input.receipts || []) {
    const file = receipt.file || receipt.path;
    assert.ok(file); assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
    assert.ok(!receipts.has(file) || receipts.get(file) === receipt.sha256, `Conflicting receipts for ${file}`);
    receipts.set(file, receipt.sha256);
    // Raw acquisitions are a local audit cache, not site assets. Validate every
    // available cached original; committed comparison input hashes above remain
    // mandatory even in a clean checkout without the acquisition cache.
    const filename = local(file);
    if (fs.existsSync(filename)) assert.equal(fingerprint(filename), receipt.sha256, file);
  }
  for (const polity of Object.values(data.polities)) for (const claim of polity.rulers) for (const assertion of claim.assertions || []) {
    if (!assertion.imported) continue;
    assert.ok(assertion.snapshot?.path, claim.id);
    assert.equal(receipts.get(assertion.snapshot.path), assertion.snapshot.sha256, `${claim.id}: missing or different acquisition receipt`);
  }
});
