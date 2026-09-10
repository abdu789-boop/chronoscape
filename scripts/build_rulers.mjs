/** Build the public ruler file from extracted, independently compared evidence.
 * No network, model-generated facts, fuzzy date tolerance, or implied coverage.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessRuler, validateRulers } from '../docs/js/rulers.js';
import { applyIdentityAudit } from './ruler_identity_merge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const exists = file => fs.existsSync(path.join(root, file));
const index = read('docs/data/polity_index.json');
const data = { schemaVersion: 1, calendar: 'historical', sources: {}, polities: {} };
const report = { schemaVersion: 1, policy: 'sources/rulers/policy.md', inputs: [], accepted: [], withheld: [], sourceComparisons: {}, coverage: {} };
const discovery = read('sources/rulers/wikidata-discovery.json');
for (const [key, entry] of Object.entries(index)) {
  if (key === '_span') continue;
  const discovered = discovery.polities[key];
  if (!discovered) throw new Error(`Missing source discovery ${key}`);
  const links = (discovered.sourceCandidates || []).map(source => ({ kind: source.kind, title: source.title || `${source.kind}: ${source.entityId}`, url: source.url }));
  data.polities[key] = {
    name: entry.n, scope: 'Sovereign rulers or political leaders of this specific polity.',
    coverage: 'unverified', note: 'A verified succession list is not yet available. Missing records are a research gap, not evidence of an absence of rulers.',
    rulers: [], sourceIds: [], research: { status: 'awaiting-independent-source-review', identityStatus: discovered.identityStatus,
      acquisitionStatus: discovered.acquisitionStatus, candidateCount: discovered.candidateCount, links },
  };
}

const observed = assertion => Object.fromEntries(['personKey', 'polityKey', 'role', 'from', 'to', 'precision', 'calendar', 'ongoing', 'asOf'].filter(key => assertion[key] !== undefined).map(key => [key, assertion[key]]));
const candidates = [];
const conflictReferences = new Map();
const assertionReference = assertion => JSON.stringify([assertion.sourceId, assertion.sourceRecordId, assertion.locator]);
const profileOverrides = {};
for (const family of ['china', 'classical', 'modern', 'reference-import', 'broad-import']) {
  const filename = `sources/rulers/${family}.json`;
  if (!exists(filename)) continue;
  const input = read(filename);
  for (const [key, override] of Object.entries(input.profileOverrides || {})) {
    const previous = profileOverrides[key] || {};
    profileOverrides[key] = { ...previous, ...override,
      crosswalk: [previous.crosswalk, override.crosswalk].filter(Boolean).join(' ') };
  }
  report.inputs.push({ path: filename, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, filename))).digest('hex'), receipts: input.receipts || [] });
  for (const fingerprint of input.inputFingerprints || []) {
    const file = fingerprint.file || fingerprint.path;
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    if (actual !== fingerprint.sha256) throw new Error(`Stale compared input ${file}; regenerate ${filename}.`);
    report.inputs.push({ path: file, sha256: actual, receipts: [] });
  }
  for (const [id, source] of Object.entries(input.sources || {})) {
    if (data.sources[id]) throw new Error(`Duplicate source ID ${id}`);
    data.sources[id] = { ...source, admission: 'candidate', checks: [] };
  }
  report.sourceComparisons[family] = input.summary || { matched: input.matched?.length || 0, conflicts: input.conflicts?.length || 0 };
  for (const conflict of input.conflicts || []) {
    report.withheld.push({ family, ...conflict });
    const assertions = conflict.claim?.assertions || [conflict.observed, conflict.againstObserved].filter(Boolean);
    for (const assertion of assertions) {
      const reference = assertionReference(assertion);
      const existing = conflictReferences.get(reference) || [];
      existing.push(...assertions.filter(peer => peer !== assertion));
      conflictReferences.set(reference, existing);
    }
    for (const a of assertions) for (const b of assertions) {
      if (a === b || !data.sources[a.sourceId] || !data.sources[b.sourceId]) continue;
      if (data.sources[a.sourceId].lineage === data.sources[b.sourceId].lineage) continue;
      if (JSON.stringify(observed(a)) === JSON.stringify(observed(b))) continue;
      data.sources[a.sourceId].checks.push({ sourceRecordId: a.sourceRecordId, locator: a.locator,
        againstSourceId: b.sourceId, againstRecordId: b.sourceRecordId, againstLocator: b.locator,
        outcome: 'conflict', observed: observed(a), againstObserved: observed(b) });
    }
  }
  for (const claim of input.matched || []) {
    if (!data.polities[claim.polityKey]) throw new Error(`Unknown mapped polity ${claim.polityKey}`);
    // Recompute equality from the two separately extracted observations. Merely
    // placing a row in the adapter's 'matched' array never admits it.
    for (const a of claim.assertions || []) for (const b of claim.assertions || []) {
      if (a === b || !data.sources[a.sourceId] || !data.sources[b.sourceId]) continue;
      const source = data.sources[a.sourceId], peer = data.sources[b.sourceId];
      if (!source.lineage || source.lineage === peer.lineage) continue;
      if (JSON.stringify(observed(a)) !== JSON.stringify(observed(b))) continue;
      source.admission = 'passed';
      source.checks.push({ sourceRecordId: a.sourceRecordId, locator: a.locator,
        againstSourceId: b.sourceId, againstRecordId: b.sourceRecordId, againstLocator: b.locator,
        outcome: 'matched', observed: observed(a), againstObserved: observed(b) });
    }
    // A source sample can compare a reign already published by another adapter.
    // Keep its checks without adding a duplicate roster row.
    if (!claim.checksOnly) candidates.push({ claim, family });
  }
  const paired = new Set((input.matched || []).map(claim => claim.id));
  for (const claim of input.imports || []) if (!paired.has(claim.id)) candidates.push({ claim, family });
}

// New contradictory evidence must also reach an older published claim. Holding
// only the new row would leave the old version misleadingly labelled settled.
for (const { claim } of candidates) {
  const additions = (claim.assertions || []).flatMap(assertion => conflictReferences.get(assertionReference(assertion)) || []);
  for (const peer of additions) {
    if (peer.polityKey !== claim.polityKey || peer.personKey !== claim.personKey) continue;
    if (!['from', 'to'].some(field => Number.isInteger(peer[field]) && Number.isInteger(claim[field]) && peer[field] !== claim[field])) continue;
    const assertion = { ...peer, role: claim.role };
    if (!(claim.assertions || []).some(old => assertionReference(old) === assertionReference(assertion)
      && old.from === assertion.from && old.to === assertion.to)) claim.assertions.push(assertion);
  }
}

// Counterpart checks must all exist before assessments run.
// The finished source registry is immutable for the model's shared lookup cache.
Object.freeze(data.sources);
for (const { claim, family } of candidates) {
  const assessment = assessRuler(claim, data.sources);
  if (!assessment.accepted) { report.withheld.push({ family, claim, reason: assessment.reasons.join(' ') }); continue; }
  const polity = data.polities[claim.polityKey];
  if (polity.rulers.some(other => other.id === claim.id)) throw new Error(`Repeated claim ${claim.id}`);
  polity.rulers.push(claim); polity.coverage = 'partial';
  polity.scope = family === 'china' ? 'Emperors of the named dynasty; regents and posthumously conferred emperors are outside this list.' : polity.scope;
  polity.note = 'The succession list is incomplete. Some reigns were individually cross-checked; others come from sources checked by sample. Map boundary dates can differ from reign dates.';
  polity.research.status = 'partial-independent-corroboration';
  polity.sourceIds = [...new Set([...polity.sourceIds, ...assessment.sourceIds])];
  report.accepted.push({ id: claim.id, polityKey: claim.polityKey, status: assessment.status });
}

report.superseded = [];
for (const polity of Object.values(data.polities)) for (const replacement of [...polity.rulers]) {
  for (const id of replacement.supersedes || []) {
    const previous = polity.rulers.find(claim => claim.id === id);
    if (!previous) continue;
    const cutoffs = previous.assertions.filter(a => a.ongoing && Number.isInteger(a.asOf)).map(a => a.asOf);
    if (previous.personKey !== replacement.personKey || previous.from !== replacement.from
      || previous.to !== null || !cutoffs.length || !Number.isInteger(replacement.to)
      || cutoffs.some(asOf => asOf > replacement.to) || !replacement.supersessionNote) {
      throw new Error(`Invalid replacement of a censored tenure: ${id}`);
    }
    polity.rulers = polity.rulers.filter(claim => claim.id !== id);
    report.accepted = report.accepted.filter(claim => claim.id !== id);
    report.superseded.push({ id, replacement: replacement.id, reason: replacement.supersessionNote });
  }
}

// The audit sees all accepted rows before any display consolidation. This makes
// regeneration independent of the previously published, already-deduplicated file.
const auditInput = JSON.stringify(data, null, 2) + '\n';
const auditOutput = process.argv.find(arg => arg.startsWith('--audit-input='));
if (auditOutput) {
  fs.writeFileSync(auditOutput.slice('--audit-input='.length), auditInput);
  console.log('Wrote unconsolidated ruler audit input.');
  process.exit(0);
}
{
  const file = 'sources/rulers/identity-audit.json', audit = read(file);
  if (audit.inputSha256 !== crypto.createHash('sha256').update(auditInput).digest('hex')) throw new Error('Stale ruler identity audit; regenerate from --audit-input.');
  report.inputs.push({path:file, sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'), receipts:[]});
  for (const input of audit.inputFingerprints) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root,input.path))).digest('hex');
    if (actual !== input.sha256) throw new Error('Stale identity evidence: ' + input.path);
    report.inputs.push({...input, receipts:[]});
  }
  applyIdentityAudit(data, report, audit);
}

for (const [key, override] of Object.entries(profileOverrides)) {
  if (!data.polities[key]) throw new Error(`Unknown profile override ${key}`);
  for (const field of ['scope', 'note']) if (override[field]) data.polities[key][field] = override[field];
  data.polities[key].research.crosswalk = override.crosswalk || 'Documented source-specific scope mapping';
}

const identityConflict = data.polities['wd:Q6000379'];
identityConflict.note = 'The atlas labels this entry Hashemite Arab Federation in 1415–1439, while its source link points to Arab Iraq. The 1958 Arab Federation must not supply rulers for this medieval geometry. Identity review is required.';
identityConflict.research.identityStatus = 'conflicting-name-and-period';
identityConflict.research.links.push({ title: 'US Department of State: Arab Federation formed in 1958', url: 'https://history.state.gov/historicaldocuments/frus1958-60v12/d99' });
for (const [key, polity] of Object.entries(data.polities)) report.coverage[key] = { name: polity.name, status: polity.coverage, acceptedReigns: polity.rulers.length, sourceIds: polity.sourceIds, research: polity.research };
report.summary = {
  polities: Object.keys(data.polities).length,
  politiesWithCheckedRulers: Object.values(data.polities).filter(p => p.rulers.length).length,
  completeRosters: Object.values(data.polities).filter(p => p.coverage === 'complete').length,
  checkedReigns: report.accepted.length, withheldComparisons: report.withheld.length,
  individuallyCrossChecked: report.accepted.filter(entry => entry.status === 'corroborated').length,
  sourceReviewed: report.accepted.filter(entry => entry.status === 'source-reviewed').length,
};
data.summary = report.summary;
const errors = validateRulers(data, index);
if (errors.length) throw new Error(errors.join('\n'));
const outputs = { 'docs/data/rulers.json': data, 'sources/rulers/accuracy-report.json': report };
for (const [file, value] of Object.entries(outputs)) {
  const contents = JSON.stringify(value, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (!exists(file) || fs.readFileSync(path.join(root, file), 'utf8') !== contents) throw new Error(`Stale ${file}; rebuild ruler evidence.`);
  } else fs.writeFileSync(path.join(root, file), contents);
}
console.log(JSON.stringify(report.summary));
