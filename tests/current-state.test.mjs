import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmtYear } from '../docs/js/data.js';

// HANDOVER.md's current-state table is the one place the headline counts are
// maintained; other documents link to it. These tests keep it truthful: edit the
// data without the table, or the table without the data, and they fail.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const count = n => n.toLocaleString('en-US');

function currentStateRow(label) {
  const row = read('HANDOVER.md').split('\n').find(line => line.startsWith(`| ${label} |`));
  assert.ok(row, `HANDOVER.md current-state table has no "${label}" row`);
  return row;
}

function assertStates(label, phrases) {
  const row = currentStateRow(label);
  for (const phrase of phrases) assert.ok(row.includes(phrase), `${label} row should state "${phrase}": ${row}`);
}

test('handover current-state table matches the committed map data', () => {
  const polities = json('docs/data/polities.json');
  const index = json('docs/data/polity_index.json');
  const [first, last] = index._span;
  assertStates('Map', [
    `${count(polities.length)} interval records`,
    `${count(Object.keys(index).filter(key => key !== '_span').length)} identities`,
    `${fmtYear(first)}–${fmtYear(last)}`,
  ]);
});

test('handover current-state table matches the committed ruler data', () => {
  const { summary } = json('docs/data/rulers.json');
  const audit = json('sources/rulers/coverage-audit.json').summary;
  const status = audit.acceptedStatuses;
  const work = audit.dispositions;
  assertStates('Rulers', [
    `${count(summary.checkedReigns)} accepted reigns across ${count(summary.politiesWithCheckedRulers)} identities`,
    `${count(summary.politiesWithoutAcceptedRulers)} without accepted rulers`,
    summary.completeRosters === 0 ? 'no complete roster' : `${count(summary.completeRosters)} complete roster`,
  ]);
  assertStates('Ruler evidence', [
    `${count(status.corroborated)} individually cross-checked`,
    `${count(status['source-reviewed'])} sampled-source`,
    `${count(status.approximate)} approximate`,
    `${count(status.disputed)} disputed`,
    `${count(status['dates-unknown'])} incomplete-date`,
  ]);
  assertStates('Ruler work', [
    `${count(work['source-acquisition-or-extraction'])} source-acquisition/extraction`,
    `${count(work['scope-or-evidence-review'])} scope/evidence-review`,
    `${count(work['identity-review'])} identity-review`,
  ]);
});
