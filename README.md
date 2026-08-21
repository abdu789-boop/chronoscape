# Chronoscape — interactive historical world map

Scrub a time slider from 3400 BCE to 2026 CE and watch polity borders and cities
change. Equal Earth and globe projections.

## Run it

```bash
python3 -m http.server 8451 --directory app
```

Then open http://localhost:8451. (In Claude Code: the `histmap` launch config.)

Controls: scrub or click the timeline, arrow keys step one historical change at a
time, scroll to zoom (anchored on the cursor), drag to pan or rotate the globe.
Hover a polity for its card — extent this year, lifespan, maximum extent, the
states it formed from and was succeeded by, and the modern countries its peak
territory covered;
click to pin it, and click the maximum-extent line to jump there.
**Modern borders** cycles off -> over -> under: present-day country lines drawn
above the historical fills, or beneath them so they show through only where no
polity claims the ground.

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
      build_app_data.py   raw sources -> app/data/*.json
      render_slice.py     static PNG renders for source comparison
    app/           the viewer (vanilla JS + d3, no build step)
    renders/       static comparison renders

## Rebuilding the viewer data

```bash
.venv/bin/python scripts/build_app_data.py
```

Produces `app/data/polities.json` (12k features, simplified to ~9 km),
`years.json` (522 years where the map changes — the slider's snap targets),
`polity_index.json` (1403 polities: lifespan, peak year and area, inferred
predecessors and successors, and modern countries covered at peak), and
`cities.json` (1719 cities with population time series).

Areas are true geodesic km² computed from resolved geometry, not from a source's
own figure — a polity clipped against a tier-1 envelope is smaller than its
source claims, and tier-1 features carry no area figure at all.

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
