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
    |  docs/index.html             vanilla JS + d3, no build step
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
  validate.py             46 checks that a rebuild still holds
  render_slice.py         static PNG renders for comparing sources by eye

docs/                     the site GitHub Pages serves
  index.html              the entire viewer
  lib/d3.v7.min.js        vendored
  data/*.json             the built map

data/raw/                 sources, gitignored (fetch_sources.sh restores them)
renders/                  static comparison images
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

Roughly ten minutes end to end. `--skip-cities` skips the (unchanging) city
rebuild.

### `scripts/validate.py`
46 assertions covering the built data, the arbitration decisions, the tier-1
windows, the label-placement regressions, the derived index facts, and source
agreement. Run it after every build. Checks needing `data/raw/` are skipped, not
failed, on a fresh clone.

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

**`years.json`** — the 522 years where the map changes; the slider's snap targets.

**`cities.json`** — 1,719 cities with population time series, driving which
appear at a given year.

**`population.json`** — world population, 261 points from 10000 BCE to 2023.

**`borders.json`**, **`land.json`** — Natural Earth reference geometry.

## 5. The viewer

`docs/index.html` is the whole application: vanilla JS with vendored d3, no
framework and no build step. Worth knowing before editing it:

- **Draw order** is sphere, land, modern borders (if underlaid), polity fills,
  modern borders (if overlaid), polity labels, city dots, city labels.
- **Label placement** uses one shared collision system. Every label claims a
  rectangle; anything that would overlap an existing claim, or fall off-screen,
  is dropped rather than drawn. Polities claim before cities.
- **Label anchors are precomputed** in the build, not derived at render time.
  The rule is subtle and was arrived at by fixing real bugs — see METHOD §6.
- **Hit-testing prefers the smallest polity** under the cursor (the snapshot is
  sorted largest-first and scanned backwards), and rejects the globe's far side.
- **Geometry must be rewound on load.** Cliopatria's polygons use the opposite
  winding order from d3's spherical convention; without `rewindGeom` every fill
  inverts and floods the globe.
- **Pointer state is guarded.** A missed `pointerup` used to leave the map
  panning or the timeline scrubbing forever; both now check `e.buttons`.

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
years     -3400   -1000      1     1000    1500    1800    2026
position    0      .13      .32     .52     .67     .80    1.00
```

4,400 BCE-to-CE years occupy the first third; the last two centuries get a fifth
of the bar.

**Year snapping.** The slider snaps to the nearest of the 522 years where the map
actually changes (binary search, then whichever neighbour is closer), so every
step of the slider produces a visible difference rather than dead travel.

**City visibility.** A city's population at the current year is interpolated in
log space from its Reba series, and it is considered alive from 100 years before
its first data point to 50 years after its last. The 90 largest living cities get
dots (radius `log10(pop) - 2.2`, clamped 1.5–6 px); the 22 largest that survive
label collision get names.

**Polity colour.** A stable hash of the polity's name maps to HSL — same name,
same colour, in every year and every session, with no palette to maintain. Note
this is a placeholder for the agreed design in which successor states inherit
their predecessor's colour, which needs the ontology's continuity edges.

**Label placement.** One shared collision system; every label claims a rectangle
and anything overlapping an existing claim, or falling off-screen, is dropped.
Polities claim before cities. At most 26 polity labels and 22 city labels. Anchors
themselves are precomputed in the build — see METHOD §6 for that rule, which is
subtler than it looks.

## 6. Saved baseline and publishing

The viewer before the UI redesign is preserved by tag `pre-ui-redesign`
(commit `108468a7d158409ab11a9d31b41c70da4b46e1d1`).
[VERSION_HISTORY.md](VERSION_HISTORY.md) explains the snapshot's contents and
how to run it alongside a newer viewer without changing the active checkout.


GitHub Pages serves `docs/` from `main`. No Actions workflow — deliberately, since
the account's token lacks the `workflow` scope. Push to main and the site updates
in a minute or two.

The documented first-load payload is ~9.7 MB gzipped, almost entirely
`polities.json`. The saved baseline appends `Date.now()` to every data URL, so
normal cache reuse across page loads is defeated; versioned asset URLs are a
proposed speed improvement. Note
that each rebuild adds another ~32 MB blob to git history; if the repo grows
uncomfortable, squash or move the data to a release asset.
