# Architecture

**Objective** — give a new maintainer an accurate mental model of how source data
becomes the map, and show where each kind of change belongs.

**Read after** README. **Read before** editing any script. The *reasoning* behind
the resolution rules described here lives in [METHOD.md](METHOD.md); this document
covers mechanism only.

---

## 1. The shape of the system

One offline build, one static site. No server, no database, no API.

```
data/raw/           5 source datasets, ~1.5 GB, never modified, never committed
    |
    |  scripts/resolve.py          the precedence engine: which source wins where
    |  scripts/build_app_data.py   runs the engine, derives everything else
    v
docs/data/*.json    the built map, ~32 MB, committed
    |
    |  docs/index.html + js/       native ES modules + D3/Canvas, no frontend build
    v
GitHub Pages        serves docs/ from main
```

The build is deliberately offline and the output committed. Anyone can clone and
serve the map without touching the sources, the toolchain, or the 1.5 GB of raw
data.

## 2. Repository layout

```
README.md                 orientation and reading order
ARCHITECTURE.md           this file — how it works
METHOD.md                 how the project decides what is true
ONTOLOGY.md               the polity model (specification, NOT implemented)
BACKLOG.md                what is next, and what was tried and rejected
VERSION_HISTORY.md       original viewer snapshot and redesign scope
CREDITS.md                sources and licence obligations
LICENSE                   MIT for code; docs/data is ODbL (see CREDITS)
requirements.txt          pinned — the build needs Shapely 2.x semantics

sources/
  registry.yaml           every source: tier, grade, and spatial/temporal authority
  aliases.yaml            cross-source name reconciliation

arbitration/
  decisions.jsonl         editorial corrections the build applies, with evidence
  OPEN_QUESTIONS.md       decisions deliberately not yet made

scripts/
  fetch_sources.sh        re-download every source dataset
  resolve.py              the precedence engine + a year-auditing CLI
  build_app_data.py       raw sources -> docs/data/*.json
  update_data_versions.py SHA256 cache fingerprints for published JSON
  validate.py             checks that a rebuild still holds
  render_slice.py         static PNG renders for comparing sources by eye

docs/                     the site GitHub Pages serves
  index.html              semantic application shell and controls
  style.css               atlas themes, layout, responsive bottom sheet
  js/app.js               sidebar, search, timeline, playback, coordination
  js/map.js               projections, canvas layers, labels, pointer gestures
  js/data.js              loading, interpolation, search, cached snapshots
  js/data-worker.js       historical JSON parsing and geometry winding
  js/data-version.js      generated data cache fingerprints
  js/state.js             URL state and timeline math
  js/package.json         ES module declaration for Node-based tests
  lib/d3.v7.min.js        vendored
  data/*.json             the built map

data/raw/                 sources, gitignored (fetch_sources.sh restores them)
renders/                  static comparison images
tests/*.test.mjs           native Node viewer tests; no npm dependencies
```

## 3. The pipeline, stage by stage

### `scripts/fetch_sources.sh`
Downloads all five sources into `data/raw/`. Idempotent — safe to re-run, skips
what it already has. This is the only thing standing between a fresh clone and a
full rebuild.

### `scripts/resolve.py` — the precedence engine
Loads `sources/registry.yaml`, applies `arbitration/decisions.jsonl`, and answers
one question: *for a given year, which source's geometry wins where?* Its rules
are stated in [METHOD.md](METHOD.md#3-the-resolution-rules).

It also works standalone as an audit tool:

```bash
.venv/bin/python scripts/resolve.py 117 200 --slice --report out/conflicts.json
```

which prints source agreement (IoU), which polities yielded ground to a higher
tier, and which polities the tiebreak source names that the result does not.

### `scripts/build_app_data.py` — the build
Runs in stages. Each is independent and prints a progress line:

| stage | what it does | cost |
|---|---|---|
| identity | finds Wikidata ids that name more than one polity (see METHOD §5) | seconds |
| tier-2 load | Cliopatria, with arbitration applied | ~30 s |
| tier-1 overrides | splits intervals at authority-window edges, clips or supersedes | ~1 min |
| emit | simplifies geometry, computes geodesic areas, assigns identity keys | ~1 min |
| world population | writes the OWID series | instant |
| label points | chooses where each polity's name sits (see §5 below) | ~4 min |
| index | lifespan and peak extent per polity | seconds |
| succession | infers predecessors and successors geometrically | ~3 min |
| modern countries | which countries each polity covered at peak | ~1 min |
| cache fingerprints | hashes all seven published JSON files after a successful build | seconds |

Roughly ten minutes end to end. `--skip-cities` skips the (unchanging) city
rebuild.

### `scripts/validate.py`
Assertions covering the built data, the arbitration decisions, the tier-1
windows, the label-placement regressions, the derived index facts, and source
agreement. Run it after every build. Checks needing `data/raw/` are skipped, not
failed, on a fresh clone.

`python3 scripts/validate.py --quick` explicitly omits raw-source checks.
`node --test tests/*.test.mjs` checks viewer data behavior, state/timeline math,
and map interaction/rendering invariants. The tests also verify that committed
data fingerprints match the actual bytes.

## 4. Data contracts

Field names are short because `polities.json` is 32 MB.

**`polities.json`** — one record per polity per interval, 12,108 of them:

| field | meaning |
|---|---|
| `n` | polity name |
| `f`, `t` | first and last year of this record, inclusive; negative is BCE |
| `a` | area in km², geodesic, computed from the **resolved** geometry |
| `s` | source id that produced this record — provenance |
| `tier` | precedence tier of that source |
| `k` | identity key grouping records of the same polity (see METHOD §5) |
| `lp` | `[lon, lat]` where the label should sit |
| `g` | GeoJSON geometry, simplified to ~9 km |

**`polity_index.json`** — one entry per distinct polity, 1,544 of them, keyed by
`k`: display name, `first`/`last` lifespan, `peak_year`/`peak_area`, `tstart`/
`tend` flags (true when the dataset, not history, cut the lifespan short), `pred`
and `succ` as `[name, percent]` pairs, and `countries` covered at peak. The
special key `_span` holds the dataset's own year range.

**`years.json`** — 522 change boundaries, including a terminal 2025 boundary.
Navigation uses only nonzero years inside the dataset span, 3400 BCE–2024 CE.

**`cities.json`** — 1,719 cities with population time series, driving which
appear at a given year.

**`population.json`** — world population, 261 points from 10000 BCE to 2023.

**`borders.json`**, **`land.json`** — Natural Earth reference geometry.

## 5. The viewer

The shell and stylesheet load native ES modules with vendored D3. A simple HTTP
server is enough; direct `file://` loading is unsuitable for modules and fetch.

**Reading and navigation.** `app.js` coordinates search across all polity
identities, an explorer, and a persistent detail panel. Details include the
selected year's mapped area, a stepped extent chart, a maximum-extent jump,
inferred relationships, and an expandable list of present-day countries. The
country percentages explain their denominator; relationship labels identify
geometric inference. A selected polity can remain selected in a year when it is
not mapped, with that absence stated explicitly. On narrow screens the sidebar
becomes a bottom sheet. System sans-serif text supports controls and facts;
self-hosted Space Grotesk at medium weight is used for polity labels and detail
headings. All interface text must be informative or instructive; slogans and
promotional descriptions are excluded.

**Loading and caching.** `data.js` fetches seven same-origin JSON files in
parallel. Land and modern borders can render before historical geometry is
ready. A dedicated worker streams, parses, and rewinds the large polity file;
download progress reports actual bytes and uses an unknown total when a
compressed response prevents a reliable denominator. A worker-unavailable
fallback yields between winding batches. Fetch/parse errors lead to an explicit
retry. Snapshots and city rankings each use a 32-year LRU cache; panning does not
recompute population interpolation. Search indexes identity names and their
record aliases, folds accents, and marks activity from actual record intervals.

Each data URL carries the first 16 hexadecimal characters of its SHA256 digest.
`scripts/update_data_versions.py` generates `js/data-version.js` automatically
after a successful data build. Run it directly after individual data replacements;
`--check` verifies without writing. Unchanged files keep the same cache key.

**Rendering.** `map.js` schedules at most one pending animation frame and tracks
what needs redrawing. It reuses a basemap canvas, a filled-scene canvas, projected
`Path2D` shapes and bounds, and measured label text. Hover/selection outlines do
not repaint all territory fills. Camera or year changes rebuild the necessary
projection data. Canvas resolution follows display density up to a 2× cap.
Draw order is sphere/graticule/land, underlaid borders, polity fills, overlaid
borders, city dots, selection outlines, and labels. The Space Grotesk variable
WOFF2 is served from `docs/fonts/`, with a system sans-serif fallback and no
external font request. Once the font loads, the renderer clears measured label
metrics, recomputes collision boxes, and schedules a redraw. Existing geometry,
projected paths, and filled canvas layers remain cached.

**Selection and input.** Hit-testing first rejects out-of-bounds projected
features, then tests spherical containment from smallest territory to largest.
The globe rejects its far side and points outside its visible disc. Pointer
capture, cancellation, and lost-button handling protect drag state; touch supports
pinch zoom. Search and native controls offer keyboard routes to selection,
layers, dates, and playback. With the canvas focused, arrows pan, `+`/`-` zoom,
and Home resets; otherwise arrows navigate map changes. Focus indicators, named
controls, status messages, and reduced-motion styles are implemented; this is
not a claim of a complete accessibility audit.

**State.** `state.js` validates and serializes year, polity, projection, camera,
layers, and timeline scope in the URL fragment. Copy-link sharing preserves that
view. The theme preference uses local storage with a fallback when unavailable.

## 5a. Algorithms worth knowing before you change them

**Interval splitting at authority windows.** When a tier-1 window `[y0, y1]`
overlaps a tier-2 record, the record is cut into up to three spans — `from..y0-1`,
`max(from,y0)..min(to,y1)`, `y1+1..to`. Only the middle span is subject to tier-1;
the outer spans pass through untouched. This is why the build produces 12,108
features from 12,043 source records, and why `years.json` gained snap points at
window edges.

**Geometry processing.** Simplified with `preserve_topology` at 0.08° (~9 km at
the equator — this is a continental-scale viewer), coordinates rounded to 3
decimals. Two separate simplified copies are kept per record: the drawn geometry
and an unclipped one, because succession must be asked of a polity's real extent
rather than a precedence remnant (METHOD §6).

**Timeline scale.** Linear time would crush the era with the most data into a few
pixels, so the slider is piecewise linear over knots:

```
years     -3400   -1000      1     1000    1500    1800    2024
position    0      .13      .32     .52     .67     .80    1.00
```

The years before 1 CE occupy roughly the first third; the last two centuries get
a fifth of the bar.

**Year selection.** The whole-history slider snaps by binary search to the
nearest valid change boundary, choosing the earlier one on a tie. Direct year
entry and 1,000/500/100/25-year timeline windows permit individual years inside
recorded intervals. The previous/next controls and playback use change boundaries.
Year entry accepts BCE/BC, CE/AD, and negative notation; there is no year zero.
The upper bound is 2024, not the current calendar year or the terminal 2025
boundary in `years.json`.

**City visibility.** A city's population at the current year is interpolated in
log space from its Reba series, and it is considered alive from 100 years before
its first data point to 50 years after its last. Population ranking is cached by
year. The renderer culls off-screen cities before applying a viewport-sized
budget and a 13px density grid, so zooming into a region can reveal local cities.
Dot radius is `log10(pop) - 2.5`, clamped to 1.8–4.5px. Names share the polity
label collision system.

**Polity colour.** A stable identity-key hash selects from a curated palette for
each theme. The shared `getPolityColor(key, theme)` function supplies both map
fills and sidebar swatches; changing themes updates existing swatches as well as
the map. Dark mode combines charcoal/gray interface surfaces with subdued slate
and sage territory colors, a mint selection outline, and stronger contrast
between the map and surrounding interface. Identity colors stay consistent
across years without implying a historical relationship. Neighboring territories
may still share a color; adjacency-aware allocation and successor color
inheritance are not implemented. The latter needs the ontology's continuity edges.

**Label placement.** One shared collision system; every label claims a rectangle
and anything overlapping an existing claim, or falling off-screen, is dropped.
The selected polity has first priority, then other visible territories ranked by
projected area, then cities. Long polity names can split over two lines. Polity
labels use medium-weight Space Grotesk with thin text halos for contrast; font
loading refreshes their measured widths before collision decisions. The old
global limits of 26 polity labels and 22 city
names belong to the saved baseline. Anchors are still precomputed by the build
(METHOD §6); the redesign does not change their historical interpretation.

**Geometry winding.** Input polygons use the opposite winding order from D3's
spherical convention. Every ring whose spherical area exceeds half the globe is
reversed on load, preserving the baseline convention. Skipping this would invert
fills. The worker changes where that computation runs, not its result.

## 6. Saved baseline and publishing

The viewer before the UI redesign is preserved by tag `pre-ui-redesign`
(commit `108468a7d158409ab11a9d31b41c70da4b46e1d1`).
[VERSION_HISTORY.md](VERSION_HISTORY.md) explains the snapshot's contents and
how to run it alongside a newer viewer without changing the active checkout.


GitHub Pages serves `docs/` from `main`; the redesign keeps that static deployment
model. There is no frontend bundling or npm installation step. Committing or
publishing a redesign is a separate action from implementing it.

The full `polities.json` remains approximately 32 MB uncompressed. The redesign
does not change generated data, split it by era, or introduce WebGL. Worker
processing and reusable cache keys reduce repeated main-thread/network work;
they do not eliminate the first full geometry download. The baseline used a new
`Date.now()` URL on every visit. No comparative timing claim is made here.

Each data rebuild adds another large blob to Git history; moving generated data
to release assets remains an option if repository growth becomes a problem.
