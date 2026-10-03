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
data/raw/           map source snapshots, never edited by hand, never committed
    |
    |  scripts/resolve.py          the precedence engine: which source wins where
    |  scripts/build_app_data.py   runs the engine, derives everything else
    v
docs/data/          map, independent ruler data and present-day geography,
                    ~64 MB total, committed
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
HANDOVER.md               current developer setup, checks, release and known gaps
AGENTS.md                 repository guidance for coding agents
knowledge/                current-state pointer and documentation audit history
deliverables/             canonical artifact index (no duplicate data copies)
workstreams/              handover records and retained QA evidence
CREDITS.md                sources and licence obligations
LICENSE                   MIT, project code only; data and D3 licences in CREDITS
requirements.txt          pinned — the build needs Shapely 2.x semantics

sources/
  registry.yaml           every source: tier, grade, and spatial/temporal authority
  aliases.yaml            cross-source name reconciliation; also published for search
  rulers/                 committed extracted evidence, comparisons and audits

arbitration/
  decisions.jsonl         editorial corrections the build applies, with evidence
  OPEN_QUESTIONS.md       decisions deliberately not yet made

scripts/
  fetch_sources.sh        download missing map inputs (not ruler snapshots)
  resolve.py              the precedence engine + a year-auditing CLI
  build_app_data.py       raw sources -> docs/data/*.json
  build_aliases.py        sources/aliases.yaml -> docs/data/aliases.json (search)
  build_geography.py      Natural Earth rivers, lakes, relief -> rivers.json, terrain.webp
  update_data_versions.py SHA256 cache fingerprints for published data files
  validate.py             checks that a rebuild still holds
  render_slice.py         static PNG renders for comparing sources by eye
  qa_rulers.cjs, qa_atlas.cjs  optional Playwright browser suites

docs/                     the site GitHub Pages serves
  index.html              semantic application shell and controls
  style.css               Folio atlas themes, layout, responsive bottom sheet
  js/app.js               sidebar, What changed, search UI, timeline, playback, coordination
  js/map.js               projections, canvas layers, labels, pointer gestures, thumbnails
  js/terrain.js           WebGL 2 shaded relief, reprojected per pixel for both projections
  js/data.js              loading, interpolation, cached snapshots, map changes, polity search
  js/search.js            grouped search: polities, alternative names, places, rulers, years
  js/paper.js             generated paper grain for the light theme
  js/rulers.js            source admission, sampled/individual checks, dated roster selection
  js/rulers-view.js       ruler panel, evidence links, coverage and uncertainty labels
  js/data-worker.js       historical JSON parsing and geometry winding
  js/data-version.js      generated data cache fingerprints
  js/state.js             URL state and timeline math
  js/package.json         ES module declaration for Node-based tests
  lib/d3.v7.min.js        vendored D3 7.9.0 (ISC)
  lib/LICENSE-d3.txt      D3's required licence notice, shipped with the copy
  data/                   the built map (JSON) and the relief image (terrain.webp)

data/raw/                 ignored map/ruler snapshots; separate acquisition paths
renders/                  static comparison images
tests/*.test.mjs           native Node viewer and ruler tests; no npm dependencies
tests/test_ruler_*.py      Python extraction, normalization and identity tests
tests/browser/            benchmark harness and optional browser QA instructions
```

## 3. The pipeline, stage by stage

### `scripts/fetch_sources.sh`
Downloads the configured map sources and reference layers into `data/raw/`.
It skips existing files/directories; it does not update existing Git clones,
pin upstream revisions, verify download hashes, or fetch ruler evidence.
The pinned Python environment is also required for a full geometry rebuild.
The separate ruler build and raw-cache limitations are in
[docs/data/RULERS.md](docs/data/RULERS.md).

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
| search aliases | publishes `sources/aliases.yaml` as `aliases.json` for search | instant |
| geography | runs `build_geography.py`: rivers, lakes and relief from Natural Earth | ~5 s |
| cache fingerprints | hashes all eleven published files, including the independent ruler file | seconds |

Roughly ten minutes end to end. `--skip-cities` skips the (unchanging) city
rebuild.

### `scripts/build_geography.py` — present-day geography
Builds the optional terrain and river layers from three public-domain Natural
Earth inputs: 1:50m rivers with their courses through lakes, 1:50m lakes and the
1:50m shaded relief raster. Rivers and natural lakes keep Natural Earth's scale
rank as `r`; reservoirs are left out because most are twentieth-century dams,
and the river's course through each one is drawn instead. The relief is
re-centred so that level ground, the raster's most common value, is mid-grey,
then resampled to 8192 × 4096 and saved as WebP. `--check` rebuilds in memory
and compares: `rivers.json` byte for byte and the relief within a small decoded
tolerance, because WebP encoders differ slightly between library versions.

### `scripts/validate.py`
Assertions covering the built data, the arbitration decisions, the tier-1
windows, the label-placement regressions, the derived index facts, and source
agreement, that `aliases.json` matches `sources/aliases.yaml`, and that the
geography layers are well formed and match a rebuild. Run it after every build.
Checks needing `data/raw/` are skipped, not failed, on a fresh clone.

`python3 scripts/validate.py --quick` explicitly omits raw-source checks.
`node --test tests/*.test.mjs` checks viewer data behavior, state/timeline math,
and map interaction/rendering invariants. The tests also verify that committed
data fingerprints match the actual bytes.

## 4. Data contracts

Field names are short because `polities.json` is 32 MB.

**`polities.json`** — one record per polity per interval (about 12,000; exact
counts are in [HANDOVER.md's current-state table](HANDOVER.md#current-state-and-boundaries)):

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

**`polity_index.json`** — one entry per distinct polity (about 1,500), keyed by
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

**`rivers.json`** — present-day `rivers` (lines, including river courses through
lakes) and natural `lakes` (polygons in d3's winding) as GeoJSON feature
collections. Each feature's only property is `r`, Natural Earth's scale rank
from 0 to 6; lower ranks are drawn at smaller scales. Coordinates are rounded to
0.001° after simplification to about 1 km.

**`terrain.webp`** — present-day shaded relief, 8192 × 4096, plate carrée from
180°W and 90°N. Level ground is mid-grey (128); darker values are slopes facing
away from the light, lighter values slopes facing it.

**`aliases.json`** — alternative names for search, keyed by identity: generated
from `sources/aliases.yaml` by `scripts/build_aliases.py`. A canonical name is
attached to every identity with exactly that display name.

**`rulers.json`** — independent schema-versioned ruler collection, approximately
27 MB: `calendar`, `sources`, `polities` keyed by exact atlas identity, and
`summary`. Each polity stores its scope, coverage, research leads and accepted
reigns. Source assertions and merged observations retain provenance. The
canonical field checks live in `docs/js/rulers.js`; reproduction and admission
rules are in [the ruler guide](docs/data/RULERS.md).

## 5. The viewer

The shell and stylesheet load native ES modules with vendored D3. A simple HTTP
server is enough; direct `file://` loading is unsuitable for modules and fetch.

**Reading and navigation.** `app.js` coordinates search, an explorer with two
lists (largest polities, and What changed), and a persistent detail panel.
What changed compares the map in force with the one before it; see §5a. Details
include the selected year's mapped area, a lifespan scale, a stepped extent
chart, a maximum-extent jump, rulers in office with a reign chart, inferred
relationships with divided bars, and present-day countries. Play steps through
one polity's mapped years and stops at its last. The country percentages explain
their denominator; relationship labels identify geometric inference. A selected
polity can remain selected in a year when it is not mapped, with that absence
stated explicitly. On narrow screens the sidebar becomes a bottom sheet that
covers at most three fifths of the map, and focusing a territory frames it above
the sheet. The "Folio" design sets all text in Georgia, a system serif, so no
web font is loaded: uppercase only for small labels, dotted leaders for facts.
The light theme uses paper and ink with a red accent; the dark theme uses navy
and gold. All interface text must be informative or instructive; slogans and
promotional descriptions are excluded.

**Loading and caching.** `data.js` fetches seven core same-origin JSON files in
parallel, plus the optional `aliases.json`; search works without it. Land and modern borders can render before historical geometry is
ready. Once they have arrived, `app.js` requests the present-day geography,
`rivers.json` and `terrain.webp`, for whichever of those layers are switched on;
a layer switched off is not downloaded until it is switched on. A dedicated worker streams, parses, and rewinds the large polity file;
download progress reports actual bytes and uses an unknown total when a
compressed response prevents a reliable denominator. A worker-unavailable
fallback yields between winding batches. Fetch/parse errors lead to an explicit
retry. Snapshots and city rankings each use a 32-year LRU cache; panning does not
recompute population interpolation. Polity search indexes identity names,
record names and published alternative names, folds accents, and marks activity
from actual record intervals. `search.js` groups those results with places
(city names), accepted rulers and typed years. The ruler index is built while
idle once `rulers.json` arrives, using the cached source indexes.

The optional `rulers.json` loads independently with a separate
15-second timeout and retry. `atlas.rulersReady` and `onRulers` update the open
panel without delaying the map. Its immutable source registry caches comparison
indexes; timeline changes preserve the roster's DOM, expansion and scroll.
`scripts/build_rulers.mjs` builds the independent ruler collection from committed
extracted evidence. It applies individual corroboration or explicit sampled-source
admission, retains source/version/record provenance, and emits the accuracy report.
`audit_ruler_coverage.py` then reconciles that public result against candidate
extractions and discovery leads for all atlas identities. Its dispositions
describe remaining research work; they do not certify historical completeness.
The broad adapters cache polity pages, follow scoped succession lists and explicit
Wikidata offices, then normalize dated records. A separate comparison adapter
selects repeatable source samples, holds unresolved conflicts, consolidates
duplicate tenures and records replacements of censored observations. Explicitly
incomplete source tenures retain null bounds and their original date text; they
are never active on the timeline. Century leader lists failed their sample and
contribute discovery links only. The public
builder verifies each extraction fingerprint before accepting the result.
A final identity audit resolves canonical person IDs and inspected aliases across
all source families. `audit_ruler_duplicates.py` produces a reproducible plan from
the builder's unconsolidated `--audit-input` output. `ruler_identity_merge.mjs`
applies it without rewriting original assertions or source admission checks.
Removed display rows survive in `mergedEvidence`, exposed through the existing
tooltip. Audit input and implementation fingerprints prevent stale plans from
being published after imports change.
Wikipedia article links remain visible above the selected polity's roster.
See `sources/rulers/policy.md` and `docs/data/RULERS.md` for the acceptance rules.

Each data URL carries the first 16 hexadecimal characters of its SHA256 digest.
`scripts/update_data_versions.py` generates `js/data-version.js` automatically
after a successful data build. Run it directly after individual data replacements;
`--check` verifies without writing. Unchanged files keep the same cache key.

**Rendering.** `map.js` schedules at most one pending animation frame and tracks
what needs redrawing. It reuses a basemap canvas, a filled-scene canvas, projected
`Path2D` shapes and bounds, and measured label text. Hover/selection outlines do
not repaint all territory fills. Camera or year changes rebuild the necessary
projection data. Canvas resolution follows display density up to a 2× cap.
Draw order is the globe's graduated ring, sea, engraved water lines around the
coasts, land, relief, rivers, lakes with their own water lines, graticule,
coastline, underlaid borders, territory washes, pigment pooled inside each
border, boundary lines, dotted earlier extents and outlines for What changed,
overlaid borders, city symbols, the double neatline or globe limb, selection
outlines and labels. Relief, rivers and lakes are on the basemap, so the
historical washes are laid over them as on a hand-coloured plate, and year
changes do not redraw them. While the camera moves, frames skip the water lines
and pooled borders; 160 ms after it stops, a full-detail frame follows. Year
changes draw full detail. A paper grain generated once by `paper.js` and a
vignette sit over the map in CSS, not in the canvas.

**Relief, rivers and lakes.** `terrain.js` draws the relief with WebGL 2: for
each screen pixel, a fragment shader inverts the current Equal Earth or
orthographic projection with d3's formulas and samples the mipmapped relief
texture, with the longitude gradient unwrapped at the antimeridian. `map.js`
blends that canvas over the land with `hard-light` at half strength, clipped to
the coastline; mid-grey leaves the colour beneath unchanged. Without WebGL 2 the
layer is unavailable and the Layers panel says so. Rivers and lakes are drawn by
scale rank: ranks up to 3 (rivers) and 1 (lakes) on the whole-world map, and all
of them from 6× zoom. On the flat map their paths are projected once per scale
and reused through an affine transform while panning and zooming, because Equal
Earth is linear in scale and translation; a still frame at a new scale projects
them again. The globe projects them for each rotation, after skipping features
whose bounding cap lies outside the visible part of the sphere.

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
the outer spans pass through untouched. This is why the build emits slightly
more features than Cliopatria supplies records, and why `years.json` gained snap
points at window edges.

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
log space from its Reba series. It is shown from its first population figure to
50 years after its last; it is hidden inside a gap of more than 300 years
between figures, where its presence is not recorded (several series jump from
antiquity to 1975). Population ranking is cached by year. The renderer culls
off-screen cities before applying a viewport-sized budget and a 13px density
grid, so zooming into a region can reveal local cities. A city is a circle with a
centre point (a gold dot in the dark theme), radius
`1.2 + 0.75 · log10(pop / 5000)` clamped to 1.6–3.1px. Names share the polity
label collision system. Historical city names are not tracked: the data stores
current names.

**Polity colour.** A stable identity-key hash selects one of ten watercolour
pigments; the dark theme mixes each pigment with its navy ground. The shared
`getPolityColor(key, theme)` function supplies map washes, pooled borders and
sidebar swatches; changing themes updates existing swatches as well as the map.
A selected polity or a What changed view fades the other territories. Identity
colors stay consistent across years without implying a historical relationship. Neighboring territories
may still share a color; adjacency-aware allocation and successor color
inheritance are not implemented. The latter needs the ontology's continuity edges.

**Label placement.** One shared collision system; every label claims a rectangle
and anything overlapping an existing claim, or falling off-screen, is dropped.
The selected polity has first priority, then other visible territories ranked by
projected area, then cities and sea names; in What changed, the two largest
earlier extents are labelled first. A label is tiered by its territory's
on-screen size: spaced capitals for large territories, smaller spaced capitals
for medium ones, upper and lower case for small ones, bold for the selection.
A name wider than its territory splits over two lines. Seas are italic spaced
capitals; ocean names show at world scale and regional seas when zoomed. The old
global limits of 26 polity labels and 22 city names belong to the saved
baseline. Anchors are still precomputed by the build
(METHOD §6); the redesign does not change their historical interpretation.

**What changed.** `mapChanges` compares the map in force at the selected year
(the last change year at or before it) with the previous change year. It sums
areas per identity and lists identities first mapped, no longer mapped (with
the year they are mapped again, if any) and changed by at least 1,000 km². On
the map, first-mapped territories are outlined; a change of 50,000 km² or a
quarter of the territory keeps its colour while others fade; no-longer-mapped
territories and large losses show their earlier extent as a dotted outline.
"In this view" keeps changes whose label point is on screen. Dates come from the
boundary data and are not dates of founding or collapse.

**Timeline hatching.** Above the scale of years, each slice's hatch height is the
square root of the number of record starts and ends in it, relative to the
busiest slice. Dataset edges are excluded. Narrow windows recount for their own
range.

**Globe orientation.** Switching to the globe from the whole-world map, or
resetting the globe, turns it toward the area-weighted centre of the mapped
territories; from a zoomed map it keeps the same centre.

**Geometry winding.** Input polygons use the opposite winding order from D3's
spherical convention. Every ring whose spherical area exceeds half the globe is
reversed on load, preserving the baseline convention. Skipping this would invert
fills. The worker changes where that computation runs, not its result.

## 6. Saved baseline and publishing

The viewer before the UI redesign is preserved by tag `pre-ui-redesign`
(commit `108468a7d158409ab11a9d31b41c70da4b46e1d1`).
[VERSION_HISTORY.md](VERSION_HISTORY.md) explains the snapshot's contents and
how to run it alongside a newer viewer without changing the active checkout.


GitHub Pages serves `docs/` from `main`; viewer revision `032bc9a` was published
through that configuration on 2026-09-08 (UTC). There is no frontend bundling or
npm installation step. Local commits do not deploy until pushed to `main`;
GitHub Pages build/deployment status and the public site must then be checked.
This is the recorded deployment configuration, not a fresh verification of the
remote settings or live revision. See [HANDOVER.md](HANDOVER.md) for the release
checklist; local checks do not prove a deployment completed.

The full `polities.json` remains approximately 32 MB uncompressed. The redesign
does not change generated data, split it by era, or introduce WebGL. Worker
processing and reusable cache keys reduce repeated main-thread/network work;
they do not eliminate the first full geometry download. The baseline used a new
`Date.now()` URL on every visit. No comparative timing claim is made here.

Each data rebuild adds another large blob to Git history; moving generated data
to release assets remains an option if repository growth becomes a problem.
