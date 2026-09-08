# Sources and credits

**Objective** — name every dataset the map is built from, and state the licence
obligations each carries, since publishing turned those obligations from academic
into binding.

**Read after** [METHOD.md](METHOD.md), which explains how these sources are
ranked against each other. This document covers provenance and licensing only.

The derived files in `docs/data/` are built from the sources below.

## Polity borders

**Cliopatria** — Seshat Global History Databank.
Licensed **CC BY 4.0**. Used as the global skeleton for the whole timeline.
https://github.com/Seshat-Global-History-Databank/cliopatria
Paper: *Cliopatria — A geospatial database of world-wide political entities from
3400BCE to 2024CE*, Scientific Data (2025).

**Ancient World Mapping Center (AWMC) geodata** — derived from the Barrington
Atlas of the Greek and Roman World, and from AWMC modifications to
OpenStreetMap. Licensed **ODbL 1.0**. Used as the tier-1 authority for the
classical Mediterranean, and for ancient coastlines.
https://github.com/AWMC/geodata
© OpenStreetMap contributors.

## Cities

**Reba, Reitsma & Seto**, *Spatializing 6,000 years of global urbanization from
3700 BC to AD 2000*, Scientific Data (2016). Digitised from Tertius Chandler's
*Four Thousand Years of Urban Growth* and George Modelski's *World Cities*.
Licensed **CC BY 4.0**, via figshare.

## Population

**Our World in Data**, long-run population series (world and per country,
10000 BCE onward), itself built on HYDE 3.x, Gapminder and the UN.
Licensed **CC BY 4.0**. https://ourworldindata.org/population-growth

Only the **world total** is used, taken directly from the source with no
derivation of our own. Per-polity population estimates were built and then rolled
back; they relied on a further dataset (Anthromes 12K, CC0) that the project no
longer ships or depends on. See BACKLOG.md, and git history at 5c15486.

## Basemap

**Natural Earth** — land polygons and present-day country boundary lines.
Public domain. https://www.naturalearthdata.com/

## Consulted but not redistributed

**historical-basemaps** (aourednik) is GPL-3.0 and is used only as a tier-3
cross-check: it is never drawn and never ships in `docs/data/`. It is not
included in this repository.

---

## Licensing of this repository

- **Code** (`scripts/`, `docs/index.html`): MIT, see LICENSE.
- **Derived data** (`docs/data/`): **ODbL 1.0**. It contains geometry derived
  from AWMC's ODbL database, and ODbL's share-alike terms carry over to any
  derived database that is publicly used.

If you reuse the data, credit Cliopatria (CC BY 4.0), AWMC/Barrington and
OpenStreetMap contributors (ODbL), and Reba et al. (CC BY 4.0).
