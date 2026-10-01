# Year format, licence and current-state counts — 2026-09-30

Three follow-up fixes from a review of the September changes. Committed locally,
**not yet pushed or deployed**. Baseline `3dd9e62`, which was live on GitHub
Pages when checked.

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

## Not done

- Not pushed. GitHub's licence detection and the Pages deployment can only be
  checked after publishing.
- No geometry rebuild, performance measurement, or accessibility/cross-browser audit.
- The map defects raised in the same review remain open: the French Fifth
  Republic's 1961–2023 record still includes Algeria (OQ-6), and the
  "Hashemite Arab Federation" label drawn for 1415–1439 is documented in the
  ruler policy but not filed in arbitration.
