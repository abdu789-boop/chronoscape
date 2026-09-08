# Chronoscape

**Live: https://abdu789-boop.github.io/chronoscape/**

An interactive map of political history. Drag a slider from 3400 BCE to today and
watch polities appear, expand, fragment and vanish, with their cities rising and
falling alongside them. Equal Earth projection or a globe.

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

- **A working viewer** — timeline scrubbing that snaps to the 522 years where the
  map actually changes, Equal Earth and globe projections, cursor-anchored zoom,
  a hover card per polity (extent, lifespan, maximum extent with a jump link,
  inferred predecessors and successors, modern countries covered), world
  population, cities gated by population, and a modern-borders reference layer.
- **A precedence engine** that resolves 5 sources into one map and records which
  source produced every feature.
- **An arbitration log** of editorial corrections, each carrying its reasoning
  and evidence.
- **A validation harness** — 46 checks that a rebuild still satisfies everything
  the documentation claims.
- **An ontology specification** for modelling vassals, provinces and unions,
  which is **designed but not implemented**.

## See it in 60 seconds

```bash
python3 -m http.server 8451 --directory docs   # then open localhost:8451
```

No build step, no dependencies, no data fetch. `docs/` is the whole site and its
data is committed.

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

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt    # pinned: the build needs Shapely 2.x
./scripts/fetch_sources.sh                   # ~1.5 GB of source data, re-runnable
.venv/bin/python scripts/build_app_data.py   # regenerate docs/data, ~10 minutes
.venv/bin/python scripts/validate.py         # 46 checks; must pass before pushing
git add -A && git commit -m "..." && git push # live in a minute or two
```

Run every command from the repository root. `data/raw/` (the sources) and
`.venv/` are deliberately not committed; `docs/data/` (the built map) is, so the
site works without a rebuild.
