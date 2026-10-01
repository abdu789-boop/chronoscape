# Verification evidence

The release checks are the files ending in `-release.log`,
`final-coverage-comparison.json`, `source-snapshot-check.json`,
`full-historical-validation.log`, `closeout-validation.json`, and the
`browser-release/` screenshots. See the task handoff for the final totals.

Earlier `pass*`, `final`, `verified`, `scope-fixed` and other logs are retained
as intermediate work. In particular, `logic-tests.log` records a stale generated
input before the public rebuild; it is superseded by the complete release test
run. The first browser screenshots in `browser/` precede the final table-order
correction; the release browser run uses a separate directory.

The 36-row diagnostic selection in `working/notes/` found extraction problems.
[extraction-review.md](extraction-review.md) records their resolution. That
selection is not a passed independent historical accuracy sample. Executed
source comparisons, including failed examples, remain in the canonical
`broad-import.json` and `chronology-review.json` at `sources/rulers/`.

Software checks establish pipeline behavior and reproducibility. They do not
independently verify every historical claim or establish complete succession
lists. The full map validation had no skipped raw-source checks; raw downloads
and a full geometry rebuild were not repeated.

Whitespace on blank lines in the retained intermediate failure log was normalized
for Git; its diagnostic content is unchanged.
