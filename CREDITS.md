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

## Ruler chronology

The ruler collection is independent of the geometry database. Names, office
scope and regnal years are extracted as factual records; original prose and
source documents are not published as part of the viewer. Each assertion names
its source and locator. Source-level samples do not certify every imported row.

- **Goemans, Gleditsch and Chiozza**, *Archigos: A Data Set on Leaders
  1875–2015*, version 4.1; see their 2009 *Journal of Peace Research* article,
  46(2), 269–283. [Author-hosted data and codebook](https://www.rochester.edu/college/faculty/hgoemans/data.htm).
  Effective primary political leaders, not every ceremonial monarch. Public
  research download; no explicit open-data licence was found on that page.
- **Hüseyin Gökalp and Ali Çetinkaya**, *Islamic Civilization Atlas*,
  [publisher-linked repository](https://github.com/alicetinkaya76/islamic-civilization-atlas)
  and [Zenodo record](https://zenodo.org/records/18824469), drawing on C. E.
  Bosworth's *The New Islamic Dynasties*. The repository declares **CC BY-SA 4.0**.
  Adaptations here normalize dates, map atlas identities, select ruler-only
  fields and exclude unresolved entries. These derived records retain CC BY-SA
  4.0; unrelated records and MIT application code are separate materials.
- **中国皇帝統計 (Emperor Statistics)**, compiled by kotenbu135,
  [source repository](https://github.com/kotenbu135/emperor-stats), data **CC BY 4.0**.
  Only independently corroborated emperor-name and reign-year records are used.
- **David K. Jordan**, [Table of Chinese Imperial Reigns](https://pages.ucsd.edu/~dkjordan/chin/chinahistory/dyn10-u.html),
  University of California, San Diego. Factual chronology used for comparisons;
  conflicting years are retained in the audit and withheld from settled claims.
- **The Metropolitan Museum of Art**, Department of Greek and Roman Art and
  Department of Medieval Art and The Cloisters, *Heilbrunn Timeline of Art
  History*: [Roman emperors](https://www.metmuseum.org/toah/hd/roru/hd_roru.htm),
  [Byzantine rulers](https://www.metmuseum.org/toah/hd/byru/hd_byru.htm), and
  [Islamic rulers](https://www.metmuseum.org/toah/hd/isru/hd_isru.htm).
  Factual regnal chronology; no artwork or article prose is included in the app.
- **De Imperatoribus Romanis**, [Imperial Index](https://roman-emperors.sites.luc.edu/impindex.htm),
  and **Livius / Encyclopaedia Iranica**, cited individually in the source
  registry, provide independent classical chronology comparisons.
- **US National Archives, Australian Prime Ministers Centre, Prime Minister's
  Office of India, and Nelson Mandela Foundation** provide the official or
  institutional sample benchmarks linked from the relevant assertions.

- **Wikipedia contributors**, polity articles and linked succession tables,
  supply additional dated records after declared sample checks. Each imported
  observation links to its article and records the inspected snapshot. These
  adaptations normalize dates, map jurisdictions and select factual ruler
  fields; attribution and **CC BY-SA 4.0** are retained for Wikipedia-derived
  material. See [Wikipedia's reuse terms](https://en.wikipedia.org/wiki/Wikipedia:Copyrights).
- **Wikidata contributors**, structured **CC0** officeholder statements. The
  import retains statement IDs, revisions, original dates and source hashes.
  Explicit office relationships and dated positions supply records; generic
  titles and unresolved jurisdiction or status conflicts are excluded.

Wikipedia and Wikidata share one publication lineage for these checks. They
cannot independently corroborate one another. Where a Wikipedia table compares
named scholarly chronologies, its alternatives are displayed as disputed;
the underlying books are not represented as independently inspected sources.

Exact acquisition URLs, versions, hashes, lineage and sampling results are in
[`sources/rulers/`](sources/rulers/) and [`docs/data/RULERS.md`](docs/data/RULERS.md).

## Typeface

**Space Grotesk** — Copyright 2020 The Space Grotesk Project Authors.
The variable WOFF2 is self-hosted at
`docs/fonts/space-grotesk-variable.woff2` (49,256 bytes), from the
[official font distribution](https://github.com/floriankarsten/space-grotesk/tree/master/fonts/woff2).
It is licensed under the **SIL Open Font License 1.1**; the copyright notice and
complete license are included in
[docs/fonts/OFL-Space-Grotesk.txt](docs/fonts/OFL-Space-Grotesk.txt).

## Consulted but not redistributed

**historical-basemaps** (aourednik) is GPL-3.0 and is used only as a tier-3
cross-check: it is never drawn and never ships in `docs/data/`. It is not
included in this repository.

---

## Licensing of this repository

- **Code** (`scripts/`, `docs/index.html`, `docs/style.css`, `docs/js/`): MIT,
  see LICENSE.
- **Font** (`docs/fonts/`): SIL Open Font License 1.1, as described above;
  the repository's MIT code license does not replace the font license.
- **Derived geometry data** (`docs/data/`, excluding the independent ruler
  collection `rulers.json`): **ODbL 1.0**. It contains geometry derived
  from AWMC's ODbL database, and ODbL's share-alike terms carry over to any
  derived database that is publicly used.

If you reuse the data, credit Cliopatria (CC BY 4.0), AWMC/Barrington and
OpenStreetMap contributors (ODbL), and Reba et al. (CC BY 4.0).
