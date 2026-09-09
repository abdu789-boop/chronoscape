# Ruler feature verification — 2026-09-09

Implementation checks were recorded before publication. Release history is
maintained in `VERSION_HISTORY.md` and Git.

## Current coverage

- 1,544 exact atlas keys have a coverage and source-discovery record.
- 287 keys contain 3,130 accepted reign records; 1,257 have no accepted roster.
- 281 reign records are individually cross-checked; 2,812 are imported from
  sources checked by sample; 37 retain approximate-date status.
- No roster is claimed complete. Major polities also have omissions.
- 106 compared/candidate records are withheld by the builder. Additional
  unresolved reference rows remain in the reference acquisition audit; this is
  not a count of all missing historical rulers.

The executed details and input hashes are in `accuracy-report.json`. Archigos
passed 7/7 sample comparisons; the Islamic compilation passed 9/10, with the
disagreeing Mahmud entry withheld. Samples are limited and are not estimates of
the overall error rate. Known classical and Chinese date/scope conflicts also
remain withheld. No Wikidata assertions were acquired or accepted.

## Checks performed

- `node --test tests/*.test.mjs`: **69 passed**. Includes adversarial evidence
  checks, sampled-source admission, production records, provenance fingerprints,
  exact atlas-key coverage, independent loading, timeout and retry.
- `python3 scripts/validate.py --quick`: **43 passed, 0 failed, 1 skipped**.
  The skipped geometry-source agreement check requires the full validation run;
  geometry data was not changed.
- Final pre-push `.venv/bin/python scripts/validate.py`: **46 passed, 0 failed,
  0 skipped**, including the raw-source agreement checks.
- `node scripts/build_rulers.mjs --check`: passed; project evidence reproduces
  the public dataset and source audit.
- `python3 scripts/update_data_versions.py --check`: passed.
- `git diff --check`: passed.
- `scripts/qa_rulers.cjs` in installed Chrome: **10 browser checks passed**:
  ruler selection, stable list on year changes, keyboard expansion without
  triggering playback, source links, mobile horizontal overflow, sampled-source
  labels, explicit missing coverage, removal of polity shortcuts, search
  selection, and no page errors.

Browser screenshots and the executable run report are local working evidence
under `/private/tmp/chronoscape-rulers-qa/`; the repeatable QA script is saved as
project source. Desktop and 390×844 mobile screenshots were visually inspected.

## Product changes and limits

Polity shortcuts and the proposed language/religion features are removed. The
ruler panel supports dates, repeated accessions, concurrent offices, evidence
links, partial coverage, and uncertainty labels. Source-specific roles remain
explicit: modern effective political leaders are not presented as a complete
monarchy list. Rulers load independently of the map with a 15-second timeout.

The remaining work is coverage research, not a passing test that can conjure
missing lists. Existing source and identity gaps remain visible. The local
implementation must not be described as all rulers for all 1,544 polities.
