const text = value => typeof value === 'string' && value.trim().length > 0;
const year = value => Number.isSafeInteger(value) && value !== 0;
const fields = ['personKey', 'polityKey', 'role', 'from', 'to', 'precision', 'calendar', 'ongoing', 'asOf'];
const coverages = new Set(['partial', 'complete', 'unverified', 'unattested', 'collective', 'identity-conflict']);
const uncertaintyKinds = new Set(['disputed', 'semi-legendary', 'legendary', 'approximate']);
const array = value => Array.isArray(value) ? value : [];

function validObservation(value) {
  return value && ['personKey', 'polityKey', 'role'].every(key => text(value[key]))
    && (year(value.from) || value.from === null) && (year(value.to) || value.to === null)
    && !(year(value.from) && year(value.to) && value.from > value.to)
    && ['year', 'approximate'].includes(value.precision) && value.calendar === 'historical'
    && (value.ongoing === undefined || typeof value.ongoing === 'boolean')
    && (value.asOf === undefined || year(value.asOf))
    && (value.ongoing !== true || value.to === null && year(value.from) && year(value.asOf) && value.asOf >= value.from);
}

const sameObservation = (a, b) => validObservation(a) && validObservation(b)
  && fields.every(field => a[field] === b[field]);
const sameDates = (a, b) => a.from === b.from && a.to === b.to;
const contradictsDates = (a, b) => ['from', 'to'].some(field => year(a[field]) && year(b[field]) && a[field] !== b[field]);
const observationKey = value => JSON.stringify(fields.map(field => value[field]));
const recordKey = (id, locator, observation) => JSON.stringify([id, locator, observationKey(observation)]);
const frozenSourceIndexes = new WeakMap();

/** Index both directions once: validation is linear in source checks, not quadratic. */
function evidenceIndex(sources) {
  if (Object.isFrozen(sources) && frozenSourceIndexes.has(sources)) return frozenSourceIndexes.get(sources);
  const candidates = [], signatures = new Set(), validChecks = new Set(), matchedRecords = new Map(), admittedIds = new Set();
  const signature = (sourceId, check, reverse = false) => JSON.stringify(reverse
    ? [check.againstSourceId, check.againstRecordId, check.againstLocator, sourceId, check.sourceRecordId, check.locator, observationKey(check.againstObserved), observationKey(check.observed)]
    : [sourceId, check.sourceRecordId, check.locator, check.againstSourceId, check.againstRecordId, check.againstLocator, observationKey(check.observed), observationKey(check.againstObserved)]);
  for (const [sourceId, source] of Object.entries(sources)) {
    for (const check of array(source?.checks)) {
      const other = sources[check?.againstSourceId];
      if (check?.outcome !== 'matched' || other?.admission !== 'passed'
        || !text(source?.lineage) || !text(other.lineage) || source.lineage === other.lineage
        || !['sourceRecordId', 'locator', 'againstRecordId', 'againstLocator'].every(key => text(check[key]))
        || !sameObservation(check.observed, check.againstObserved)) continue;
      candidates.push([sourceId, check]); signatures.add(signature(sourceId, check));
    }
  }
  for (const [sourceId, check] of candidates) {
    if (!signatures.has(signature(sourceId, check, true))) continue;
    validChecks.add(check);
    if (!matchedRecords.has(sourceId)) matchedRecords.set(sourceId, new Set());
    matchedRecords.get(sourceId).add(recordKey(check.sourceRecordId, check.locator, check.observed));
  }
  for (const [sourceId, source] of Object.entries(sources)) {
    if (source?.admission === 'passed' && text(source.title) && /^https:\/\/[^\s]+$/.test(source.url || '')
      && text(source.lineage) && matchedRecords.get(sourceId)?.size) admittedIds.add(sourceId);
  }
  const sampledIds = new Set();
  for (const sourceId of admittedIds) {
    const source = sources[sourceId], review = source.review;
    const sample = array(review?.sampleRecordIds);
    if (review?.method !== 'sampled' || !text(review.samplingNote) || sample.length < 5
      || new Set(sample).size !== sample.length) continue;
    let matches = 0, inspected = 0;
    for (const id of sample) {
      const checks = array(source.checks).filter(check => check.sourceRecordId === id);
      if (checks.some(check => validChecks.has(check))) { matches++; inspected++; continue; }
      if (checks.some(check => check.outcome === 'conflict' && validObservation(check.observed)
        && validObservation(check.againstObserved) && text(check.locator) && text(check.againstLocator)
        && sources[check.againstSourceId]?.lineage && sources[check.againstSourceId].lineage !== source.lineage
        && ['personKey', 'polityKey', 'role'].every(field => check.observed[field] === check.againstObserved[field])
        && contradictsDates(check.observed, check.againstObserved))) inspected++;
    }
    if (inspected === sample.length && matches / inspected >= 0.9) sampledIds.add(sourceId);
  }
  const index = { validChecks, matchedRecords, admittedIds, sampledIds };
  // A frozen registry is an explicit immutability contract for its nested records.
  // Mutable builder/test data is deliberately reindexed on every public call.
  if (Object.isFrozen(sources)) frozenSourceIndexes.set(sources, index);
  return index;
}

function admitted(sourceId, index) {
  return index.admittedIds.has(sourceId);
}

function extractedAssertion(assertion, claim, index) {
  return admitted(assertion?.sourceId, index) && text(assertion.sourceRecordId) && text(assertion.locator)
    && validObservation(assertion)
    && ['personKey', 'polityKey', 'role'].every(field => assertion[field] === claim[field]);
}

function checkedAssertion(assertion, claim, index) {
  return extractedAssertion(assertion, claim, index)
    && index.matchedRecords.get(assertion.sourceId)?.has(recordKey(assertion.sourceRecordId, assertion.locator, assertion));
}

function inspectedTradition(assertion, claim, sources, index) {
  return extractedAssertion(assertion, claim, index) && sources[assertion.sourceId].kind === 'scholarly'
    && (checkedAssertion(assertion, claim, index) || assertion.inspected === true
      && text(assertion.snapshot?.path) && /^[a-f0-9]{64}$/i.test(assertion.snapshot?.sha256 || ''));
}

function classificationEvidence(claim, sources, index) {
  const uncertainty = claim.uncertainty;
  if (!uncertaintyKinds.has(uncertainty?.kind) || !text(uncertainty.reason)) return [];
  return array(uncertainty.evidence).filter(evidence => admitted(evidence.sourceId, index)
    && sources[evidence.sourceId].kind === 'scholarly'
    && evidence.classification === uncertainty.kind && evidence.personKey === claim.personKey
    && evidence.polityKey === claim.polityKey && text(evidence.locator) && text(evidence.text));
}

function comparativeChronologyEvidence(claim, extracted, sources, index) {
  if (claim.uncertainty?.basis !== 'published-comparative-chronology') return [];
  return array(claim.uncertainty.evidence).filter(evidence => {
    if (evidence.classification !== 'disputed' || evidence.personKey !== claim.personKey
      || evidence.polityKey !== claim.polityKey || !text(evidence.text) || !text(evidence.locator)
      || sources[evidence.sourceId]?.kind !== 'reference' || !index.sampledIds.has(evidence.sourceId)) return false;
    const records = array(evidence.sourceRecordIds);
    if (records.length < 2 || new Set(records).size !== records.length) return false;
    const observations = records.map(id => extracted.find(a => a.sourceId === evidence.sourceId && a.sourceRecordId === id));
    if (observations.some(a => !a || !text(a.chronology) || !a.imported
      || !text(evidence.snapshot?.path) || !/^[a-f0-9]{64}$/i.test(evidence.snapshot?.sha256 || '')
      || a.snapshot?.path !== evidence.snapshot.path || a.snapshot?.sha256 !== evidence.snapshot.sha256)) return false;
    return new Set(observations.map(a => a.chronology)).size === observations.length
      && new Set(observations.map(a => JSON.stringify([a.from, a.to]))).size > 1;
  });
}

/** Cross-reference extracted facts. This does not authenticate the external pages. */
export function assessRuler(claim, sources = {}) {
  return assessWithIndex(claim, sources, evidenceIndex(sources));
}

function assessWithIndex(claim, sources, index) {
  const result = { status: 'unverified', accepted: false, reasons: [], sourceIds: [] };
  if (!claim || !text(claim.id) || !text(claim.name) || !validObservation({ ...claim, precision: claim.precision || 'year', calendar: 'historical' })) {
    result.reasons.push('The claim needs a person, jurisdiction, office, and valid historical dates.');
    return result;
  }
  const extracted = array(claim.assertions).filter(assertion => extractedAssertion(assertion, claim, index));
  const assertions = extracted.filter(assertion => checkedAssertion(assertion, claim, index));
  const supporting = assertions.filter(assertion => sameDates(assertion, claim));
  // A source need not find a second source agreeing with its disagreement to raise it.
  const contrary = extracted.filter(assertion => contradictsDates(assertion, claim));
  const tradition = extracted.filter(assertion => sameDates(assertion, claim) && inspectedTradition(assertion, claim, sources, index));
  const sampled = extracted.filter(assertion => sameDates(assertion, claim) && index.sampledIds.has(assertion.sourceId)
    && assertion.imported === true && text(assertion.snapshot?.path) && /^[a-f0-9]{64}$/i.test(assertion.snapshot?.sha256 || ''));
  const kind = claim.uncertainty?.kind;
  result.sourceIds = [...new Set([...assertions, ...contrary].map(assertion => assertion.sourceId))];
  if (!supporting.length && !sampled.length && (!['semi-legendary', 'legendary'].includes(kind) || !tradition.length)) {
    result.reasons.push('No inspected and cross-checked source record supports this person, office, jurisdiction, and tenure.');
    return result;
  }
  const classification = classificationEvidence(claim, sources, index);
  if (contrary.length || kind === 'disputed') {
    result.status = 'disputed';
    const alternatives = array(claim.uncertainty?.alternatives);
    const retained = new Set(alternatives.map(alternative => JSON.stringify([alternative?.from, alternative?.to]))).size > 1
      && alternatives.every(alternative => alternative && extracted.some(assertion => sameDates(alternative, assertion)))
      && [...supporting, ...sampled, ...contrary].every(assertion => alternatives.some(alternative => sameDates(alternative, assertion)));
    const comparative = comparativeChronologyEvidence(claim, extracted, sources, index);
    if (kind === 'disputed' && (classification.length || comparative.length) && retained) {
      result.accepted = true;
      result.sourceIds = [...new Set([...result.sourceIds, ...classification.map(evidence => evidence.sourceId), ...comparative.map(evidence => evidence.sourceId)])];
      result.reasons.push(classification.length ? 'Scholarly sources document a dispute; the alternative tenures are retained.'
        : 'The sample-checked reference explicitly compares named chronologies. Their different dates are retained; the underlying publications were not independently reconciled.');
    } else result.reasons.push('Contradictory tenure evidence needs a scholarly assessment and retained alternatives.');
    return result;
  }
  if (kind === 'semi-legendary' || kind === 'legendary') {
    result.status = kind;
    result.accepted = classification.length > 0 && tradition.length > 0;
    result.sourceIds = [...new Set([...result.sourceIds, ...tradition.map(assertion => assertion.sourceId), ...classification.map(evidence => evidence.sourceId)])];
    result.reasons.push(result.accepted ? 'A scholarly source explicitly identifies the traditional or uncertain historical account.'
      : 'This historicality label lacks specific admitted scholarly evidence.');
    return result;
  }
  if (kind && !uncertaintyKinds.has(kind)) {
    result.reasons.push('The uncertainty classification is not recognized.');
    return result;
  }
  const independent = new Set(supporting.map(assertion => sources[assertion.sourceId].lineage));
  if (independent.size < 2) {
    if (sampled.length && year(claim.from) && (year(claim.to) || sampled.every(a => a.ongoing && year(a.asOf)))) {
      result.accepted = true;
      result.status = claim.precision === 'approximate' || sampled.some(a => a.precision === 'approximate') ? 'approximate' : 'source-reviewed';
      result.sourceIds = [...new Set(sampled.map(a => a.sourceId))];
      result.reasons.push('Imported from a source that passed sample-based checks. This reign was not individually cross-checked.');
      return result;
    }
    result.reasons.push('Fewer than two independently documented source lineages corroborate this tenure.');
    return result;
  }
  if (claim.from === null || (claim.to === null && !supporting.every(assertion => assertion.ongoing === true && year(assertion.asOf) && assertion.asOf >= claim.from))) {
    result.reasons.push('An unknown tenure bound cannot be cross-verified as a dated reign.');
    return result;
  }
  const approximate = claim.precision === 'approximate' || kind === 'approximate' || extracted.some(assertion => sameDates(assertion, claim) && assertion.precision === 'approximate');
  if (kind === 'approximate' && !classification.length && !supporting.some(assertion => assertion.precision === 'approximate')) {
    result.reasons.push('An approximate date label needs source evidence.');
    return result;
  }
  result.status = approximate ? 'approximate' : 'corroborated';
  result.accepted = true;
  result.reasons.push(approximate ? 'Independent records agree on the supplied approximate chronology; exact years remain uncertain.'
    : 'Independent inspected records agree at year precision.');
  return result;
}

const tenureKey = entry => JSON.stringify([entry.personKey, entry.role, entry.from, entry.to]);

function sourceDay(value) {
  const match = typeof value === 'string' && value.match(/^[+-]?\d{4}-(\d{2})-(\d{2})(?:T00:00:00Z)?$/);
  return match && Number(match[1]) > 0 && Number(match[2]) > 0 ? `${match[1]}-${match[2]}` : null;
}

function completeRoster(polity, sources, index) {
  const check = polity?.rosterCheck;
  if (check?.passed !== true || check.scope !== polity.scope || !text(check.scope)) return false;
  const expected = array(polity.rulers).map(tenureKey).sort();
  if (!expected.length || expected.length !== new Set(expected).size) return false;
  const rosters = array(check.rosters).filter(roster => admitted(roster.sourceId, index)
    && array(check.sourceIds).includes(roster.sourceId) && text(roster.locator)
    && JSON.stringify(array(roster.entries).map(tenureKey).sort()) === JSON.stringify(expected));
  return new Set(rosters.map(roster => sources[roster.sourceId].lineage)).size >= 2
    && array(polity.rulers).every(claim => assessWithIndex(claim, sources, index).accepted);
}

/** Validate published content and all-index coverage, including its evidence comparisons. */
export function validateRulers(data, index) {
  const errors = [], fail = (path, message) => errors.push(`${path}: ${message}`);
  if (data?.schemaVersion !== 1) fail('schemaVersion', 'must be 1');
  if (!data?.sources || !data?.polities) return [...errors, 'sources and polities are required'];
  const sources = data.sources;
  const evidence = evidenceIndex(sources);
  for (const [sourceId, source] of Object.entries(sources)) {
    if (!source || !text(source.title) || !/^https:\/\/[^\s]+$/.test(source.url || '')) { fail(`sources.${sourceId}`, 'requires a title and HTTPS URL'); continue; }
    if (!['candidate', 'passed', 'rejected'].includes(source.admission)) fail(`sources.${sourceId}`, 'invalid admission');
    if (source.admission === 'passed' && !admitted(sourceId, evidence)) fail(`sources.${sourceId}`, 'passed admission requires an independent matched extracted-record check');
    for (const check of array(source.checks)) {
      if (!check || check.outcome === 'matched' && !evidence.validChecks.has(check)) fail(`sources.${sourceId}`, 'claimed match does not compare the same facts from independent sources');
    }
  }
  for (const key of Object.keys(index || {}).filter(key => key !== '_span')) {
    if (!Object.hasOwn(data.polities, key)) fail(key, 'missing polity coverage record');
  }
  const ids = new Set();
  for (const [key, polity] of Object.entries(data.polities)) {
    if (key === '_span' || !Object.hasOwn(index || {}, key)) fail(key, 'unknown atlas identity');
    if (!polity || !text(polity.name) || !text(polity.scope) || !text(polity.note) || !coverages.has(polity.coverage)) { fail(key, 'requires name, scope, note, and recognized coverage'); continue; }
    if (!polity.research || typeof polity.research !== 'object' || Array.isArray(polity.research)) fail(key, 'requires a research disposition');
    if (!Array.isArray(polity.rulers) || !Array.isArray(polity.sourceIds)) fail(key, 'requires rulers and sourceIds arrays');
    for (const sourceId of array(polity.sourceIds)) if (!sources[sourceId]) fail(key, `unknown source ${sourceId}`);
    for (const claim of array(polity.rulers)) {
      if (!claim) { fail(key, 'ruler claim must be an object'); continue; }
      if (claim.polityKey !== key) fail(key, `claim ${claim.id} has a different jurisdiction`);
      if (ids.has(claim.id)) fail(key, `duplicate claim ID ${claim.id}`);
      ids.add(claim.id);
      const assessment = assessWithIndex(claim, sources, evidence);
      if (!assessment.accepted) fail(`${key}.${claim.id}`, `unaccepted published ruler: ${assessment.reasons.join(' ')}`);
      for (const sourceId of assessment.sourceIds) if (!array(polity.sourceIds).includes(sourceId)) fail(key, `ruler source ${sourceId} missing from sourceIds`);
    }
    if (['unverified', 'identity-conflict', 'unattested'].includes(polity.coverage) && array(polity.rulers).length) fail(key, `${polity.coverage} coverage cannot publish rulers`);
    if (polity.coverage === 'complete' && !completeRoster(polity, sources, evidence)) fail(key, 'complete coverage needs two independent, matching scoped roster reconciliations');
    if (['unattested', 'collective', 'identity-conflict'].includes(polity.coverage)) {
      const supported = array(polity.research?.evidence).some(item => admitted(item.sourceId, evidence)
        && item.polityKey === key && item.classification === polity.coverage && text(item.locator) && text(item.text));
      if (!supported) fail(key, `${polity.coverage} needs specific researched evidence, not an empty search result`);
    }
  }
  return errors;
}

/** The UI receives accepted evidence only. Unknown dates never become infinite activity. */
export function getRulers(data, key, selectedYear) {
  const polity = data?.polities?.[key], sources = data?.sources || {};
  const result = { name: polity?.name || '', scope: polity?.scope || '', coverage: polity?.coverage || 'unverified', note: polity?.note || '', sourceIds: array(polity?.sourceIds), rulers: [], unverifiedCount: 0 };
  if (!polity) return result;
  const evidence = evidenceIndex(sources);
  for (const claim of array(polity.rulers)) {
    const assessment = assessWithIndex(claim, sources, evidence);
    if (!assessment.accepted || claim.polityKey !== key || ['unverified', 'identity-conflict', 'unattested'].includes(polity.coverage)) { result.unverifiedCount++; continue; }
    const assertions = array(claim.assertions).filter(assertion => sameDates(assertion, claim)
      && (checkedAssertion(assertion, claim, evidence) || extractedAssertion(assertion, claim, evidence)
        && evidence.sampledIds.has(assertion.sourceId) && assertion.imported === true
        && text(assertion.snapshot?.path) && /^[a-f0-9]{64}$/i.test(assertion.snapshot?.sha256 || '')));
    const ongoingUntil = claim.to === null && assertions.length && assertions.every(assertion => assertion.ongoing === true && year(assertion.asOf))
      ? Math.min(...assertions.map(assertion => assertion.asOf)) : null;
    const end = year(claim.to) ? claim.to : ongoingUntil;
    const inPeriod = year(selectedYear) && year(claim.from) && year(end) && claim.from <= selectedYear && selectedYear <= end;
    const active = ['corroborated', 'source-reviewed'].includes(assessment.status) && inPeriod;
    const possiblePeriods = assessment.status === 'disputed' ? array(claim.uncertainty?.alternatives) : [claim];
    const possiblyActive = !active && !['legendary', 'semi-legendary'].includes(assessment.status) && year(selectedYear)
      && possiblePeriods.some(period => year(period.from) && year(period.to) && period.from <= selectedYear && selectedYear <= period.to);
    result.rulers.push({ ...claim, assessment, active, possiblyActive });
  }
  result.rulers.sort((a, b) => (a.from ?? Infinity) - (b.from ?? Infinity)
    || (sourceDay(a.sourceDates?.from) && sourceDay(b.sourceDates?.from)
      ? sourceDay(a.sourceDates.from).localeCompare(sourceDay(b.sourceDates.from)) : 0)
    || (a.to ?? Infinity) - (b.to ?? Infinity) || (a.sequence ?? Infinity) - (b.sequence ?? Infinity) || a.name.localeCompare(b.name));
  if (result.coverage === 'complete' && !completeRoster(polity, sources, evidence)) result.coverage = result.rulers.length ? 'partial' : 'unverified';
  return result;
}
