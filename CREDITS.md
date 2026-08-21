# Sources and credits

This project draws borders, cities and coastlines from other people's work. The
derived files in `docs/data/` are built from the sources below.

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
