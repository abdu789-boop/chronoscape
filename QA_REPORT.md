# Verification record

## Folio interface — 2026-10-01

Interface, search and display changes; geometry and ruler data unchanged. A new
derived file, `docs/data/aliases.json`, is generated from `sources/aliases.yaml`.
Passed:

- 102 JavaScript tests, including new tests for search ranking and aliases, map
  changes, timeline hatching, the city rule, globe orientation and framing above
  an overlay, and 55 Python tests.
- 47 full historical/data checks with no failures or skipped raw-source checks,
  including a new check that `aliases.json` matches its source.
- Reproducible public ruler build, coverage audit, alias file and cache
  fingerprints.
- 17 ruler and 13 atlas browser checks in Chrome without page errors.
  - The atlas suite checks What changed for 1206 CE and search by alternative
    name, place, ruler and year.
  - It also checks polity playback stopping at its last year, globe orientation,
    the dark theme, and the phone sheet framing the polity.
  - All 12 screenshots were inspected.
- Local frame timing against the previous site (one run per view): drag frames
  9–12 ms median in both versions. A year step is 18 / 24 ms against 15 / 21 ms
  (world / zoomed). A full-detail frame of 13–15 ms follows camera movement.
  These are single local measurements, not a frame-rate guarantee.

Published 2026-10-01 as `9664250`. The Pages deployment succeeded, the live
files matched the commit, and both browser suites passed against the live site
with their screenshots inspected.

Not checked: accessibility conformance, physical devices, browsers other than
Chrome. Evidence is in the
[workstream record](workstreams/maintenance/chats/2026-10-01__folio-interface/handoff.md).

## Year format, licence and count fixes — 2026-09-30

Application code changed only in the year formatter; data and geometry were
unchanged. Passed:

- 97 JavaScript tests, including two new current-state guards, and 55 Python tests.
- 46 full historical/data checks, with no failures or skipped raw-source checks.
- Reproducible public ruler build, coverage audit and cache fingerprints.
- 17 desktop/mobile Chrome checks without page errors. All six screenshots were
  inspected for year formatting, including four-digit BCE and CE years.
- Mutation check: the current-state guard fails on a one-reign table change and
  on comma-formatted years.

Published 2026-10-01 as `5200e2b`. The Pages deployment succeeded, all 17
browser checks passed against the live site with the year-format screenshots
inspected, and GitHub identifies the licence as MIT. Logs, screenshots and
environment are in the
[workstream record](workstreams/maintenance/chats/2026-09-30__year-format-licence-counts/handoff.md).

## Ruler expansion — 2026-09-30

The release contains 13,309 accepted reigns across 945 atlas identities; 599
remain without accepted rulers and no roster is certified complete. Passed:

- 95 JavaScript tests and 55 Python extraction/identity tests.
- 46 full historical/data checks, with no failures or skipped raw-source checks.
- Reproducible public build, identity audit, all-polity coverage audit and cache
  fingerprints from the final committed evidence.
- 17 desktop/mobile Chrome browser checks; six release screenshots visually
  inspected, including incomplete tenure dates without inferred activity.
- Cached Wikipedia, identity, century-list and additional-reference snapshots
  match their acquisition hashes; exact counts are retained in the task QA.

Wikipedia's detailed succession source passed 29/30 sampled independent
comparisons and Wikidata passed 30/30. The century-list source failed at 26/30;
all four failures remain inspectable and its unchecked dates are excluded.
Identity consolidation removed 2,171 duplicate observations; ambiguous dated and
undated episodes and known chronology conflicts remain held. Earlier extraction
errors, parser corrections and removed prior observations are documented in the
[task handoff and QA](workstreams/rulers/chats/2026-09-29__complete-ruler-coverage/handoff.md).

The software checks establish reproducibility and behavior, not complete
historical coverage. Map geometry was unchanged; a full geometry rebuild,
performance remeasurement, comprehensive accessibility audit and live deployment
check were not performed for this update.


## Previous handover audit — 2026-09-29

Rechecked the local application at `1e83435` after documenting setup and adding
the missing `lxml` and `pypdf` Python dependencies. Application code and generated
data were unchanged. Passed:

- 91 JavaScript tests under Node.js 24.19.0.
- 35 Python extraction/identity tests under the project Python 3.10.9 environment.
- 46 full historical/data checks, with zero failures or skips.
- Offline public ruler build and identity-audit comparisons; data fingerprints.
- 16 Playwright browser checks in installed Chrome, including desktop and
  emulated mobile ruler interactions; five saved screenshots visually inspected.
- Benchmark page preparation from the preserved baseline (no new timings).

Commands, setup and retained evidence are linked from [HANDOVER.md](HANDOVER.md)
and the [dated task record](workstreams/maintenance/chats/2026-09-29__developer-handover/handoff.md).
Initial dependency-download and Chrome-launch attempts were blocked by the local
sandbox environment; permitted retries succeeded. Their logs are retained with
the successful results. No fresh raw-source download, full geometry rebuild,
remote deployment check or comprehensive accessibility audit was performed.

## Historical UI redesign verification

The remainder of this report preserves the earlier release evidence. Its test
counts and performance measurements describe that revision, not current HEAD.

The reference version is Git tag `pre-ui-redesign`
(`108468a7d158409ab11a9d31b41c70da4b46e1d1`). This report records interface
verification and release checks for published viewer revision `032bc9a`.

## Typography, text, and dark-theme refinement

Follow-up to the initial redesign at `ee4339a`. Checked the updated map in light
and dark modes at world and regional zoom, including a selected Ottoman Empire
in 1572 CE. Inspected the 375 × 812 mobile detail sheet and help dialog; restored
the browser viewport after verification. The new font renders in both Canvas
labels and the detail heading. The 49,256-byte WOFF2 is self-hosted with the app.

Dark mode uses neutral charcoal surfaces, slate/sage territories, white text,
and a mint selection outline. Date/count and legend backgrounds maintain text
contrast over territory fills. Sidebar swatches update to match the map palette
when the theme changes. In-app text was audited across HTML and JavaScript;
headings, loading messages, help, and controls now contain facts or instructions.

The benchmark measurements below belong to the initial redesign at `ee4339a`;
the styling refinement was not re-benchmarked. Automated checks were rerun before
publishing `032bc9a`. Historical JSON files remain unchanged.

## Automated checks

- `node --test tests/*.test.mjs`: 23 tests passed under Node 24.19.0.
  Coverage includes BCE/CE parsing, nonexistent year zero, interval boundaries,
  population interpolation, temporal search, cache eviction, data fingerprints,
  progressive loading and HTTP failures, URL validation, time-window bounds,
  map hit testing, globe clipping, pointer cancellation, shared cameras, and
  late font loading without geometry recomputation or post-disposal frames.
- `.venv/bin/python scripts/validate.py`: all 46 historical/data checks passed
  before publishing, with no failures or skips, including the raw-source checks.
  The quick run also passed 43 checks and skipped its raw-source group as intended.
- `python3 scripts/update_data_versions.py --check`: passed.
- Published historical JSON files are byte-for-byte unchanged from the saved
  baseline. No source precedence, arbitration, or ontology rules changed.

Renderer tests use real D3 projections and geometries with mocked Canvas drawing
operations. Actual Canvas output and interaction were also inspected in-browser.

## Browser checks

Checked in the Codex Chromium browser on macOS at desktop and mobile sizes,
including 1440 × 900, 375 × 812, and 320 × 568 CSS pixels. After the
[successful GitHub Pages deployment](https://github.com/abdu789-boop/chronoscape/actions/runs/34177477259),
the public site loaded the redesigned interface and historical data. Dark mode
was checked again at 375 × 812 CSS pixels on that public deployment.

- Polity selection, zoom-to-territory and maximum-extent jumps.
- Keyboard search, selection from another era, and dismissing results.
- Exact 1453 CE entry and rejection of year zero without changing the map.
- A selected Roman Empire at 1453 CE reports “Not mapped” and clears current
  area instead of displaying stale values; its historical details remain.
- Whole-history and focused time windows, keyboard stepping through a window
  boundary, timeline playback and pausing.
- Flat/globe projection, light/dark themes, city and modern-border controls.
- Mobile detail-sheet dismissal, help, and share-link action.
- Shared year, selection, layers and camera survive reload.
- No horizontal overflow at 320 px width. Mobile help and sharing remain
  available, and the detail sheet leaves the header and map controls visible.
- Map labels reserve space for overlaid controls. Time-axis labels are culled
  when they would collide at narrow widths.

Primary/secondary text contrast against the panel background is approximately
13.6:1 / 5.0:1 in light mode (`#fbfaf6`) and 14.1:1 / 8.5:1 in dark mode
(`#202325`). These checks cover the panel text/background pairs, not a full accessibility
conformance audit or a physical-device touch test.

## Reproducing rendering measurements

```bash
python3 scripts/prepare_benchmark.py
python3 -m http.server 8451 --directory docs
```

Open `/qa/benchmark.html` and run the benchmark. Source harness files live in
`tests/browser/`; generated pages in `docs/qa/` are ignored by Git. The harness
extracts the saved renderer from the baseline tag and runs both renderers at
matched map size, projection, raster density, camera, and data year.

The measured time covers synchronous data preparation and Canvas/D3 draw
callbacks. It excludes download, parsing, worker startup, animation-frame waits,
browser paint, and GPU completion. Both renderers keep their actual label/city
algorithms, so this measures their implemented behavior rather than identical
draw commands. It is not an end-to-end load-time or frames-per-second result.

## Local rendering comparison

Measured on 2026-09-08 at 01:26 UTC in Chromium 152 on macOS, using a
1000 × 640 CSS-pixel map and device pixel ratio 2. The camera workload uses
2024 with populated geometry; all tested years are inside the supported span.

| Workload | Samples per viewer | Original median | Redesign median | Original p90 | Redesign p90 |
|---|---:|---:|---:|---:|---:|
| First-pass year updates | 24 | 8.75 ms | 3.25 ms | 17.80 ms | 9.20 ms |
| Revisited year updates | 24 | 7.20 ms | 2.40 ms | 16.20 ms | 8.20 ms |
| Camera movement, 2024 | 40 | 12.35 ms | 11.85 ms | 15.40 ms | 12.50 ms |

Year updates used about 63–67% less CPU time in this run; camera medians were
similar. This is one local comparison and is subject to browser, machine, and
sampling variation. It supports the year-navigation improvement, not a blanket
speedup or a frame-rate guarantee. An earlier exploratory camera run included
the empty terminal year 2025; it was discarded, and the harness now asserts a
supported year and nonempty geometry for every camera sample.

## Remaining limits

First use still downloads the complete historical geometry. Content-versioned
URLs permit reuse afterward, and parsing/winding runs in a worker when available.
Era sharding, adjacency-aware color assignment, and ontology implementation remain
future work. Present-day boundaries are reference layers; source geometry and its
documented uncertainties are unchanged.
