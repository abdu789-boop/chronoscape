# Chronoscape

**Live site: [Chronoscape](https://abdu789-boop.github.io/chronoscape/)** — see [VERSION_HISTORY.md](VERSION_HISTORY.md) for release notes.

An interactive atlas of historical territories, cities, and world population
estimates from 3400 BCE to 2024 CE, with Equal Earth and globe projections.

**New developer:** start with [HANDOVER.md](HANDOVER.md) for the verified setup,
current status, validation commands, release procedure and known gaps. The latest
local audit is dated 2026-09-29 against application commit `1e83435`.

## The objective

Most historical maps present a single confident line and leave you no way to ask
where it came from. This project sets out to build the opposite: a map that is
**explicit about whose version of the past it is drawing**, and that records the
reasoning wherever sources disagree.

Rendering is the easy half. The hard half is epistemic — no single dataset covers
five thousand years, the good ones contradict each other, and much of what a map
must draw was never a border in the first place. So the project treats source
disagreement as a first-class problem rather than something to smooth over: every
drawn feature names the source that produced it, every editorial correction is
recorded with its evidence, and the questions we have deliberately *not* answered
are written down as openly as the ones we have.

It is a personal project, built for curiosity rather than publication.

## What exists today

- **A redesigned atlas** — a collapsible explorer and detail sidebar (a bottom
  sheet on phones), readable facts and aligned percentages, territory-over-time
  charts, strong selection outlines, and light/dark themes. Search across all
  historical polities or select a territory to explore its mapped extent,
  lifespan, maximum extent, inferred relationships, and territory today.
- **Precise time navigation** — enter any year in the dataset using BCE/CE,
  BC/AD, or a negative number; year zero is rejected. The whole-history slider
  snaps to map-change years, while narrower timeline windows allow individual
  years. Previous/next change buttons and playback follow the source chronology.
- **A responsive map** — Equal Earth and globe views, pointer-anchored zoom,
  pinch gestures, explicit city/label/border layers, keyboard controls, and
  shareable links containing year, selection, camera, and layers. City sizes and
  the world population estimate follow the historical population series.
- **Less repeated work** — content-versioned data URLs, progressive basemap
  loading, a geometry worker, cached year snapshots and city rankings, and
  frame-scheduled rendering with reusable canvas layers and projected paths.
- **A precedence engine** that resolves specialist geometry against a global
  skeleton and records which source produced every feature.
- **An arbitration log** of editorial corrections, each carrying its reasoning
  and evidence.
- **Validation** for data and historical invariants, plus Node tests for viewer
  data access, dates, URL state, timeline navigation, and map behavior.
- **Sourced ruler lists** — the selected polity has a dated succession list,
  a persistent Wikipedia article link, source links and separate labels for individually cross-checked records,
  records from sources checked by sample, approximate dates and incomplete tenure dates. Coverage is
  partial: every atlas identity has a source-discovery record, but many do not
  yet have accepted rulers. The [coverage audit](sources/rulers/coverage-audit.json)
  records remaining work for every identity. See [the ruler data guide](docs/data/RULERS.md).
- **An ontology specification** for modelling vassals, provinces and unions,
  which is **designed but not implemented**.

## Saved version before the UI redesign

The original viewer is preserved at Git tag `pre-ui-redesign`, commit
`108468a7d158409ab11a9d31b41c70da4b46e1d1`. See
[VERSION_HISTORY.md](VERSION_HISTORY.md) for its scope and instructions to inspect
or run it in a separate checkout. The redesign keeps its historical datasets and
methodology. The published redesign and saved revisions are recorded in
[VERSION_HISTORY.md](VERSION_HISTORY.md).

## Run locally

```bash
python3 -m http.server 8451 --directory docs   # then open localhost:8451
```

No frontend build or package installation is needed. `docs/` contains the whole
site, vendored D3, and committed JSON data; the browser loads that data from the
same server. Serve it over HTTP rather than opening `index.html` as a file.
For mobile access, open the live site above; a `localhost` link only works on
the computer running that server.

## Reading order

Each document states its own objective and assumes the one before it.

| # | Document | Answers |
|---|---|---|
| 1 | **[ARCHITECTURE.md](ARCHITECTURE.md)** | How raw sources become the map, and where to change things |
| 2 | **[METHOD.md](METHOD.md)** | How the project decides what is true when sources disagree |
| 3 | **[ONTOLOGY.md](ONTOLOGY.md)** | How polities and their relationships are modelled — **spec, not built** |
| 4 | **[arbitration/](arbitration/)** | The editorial decisions made, and those deliberately left open |
| 5 | **[BACKLOG.md](BACKLOG.md)** | What comes next, and what was tried and rejected |
| 6 | **[CREDITS.md](CREDITS.md)** | Sources, and the licence obligations they carry |

If you are picking this project up cold, read ARCHITECTURE and METHOD before
changing anything. METHOD in particular encodes decisions that look arbitrary
until you know what went wrong without them.

## Working on it

Use Node.js 24 (verified with 24.19.0) for the native test runner. Python data
development requires Python 3.10 or newer and the pinned dependencies below;
the macOS system Python 3.9 is sufficient only for serving and standard-library
checks. Set up the development environment once:

```bash
python3.10 -m venv .venv                    # or a newer Python 3
.venv/bin/python -m pip install -r requirements.txt
```

Run the checks from the repository root:

```bash
node --test tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -p 'test_ruler_*.py'
python3 scripts/validate.py --quick
python3 scripts/update_data_versions.py --check
node scripts/build_rulers.mjs --check
```

See [QA_REPORT.md](QA_REPORT.md) for validation coverage and browser checks.
The application and Node unit tests need no npm packages. Optional browser QA
requires Playwright; setup is in [tests/browser/README.md](tests/browser/README.md).
The quick validator skips checks requiring raw
sources; run the full validator after a data rebuild and before publishing.

To rebuild the historical data:

```bash
./scripts/fetch_sources.sh                   # map sources; requires Git/curl/unzip/gunzip
.venv/bin/python scripts/build_app_data.py   # data and cache fingerprints, ~10 minutes
.venv/bin/python scripts/validate.py         # must pass before pushing
```

Run every command from the repository root. `data/raw/` (the sources) and
`.venv/` are deliberately not committed; `docs/data/` (the built map) is, so the
site works without a rebuild. The download script uses upstream branches/latest
URLs; a fresh download is not a pinned reproduction of the original snapshots.
It does not restore the separate ruler-source cache. See the handover's data
reproduction limits before refreshing sources.

The build refreshes `docs/js/data-version.js` automatically. After independently
replacing a file in `docs/data/`, run `python3 scripts/update_data_versions.py`
before serving or publishing it. Publishing still uses the existing GitHub Pages
configuration serving `docs/` from `main`.

Ruler imports are independent of the geometry build. `sources/rulers/` contains
the extracted evidence, sample comparisons, source-discovery inventory and
coverage report. Rebuild the public ruler file with `node scripts/build_rulers.mjs`,
then refresh cache fingerprints. This requires no network when the committed
evidence files are present. The browser never queries Wikidata or other sources.

## Licensing

The project's own code is MIT ([LICENSE](LICENSE)). The data, the vendored D3
library and the font keep their own licences, including ODbL for the map
geometry and CC BY-SA 4.0 for Wikipedia-derived ruler records. See
[CREDITS.md](CREDITS.md#licensing-of-this-repository).
