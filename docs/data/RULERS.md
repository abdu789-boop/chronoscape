# Ruler data

`rulers.json` adds ruler lists to every selected-polity panel. Lists remain
partial; a coverage entry for every atlas key is not a complete ruler database.
The source inventory and exact current counts are recorded in
`sources/rulers/wikidata-discovery.json` and `sources/rulers/accuracy-report.json`.

## What the labels mean

- **Individually cross-checked:** independent extracted sources agree on the
  person, polity, office and reign years. This does not certify exact days.
- **Source checked by sample:** the source passed at least five independent
  sample comparisons with at least 90% year-level agreement in that sample.
  This particular row was imported with identity, date and provenance checks;
  it was not individually corroborated. Sampling notes describe the sample's
  limits. The threshold is not a historical confidence percentage.
- **Approximate chronology:** source uncertainty is retained; these records
  never appear as unqualified exact-date matches.
- **Disputed, semi-legendary or legendary:** supported scholarly classification
  and evidence are required. Missing data never automatically creates a legend
  label. The model supports these cases; the current imports do not fabricate
  such classifications to fill gaps.

Known contradictory reigns remain withheld in the audit. Separate restorations
and concurrent offices remain separate records. An unknown end is never treated
as indefinite rule. Archigos's 2015 observation cutoff is not an actual departure
date, and is never extended to the atlas's 2024 endpoint.

## Scope

Archigos covers effective national political leaders, often presidents or prime
ministers. It is not an all-monarch list. The Islamic compilation selects only
some rulers for many dynasties. Chinese and classical tables use differing
accession, co-rule and era conventions; conflicting values are withheld. Actual
reign dates are not clipped or extended to the map's approximate boundary years.
The British atlas entry explicitly includes the United Kingdom's continuation
after 1801 under the map's existing “Kingdom of Great Britain” label.

The viewer runs entirely from committed local JSON. The source inventory contains
unverified Wikidata/Wikipedia leads for the remaining polities, with acquisition
gaps distinguished from a historical absence of rulers. It makes no live external
source requests and contains no language or religion feature.

## Reproduce

From the repository root:

```sh
node scripts/build_rulers.mjs
python3 scripts/update_data_versions.py
node --test tests/*.test.mjs
node scripts/build_rulers.mjs --check
```

The builder recomputes comparisons and acceptance from committed evidence files.
Source adapters are `compare_ruler_china.py`, `compare_ruler_classical.py`,
`fetch_ruler_reference.py` and `fetch_ruler_candidates.py` under `scripts/`.
Their original downloads are cached under ignored `data/raw/rulers/`; receipts
preserve URLs, SHA-256 hashes and acquisition details. Some Met pages were read
through a web text extractor after raw requests returned HTTP 429; those receipts
explicitly identify extracted text rather than claiming original HTML.

The data and source terms are described in [CREDITS.md](../../CREDITS.md). The
geometry database's ODbL licence is not applied to these independent records;
source-specific terms, including CC BY-SA 4.0 for Islamic Atlas derivatives, remain.
