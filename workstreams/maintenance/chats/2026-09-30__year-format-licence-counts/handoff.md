# Year format, licence and current-state counts — 2026-09-30

Three follow-up fixes from a review of the September changes. **Published
2026-10-01 as `5200e2b`**; the previous deployment was `3dd9e62`. See
[Publication](#publication) for the production checks.

## Changes

1. **Years show no thousands separator.** `fmtYear` rendered every year from
   1000 onward as "1,970 CE". Standard style omits the separator in four-digit
   years, and the app's own timeline labels already did. Years now have one only
   at five digits or more ("10,000 BCE"). Every year the UI renders goes through
   `fmtYear` (sidebar, ruler panel, tooltips, year box, screen-reader labels), so
   one change covers them all. The unit test that asserted "3,400 BCE" now asserts
   "3400 BCE", and a round-trip check confirms the year box's displayed text
   parses back to the same year.
2. **LICENSE is plain MIT and detectable.** A note inserted into the MIT text
   named a directory that no longer exists (`app/data/`), described all data as
   ODbL although `rulers.json` includes CC BY-SA material, and stopped GitHub
   recognizing the licence: its API reported "Other" (NOASSERTION). LICENSE now
   holds only the standard text, and CREDITS.md § Licensing of this repository
   records everything MIT does not cover. D3's ISC licence requires its
   permission notice in every copy, and the site did not ship one; the upstream
   d3@7.9.0 notice is now at `docs/lib/LICENSE-d3.txt`.
3. **Current counts have one tested home.** Headline counts were copied into four
   current-state documents. HANDOVER.md's current-state table is now the only
   maintained copy, with a new "Ruler work" row for the work-inventory split.
   README, ARCHITECTURE, BACKLOG, knowledge/CURRENT and deliverables/CURRENT link
   to it. `tests/current-state.test.mjs` compares the table with
   `docs/data/polities.json`, `polity_index.json`, `rulers.json` and the coverage
   audit, formatting years with the app's own `fmtYear`. Dated records keep their
   as-of counts.

No data, geometry or ruler evidence changed.

## Verification

Logs, screenshots and environment are in [qa/](qa/).

- 97 JavaScript tests (95 before, plus the two current-state guards) and 55
  Python tests pass.
- 46 full historical checks pass with no failures and no raw-source skips.
- The public ruler build, coverage audit and data fingerprints reproduce.
- 17 Playwright/Chrome checks pass without page errors. All six screenshots were
  inspected: the Mughal panel reads "1650 CE" and "1628 CE – 1658 CE", and the
  Old Kingdom panel "2500 BCE".
- The guard was mutation-checked: changing one reign in the table, or
  reintroducing comma-formatted years, each makes it fail
  ([guard-mutation-check.txt](qa/guard-mutation-check.txt)).
- All 63 relative links in the edited documents resolve, including anchors.

Node.js is not on this machine's PATH; the Codex-bundled Node 24.19.0 and
Playwright 1.62.1 were used with installed Chrome
([environment.txt](qa/environment.txt)).

## Publication

Pushed `3dd9e62..5200e2b` at the user's request. Evidence is in
[qa/live/](qa/live/), summarized in
[publication-check.txt](qa/live/publication-check.txt).

- GitHub Pages deployment `6783340407` for `5200e2b` succeeded
  ([workflow run](https://github.com/abdu789-boop/chronoscape/actions/runs/36857034663)).
- GitHub now identifies the licence as **MIT**, detected from the pushed LICENSE
  blob `641a5f0`; before this release its API reported "Other".
- The live site serves the new `fmtYear` and `lib/LICENSE-d3.txt`, and its data
  fingerprints match the committed data.
- The 17-check browser suite passed against the live site. Its Mughal and Old
  Kingdom screenshots were inspected: "1650 CE", "1628 CE – 1658 CE", "2500 BCE".

## Not done

- No geometry rebuild, performance measurement, or accessibility/cross-browser audit.
- The map defects raised in the same review remain open: the French Fifth
  Republic's 1961–2023 record still includes Algeria (OQ-6), and the
  "Hashemite Arab Federation" label drawn for 1415–1439 is documented in the
  ruler policy but not filed in arbitration.
