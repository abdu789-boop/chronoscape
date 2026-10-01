# Ruler expansion and continuation — 2026-09-30

The checked expansion was committed and pushed to `origin/main` as
[`3b57050`](https://github.com/abdu789-boop/chronoscape/commit/3b57050ba9d4d8ab091c14a3302118e5a8c1ac0a).
The remote branch was verified at that exact commit. The original request to
finish ruler coverage for every polity remains **unfinished**; this task keeps
`working` status. This record does not certify a GitHub Pages deployment or
complete historical coverage.

## Canonical artifacts

- [Published ruler data](../../../../docs/data/rulers.json) and
  [reproduction guide](../../../../docs/data/RULERS.md).
- [All-polity work inventory](../../../../sources/rulers/coverage-audit.json),
  [acceptance report](../../../../sources/rulers/accuracy-report.json) and
  [identity audit](../../../../sources/rulers/identity-audit.json).
- [Failed century-list review](../../../../sources/rulers/chronology-review.json),
  [inspected list routes](../../../../sources/rulers/reviewed-list-routes.json)
  and [acceptance policy](../../../../sources/rulers/policy.md).
- [QA index](qa/README.md), [before/after comparison](qa/final-coverage-comparison.json)
  and [extraction inspection](qa/extraction-review.md).
- [Current developer handover](../../../../HANDOVER.md).

## Verified outcome

The public collection has **13,309 accepted reigns across 945 of 1,544 atlas
identities**, compared with 9,567 across 806 at `3c69275`. It gains coverage for
142 previously empty identities and removes the last accepted observations from
three others: the Gutian Dynasty, Galuh Kingdom and Magna Frisia. The net increase
is 3,742 records and 139 populated identities. The removed observations have
unresolved chronology or source-accuracy problems; they remain visible in the
source/review history rather than being kept to inflate coverage.

Accepted statuses reconcile to 270 individually cross-checked, 12,278
sampled-source, 501 approximate, 21 disputed and 239 incomplete-date reigns.
**599 identities still have no accepted ruler; zero rosters are certified
complete.** The work inventory accounts for every key: 945 partial rosters,
3 empty identity-review cases, 49 empty scope/evidence-review cases and 547
empty source-acquisition/extraction cases. These are work dispositions, not
scholarly classifications of what can ever be known.

The final Wikipedia extraction contains 9,136 observations across 745 polities
from 1,883 cached pages. These overlap existing source families; extraction
counts must not be added to public coverage. The identity audit considers
15,539 accepted source observations, consolidates 2,171 duplicates, and retains
36 conflict pairs and eight ambiguous incomplete-tenure holds. There are 321
withheld comparisons/claims in the public acceptance report; that is not a count
of all missing rulers or all adapter-level holds.

## Decisions and evidence limits

The detailed Wikipedia source passes 29/30 independently compared sample
records and Wikidata passes 30/30. They remain one publication lineage for
independence. The separate century-list family matches only 26/30, below the
existing 90% gate. All four failures are retained, and its unchecked tenure
records never enter the production input list. Its destination links are
discovery leads; eligible observations come from separately inspected detailed
succession sources. Samples do not independently verify every imported row.

Named officeholders with explicitly incomplete source dates retain null bounds,
source date text, snapshots and the `dates-unknown` status. Reign lengths and
floruit expressions never become invented endpoints. These records cannot appear
active or possibly active for a selected year. Undated observations that cannot
be assigned to an already recorded tenure episode remain held. Source table order
is preserved across table boundaries when sorting unknown dates.

The extractor excludes navigation and office labels, preserves explicit branch
scopes, distinguishes dates from durations, and holds known source disputes and
unsupported historicality. It corrects the medieval Serbia/modern source mismatch
and uses the Cretan State's commissioners instead of Ottoman provincial governors.
Actual tenures are not clipped to map intervals. The existing Archigos
effective-leader definition can include collective executives; it is not a claim
that every accepted record is an individual monarch.

## Validation

Release logs and screenshots are under [qa/](qa/README.md):

- 95 JavaScript tests and 55 Python tests pass.
- 46 full historical/map checks pass with no failures or raw-source skips.
- Public builder, identity audit, coverage audit and eight cache fingerprints
  reproduce from the final evidence.
- 17 desktop/mobile Chrome checks pass without page errors. Six release
  screenshots were inspected, including incomplete dates, disputed Parthian
  chronology, consolidated Mughal evidence and mobile tooltip bounds.
- Cached source receipts match raw hashes; counts and missing-file checks are
  retained in [the snapshot check](qa/source-snapshot-check.json).
- The durable-record validator result is in `qa/closeout-validation.json`.

Environment: Node.js 24.19.0, project Python 3.10.9, Playwright 1.62.1 and installed
Chrome on macOS. The static server used port 8451. Browser module/executable
overrides follow [the browser setup guide](../../../../tests/browser/README.md).
Earlier failures and intermediate snapshots are retained and identified by the
QA index. Map geometry did not change. No full geometry rebuild, new performance
measurement, full accessibility/cross-browser audit or live deployment check was
performed.

## Exact continuation

1. Select work from `sources/rulers/coverage-audit.json`. Resolve identity and
   jurisdiction mismatches before importing dates. Inspect sources for the
   547 acquisition/extraction cases; an empty parser result is not proof that a
   source or historical ruler is absent.
2. For held traditional, disputed or incomplete chronologies, acquire appropriate
   scholarly assessments. Do not infer legendary status or fabricate dates to
   fill a roster. Keep the failed century-list family excluded until a new
   justified editorial review resolves its failed gate.
3. Expand and reconcile existing partial lists, retaining restored reigns and
   separate offices. A complete scoped roster needs two independently reconciled
   whole rosters, including exclusions and omissions, under the current policy.
4. Regenerate the affected source adapters, broad comparisons and identity
   evidence; then run the audit/build/coverage/fingerprint sequence in the ruler
   guide. Repeat relevant checks after actual changes.

Raw snapshots under ignored `data/raw/rulers/` must be transferred separately for
exact re-extraction. Committed normalized evidence supports an offline public
rebuild without that cache. Fresh downloads can differ. Inputs and exploratory
notes remain in their original workstream locations; canonical datasets are
linked, not copied. Developer setup, current-state and deliverable indexes have
been refreshed. The ontology remains a specification, and map-source pinning,
CI and successor deployment access remain separate follow-ups.
