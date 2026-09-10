/** Apply an independently reproducible identity audit to accepted source records.
 * Sources remain separate observations: merging display rows never manufactures
 * an independent comparison or changes a source's admission status.
 */
export function applyIdentityAudit(data, report, audit) {
  const byId = new Map(Object.values(data.polities).flatMap(p => p.rulers).map(r => [r.id, r]));
  const identities = new Map(audit.identities.map(r => [JSON.stringify([r.polityKey, r.personKey]), r.canonicalPerson]));
  const identity = r => identities.get(JSON.stringify([r.polityKey, r.personKey])) || r.personKey;
  const signature = r => JSON.stringify([r.polityKey, r.from, r.to, r.ongoing, r.asOf]);
  const omitted = new Set();
  const planned = new Set();
  const conflicted = new Set(audit.conflicts.flatMap(g => g.ids));
  for (const group of audit.merges) {
    if (group.ids.some(id => planned.has(id)) || new Set(group.ids).size !== group.ids.length) throw new Error('Overlapping identity consolidation');
    group.ids.forEach(id => planned.add(id));
    const rows = group.ids.map(id => byId.get(id));
    if (rows.length < 2 || rows.some(r => !r || r.polityKey !== group.polityKey || identity(r) !== group.canonicalPerson)
      || new Set(rows.map(signature)).size !== 1) throw new Error('Invalid identity consolidation: ' + group.ids.join(', '));
    if (rows.some(r => conflicted.has(r.id))) rows.forEach(r => conflicted.add(r.id));
  }
  for (const conflict of audit.conflicts) {
    const rows = conflict.ids.map(id => byId.get(id));
    if (rows.some(r => !r || r.polityKey !== conflict.polityKey || identity(r) !== conflict.canonicalPerson)) throw new Error('Invalid identity conflict');
  }
  report.identityAudit = { summary: audit.summary, consolidated: [], conflicts: audit.conflicts, retainedDistinctTerms: audit.retainedDistinctTerms };
  for (const id of conflicted) {
    const claim = byId.get(id);
    report.withheld.push({ family: 'identity-audit', claim,
      reason: 'Canonical identity reveals incompatible overlapping accounts of the same office; retained in the identity audit pending chronology/scope resolution.' });
    omitted.add(id);
  }
  const status = new Map(report.accepted.map(r => [r.id, r.status]));
  for (const group of audit.merges) {
    if (group.ids.some(id => conflicted.has(id))) continue;
    const rows = group.ids.map(id => byId.get(id));
    rows.sort((a,b) => Number(!!b.uncertainty) - Number(!!a.uncertainty)
      || Number(b.precision === 'approximate') - Number(a.precision === 'approximate')
      || Number(status.get(b.id) === 'corroborated') - Number(status.get(a.id) === 'corroborated')
      || Number(!/^(Head of |Effective |Monarch|Sovereign)/i.test(b.role)) - Number(!/^(Head of |Effective |Monarch|Sovereign)/i.test(a.role))
      || a.id.localeCompare(b.id));
    const keeper = rows[0];
    keeper.canonicalPerson = group.canonicalPerson;
    keeper.aliases = [...new Set([...(keeper.aliases || []), ...rows.flatMap(r => [r.name,...(r.aliases || [])])])];
    if (group.displayName) keeper.name = group.displayName;
    keeper.aliases = keeper.aliases.filter(n => n !== keeper.name);
    keeper.mergedEvidence = rows.slice(1).map(r => structuredClone(r));
    for (const r of rows.slice(1)) omitted.add(r.id);
    report.identityAudit.consolidated.push({ keptId: keeper.id, removedIds: rows.slice(1).map(r => r.id),
      polityKey:group.polityKey, canonicalPerson:group.canonicalPerson, name:keeper.name, identityEvidence:group.identityEvidence });
  }
  for (const polity of Object.values(data.polities)) {
    polity.rulers = polity.rulers.filter(r => !omitted.has(r.id));
    if (!polity.rulers.length && polity.coverage === 'partial') {
      polity.coverage = 'unverified'; polity.research.status = 'awaiting-independent-source-review'; polity.sourceIds = [];
    }
  }
  for (const correction of audit.displayCorrections || []) {
    const row = byId.get(correction.id);
    if (!row || identity(row) !== correction.canonicalPerson || !correction.name) throw new Error('Invalid ruler display correction');
    if (omitted.has(row.id) || row.name === correction.name) continue;
    row.aliases = [...new Set([...(row.aliases || []), row.name])].filter(n => n !== correction.name);
    row.name = correction.name;
  }
  report.identityAudit.displayCorrections = audit.displayCorrections || [];
  report.accepted = report.accepted.filter(r => !omitted.has(r.id));
  report.identityAudit.removedDuplicates = report.identityAudit.consolidated.reduce((n,g) => n+g.removedIds.length,0);
  report.identityAudit.withheldConflictingRecords = conflicted.size;
}
