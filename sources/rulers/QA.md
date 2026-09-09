# Ruler feature verification — 2026-09-09

Implementation checks were recorded before publication. Release history is
maintained in `VERSION_HISTORY.md` and Git.

## Current coverage

- 1,544 exact atlas keys have coverage and source-discovery records.
- 806 keys contain 10,933 accepted reign records; 738 have no accepted roster.
- 280 reign records are individually cross-checked; 10,305 carry the sampled-source
  status; 327 retain approximate dates and 21 display disputed chronologies.
- No roster is claimed complete. Major polities also have omissions.
- 182 compared/candidate records are withheld by the public builder. Additional
  held or unresolved acquisition rows remain in the adapter audits; this is not
  a count of all missing historical rulers.
- New extraction artifacts contain 4,374 Wikipedia observations across 525
  polities, 3,154 Wikidata observations across 259 and 594 additional reference
  observations across 88. These overlap and are not additive coverage totals.

The executed comparisons, source snapshots and input hashes are recorded in
`accuracy-report.json` and `broad-import.json`. The Wikipedia collection passed
30/30 sampled comparisons against independent classical, Chinese and modern reference
records across 16 exact atlas identities; Wikidata passed 30/30 across the United States,
Australia and India. Archigos retains its original 7/7 sample and two additional
comparisons; the Islamic compilation retains its 9/10 sample, with the
conflicting Mahmud entry withheld. Samples use identity and office before date
agreement. These limited samples are not estimates of the overall error rate,
and Wikipedia and Wikidata count as one publication lineage.

## Broader acquisition and scope checks

The release combines Wikipedia succession tables and dated polity infoboxes,
Wikidata statements on heads of state/government and their explicitly linked
offices, and additional explicit Archigos and Islamic Atlas polity crosswalks.
Original snapshots remain cached locally; committed normalized evidence records
retain source URLs, record locators, raw dates, provenance and SHA-256 hashes.

Targeted review covered polity identity, BCE date conventions, office scope,
interrupted and same-year terms, disputed claimants, collective officeholders,
transliterated names, and whole tenures crossing incompatible regimes. It found
and corrected name-link extraction and inherited heading errors, retained
separate restorations, and withheld unresolved intervals instead of clipping
them. Explicit person aliases consolidate inspected duplicate identities;
unrelated monarchs are never joined merely because dates agree.

The Parthian list retains the reference table's named alternative chronologies
with disputed or approximate labels. Its underlying books were not independently
read. Ordinary unresolved contradictions remain withheld, including when new
evidence contradicts an older imported row. Missing material does not justify a
legend classification. Traditional Roman royal chronology and unqualified
claimants remain held for review. The source's last observation of an ongoing
term is replaced only when a later explicit end matches the person, accession
and office; this closes the previous Obama and Turnbull cutoff records.

## Checks performed

- `node --test tests/*.test.mjs`: **84 passed**. Includes adversarial
  evidence checks, source sampling, provenance fingerprints, exact atlas-key
  coverage, duplicates, contrary evidence propagation, independent loading,
  timeout and retry.
- Bundled Python, `-m unittest discover -s tests -p 'test_ruler_*.py'`:
  **23 passed**, covering Wikipedia parsing and Wikidata normalization.
- `.venv/bin/python scripts/validate.py`: **46 passed, 0 failed, 0 skipped**,
  including full raw geometry-source agreement checks; geometry was unchanged.
- `node scripts/build_rulers.mjs --check`: passed; committed evidence reproduces
  the public dataset and source audit.
- `prepare_ruler_broad_import.py`: repeat execution is byte-identical. The
  pre-expansion baseline's 3,130 accepted IDs are persisted so publication of a
  new build cannot change which historical reference rows seed comparison.
- `python3 scripts/update_data_versions.py --check`: passed.
- `git diff --check`: passed.
- `scripts/qa_rulers.cjs` in installed Chrome: **12 browser checks passed**:
  ruler selection, stable list on year changes, keyboard expansion without
  triggering playback, evidence links, Wikipedia links with and without a
  roster, mobile horizontal overflow, sampled-source labels, the expanded
  Parthian chronology, explicit missing coverage, removal of polity shortcuts,
  Ottoman search selection and no page errors.

Browser screenshots and the executable run report are local working evidence
under `/private/tmp/chronoscape-rulers-qa/`; the repeatable QA script is saved as
project source. Desktop, Parthian and 390×844 mobile screenshots were visually
inspected.

## Product changes and limits

The polity Wikipedia article stays linked above every available ruler list.
Polity shortcuts and the proposed language/religion features remain removed.
The ruler panel supports dates, repeated accessions, concurrent offices,
evidence links, partial coverage and uncertainty labels. Source-specific roles
remain explicit: effective political leaders are not presented as a complete
monarchy list. Rulers load independently of the map with a 15-second timeout.

Coverage remains partial. The implementation must not be described as all rulers
for all 1,544 polities; source, identity and acquisition gaps remain visible.
