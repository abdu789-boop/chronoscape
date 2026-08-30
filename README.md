# Chronoscape — interactive historical world map

**Live: https://abdu789-boop.github.io/chronoscape/**

Scrub a time slider from 3400 BCE to 2026 CE and watch polity borders and cities
change. Equal Earth and globe projections.

## Run it

```bash
python3 -m http.server 8451 --directory docs
```

Then open http://localhost:8451. (In Claude Code: the `histmap` launch config.)

Controls: scrub or click the timeline, arrow keys step one historical change at a
time, scroll to zoom (anchored on the cursor), drag to pan or rotate the globe.
Hover a polity for its card — extent this year, lifespan, maximum extent, the
states it formed from and was succeeded by, and the modern countries its peak
territory covered;
click to pin it, and click the maximum-extent line to jump there.
World population for the current year sits under the year readout, and each
labelled polity carries an estimated population beneath its name.
**Modern borders** cycles off -> over -> under: present-day country lines drawn
above the historical fills, or beneath them so they show through only where no
polity claims the ground.

## Publishing

GitHub Pages serves `docs/` from `main`. There is no build step and no Actions
workflow — push to main and the site updates within a minute or two.

To ship an improvement:

```bash
.venv/bin/python scripts/build_app_data.py   # regenerate docs/data/
git add -A && git commit -m "..." && git push
```

The first load is ~9.7 MB gzipped, nearly all of it `polities.json`; it caches
after that. Note `polities.json` is ~32 MB uncommitted, so every rebuild adds
another ~32 MB blob to git history. If the repo gets uncomfortably large, squash
history or move the data to a release asset.

Working on a fresh machine:

```bash
./scripts/fetch_sources.sh                   # re-downloads ~1.5 GB of sources
python3 -m venv .venv
.venv/bin/pip install geopandas matplotlib pyogrio shapely pyyaml pandas pyproj
```

Licensing is covered in CREDITS.md: the code is MIT, and `docs/data` is ODbL
because it contains AWMC-derived geometry.

## Layout

    sources/
      registry.yaml       every source: tier, grade, spatial+temporal authority
      aliases.yaml        cross-source name reconciliation
    arbitration/
      decisions.jsonl     machine-applied editorial decisions, with reasoning
      OPEN_QUESTIONS.md   decisions deliberately not yet made
    data/raw/      source data, as downloaded (not modified)
      cliopatria/  Cliopatria polity polygons — the global skeleton
      geodata/     AWMC / Barrington Atlas — classical-world authority layers
      pleiades/    Pleiades ancient places
      ne_110m_admin_0_boundary_lines_land.json   modern borders, reference only
      reba/        Reba/Chandler-Modelski city populations, 3700 BCE–2000 CE
    scripts/
      build_app_data.py   raw sources -> docs/data/*.json
      render_slice.py     static PNG renders for source comparison
    docs/          the viewer (served by GitHub Pages) (vanilla JS + d3, no build step)
    renders/       static comparison renders

## Rebuilding the viewer data

```bash
.venv/bin/python scripts/build_app_data.py
```

Produces `docs/data/polities.json` (12k features, simplified to ~9 km),
`years.json` (522 years where the map changes — the slider's snap targets),
`polity_index.json` (1403 polities: lifespan, peak year and area, inferred
predecessors and successors, and modern countries covered at peak), and
`cities.json` (1719 cities with population time series).

Areas are true geodesic km² computed from resolved geometry, not from a source's
own figure — a polity clipped against a tier-1 envelope is smaller than its
source claims, and tier-1 features carry no area figure at all.

## Population estimates

World population comes straight from Our World in Data's long-run series
(CC BY 4.0), which reaches back to 10000 BCE.

Per-polity population is **derived, not sourced** — nobody publishes populations
for 1,544 historical polities. The estimate spreads each country's population
over the ground people actually occupied, using the Anthromes 12K land-use grid
(CC0), a 5-arc-minute classification for 73 time slices from 10000 BCE that is
itself derived from HYDE's population reconstruction:

1. Every grid cell gets a density weight from its anthrome class — urban,
   villages, croplands, rangelands, wildlands and so on.
2. Each country's population that year is shared out across its cells in
   proportion to those weights, so only the *ratios* between classes matter and
   absolute density errors cancel.
3. A polity is credited with the cells it covered.

The land-use distribution is taken from the slice nearest each record's
midpoint, then priced at the country populations of its first and last year, so
a long record still tracks growth across its span. Weights are aggregated into
blocks of 4×4 cells for speed; total weight is preserved exactly.

**Why not just use area shares?** That was the first implementation, and
validation killed it. Crediting a polity with a flat share of each country's
area put Han China at 25M against a census of ~57M, and the Ming at 37M. The
land-use weighting fixes both, because the Ming held roughly half of China's
area but 89% of its people.

Checked against figures we could falsify:

| polity | year | estimate | published |
|---|---|---|---|
| Roman Empire | 117 | 44.7M | 45–70M |
| Han Dynasty | 2 | 50.8M | ~57M (census) |
| Qing Dynasty | 1800 | 333M | ~330M |
| Ottoman Empire | 1600 | 31.4M | ~28M |
| Mongol Empire | 1279 | 113M | ~100M |
| Achaemenid Empire | 500 BCE | 16.7M | 17–35M (debated) |

Ming China comes out at 88M against the ~160M sometimes quoted. That gap is a
disagreement between sources, not an error here: OWID/HYDE put China's 1600
population at 98M, and the Ming held 89% of it. Ming population estimates
genuinely range from ~60M (official registers, thought to undercount) to ~200M.

These remain estimates with wide error bars, and they do not sum to the world
total — polities overlap in the data (see OQ-6) and much of the map is unclaimed.

## Source precedence

Regional specialist -> Cliopatria -> historical-basemaps (tiebreak) -> manual
arbitration. This is implemented, not aspirational: `scripts/resolve.py` is the
engine and `build_app_data.py` runs it into the viewer's data.

Rules the engine enforces:

- A higher tier clips a lower one; a source is never clipped by its own tier.
- Where tier 1 and tier 2 describe **the same polity**, tier 1 replaces it
  outright. Clipping instead would leave a halo of the weaker source's geometry
  around the stronger one.
- Where they describe **different** polities, the lower-tier neighbour is merely
  clipped: it loses the contested ground and keeps the rest.
- A tier-1 source only clips inside its own declared `authority.bbox`.
- Tier 3 is never drawn. It is compared against the result and reported as
  disagreement, which is how it earns the name "tiebreak".
- Every output feature carries `s` (source id) and `tier`. Provenance lives in
  the data and is deliberately not shown on the map.

Authority windows are narrow on purpose: AWMC's 117 CE map is trusted only for
114-117, because Hadrian abandoned the Mesopotamian provinces in 118.

Audit any set of years:

```bash
.venv/bin/python scripts/resolve.py 117 200 --slice --report out/conflicts.json
```

Measured tier1-vs-tier2 agreement in the slice (IoU): Rome 117 CE 0.76,
Rome 200 CE 0.80, Alexander's empire 323 BCE 0.79 and 0.76.

Editorial decisions live in `arbitration/decisions.jsonl` and are applied by the
engine, each carrying its reasoning and evidence. Decisions we have deliberately
NOT made are in `arbitration/OPEN_QUESTIONS.md` — most importantly OQ-1, that
sub-polities are currently erased by their own parent, which is the concrete
case the polity ontology has to solve.

## Known data defects

- Cliopatria labels Alexander's conquests "Ptolemaic Kingdom" from 331 BCE,
  ~8 years before the Ptolemies existed. Fast-conquest decades are coarse.
- AWMC `political_shading` layers are maximum-extent, not year-specific.
- Cliopatria freezes colonial extents after independence: the French Fifth
  Republic is one 1961–2023 record still holding Algeria, and the Kingdom of
  Great Britain keeps its Arabian holdings from 1956 to 2023. A 1900–2024 sweep
  found 36 polity pairs overlapping by =>30% of the smaller. Only some are
  defects — others are occupations (USA in Japan/Korea/Iraq) or unions (Syria
  and the UAR), which the ontology models as relations. See OQ-6. Labels no
  longer anchor to ground another polity occupies, so the visible symptom is
  fixed; the geometry is not.
- Cliopatria reuses some Wikidata ids across unrelated polities — 115 of 1400
  ids name more than one state. Q175881 is both the ancient Roman Republic and
  the 1799 revolutionary one, Q41137 is both Assyria and Syria, Q555994 is both
  Aq Qoyunlu and the Zhou-era state of Lu. Grouping records on those ids fuses
  distinct states into one polity with an absurd lifespan (Roman Republic,
  500 BCE – 1799 CE), so `build_app_data.py` trusts an id only when it names
  exactly one polity and falls back to the alias-normalised name otherwise.
- Cliopatria carries 1722 umbrella records that duplicate the geometry of the
  entities they contain, e.g. "(Phoenician Empire)" repeating Phoenicia's exact
  35130 km2. The precise test is a non-empty `Components` field, which occurs
  iff the name is parenthesised. Suppressed by ARB-002. Note these are NOT the
  same set as `Type == RELATION`, which covers only 385 of them.
