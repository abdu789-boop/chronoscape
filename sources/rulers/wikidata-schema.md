# Wikidata discovery and candidate extraction

`scripts/fetch_ruler_candidates.py` runs with the project's `.venv/bin/python`.
Without `--download` it is offline. `--download --stage polities` obtains direct
polity records; `--stage offices` follows P1906/P1313; `--stage people` obtains
labels and full claims for already named people. `--stage all` performs these
in sequence. `--max-batches N` limits each stage to N batches of at most 50 IDs.
Re-running skips cached IDs. No live API request is used in the viewer.

`wikidata-discovery.json` inventories every exact atlas key, the original raw
metadata URLs, names, editorial decisions, unreviewed identity/scope/completeness,
and links to acquired assertions. Discovery reconstructs the existing build's
identity rules using `resolve.py`, the original alias table and arbitration.
Reused Wikidata IDs remain visibly ambiguous; neither matching an index key nor
matching a name establishes historical identity. Metadata-derived Wikipedia URLs
are source candidates, not a claim that those pages have been fetched or exist.

`wikidata-candidates.json` stores entities' labels, descriptions, English sitelinks
and revisions; every extracted assertion retains its entire original Wikidata
statement (including rank, raw time precision/calendar, qualifiers, references,
and GUID). Snapshot receipts contain actual retrieval URL, UTC time, SHA256 and
raw cache path. P35 is head of state, P6 head of government, and P1308 is a holder
of an office reached through P1906 or P1313. These roles remain distinct.
Discovery links record the route/office used for each association. The same raw
assertion can legitimately be a candidate for several ambiguous identities.

All assertions remain candidates: no authority, independent verification,
historicality or completeness flag is inferred from downloading data. Deprecated
statements are retained for contradiction review, not silently preferred. Null
endpoints, co-rulers, qualifiers and repeated accessions are preserved exactly.
The extractor does not convert dates, extend dates to map boundaries, borrow
lifespans as reigns, or treat an absent end date as an ongoing reign.

Limitations: P35/P6 often contain only current/first/last leaders; P1308 coverage
varies by office. Downloading named people's P39 statements caches useful
potential date evidence but does not exhaustively reverse-query every person
holding an office. A roster requires independent sources and separate office,
identity and completeness reconciliation under `policy.md`. A fetched entity
with no direct roster is an ordinary acquisition gap, not evidence that no rulers
existed. All output has one Wikidata publication lineage; Wikipedia imports and
mirrors are not independent corroboration.

API and data model references:

* [Wikidata data access](https://www.wikidata.org/wiki/Wikidata:Data_access)
* [Head of state P35](https://www.wikidata.org/wiki/Property:P35)
* [Head of government P6](https://www.wikidata.org/wiki/Property:P6)
* [Officeholder P1308](https://www.wikidata.org/wiki/Property:P1308)
* [Wikidata sourcing guidance](https://www.wikidata.org/wiki/Help:Sources/en)

Structured Wikidata content is CC0; no assumption is made about the license of
underlying references. Cached API JSON is raw input under `data/raw/rulers`;
discovery and extracted candidate records are source-audit outputs, not accepted
application data.

## Broad import adapter

`fetch_ruler_office_holders.py` additionally queries person/office identity pairs
for explicit historical offices. Generic offices such as king or mayor are not
used to reverse-map people into a polity. The query does not supply reign dates:
the adapter fetches original JSON and reads the matching P39 position statements.
`prepare_ruler_wikidata.py` emits `wikidata-extracted.json` with exact identity
and office routing, original calendars/precision, revisions and snapshot receipts.
It holds unknown endpoints, coarse dates, qualified positions, incompatible
regime spans and known traditional/claimant cases for review. Names and lifespan
dates cannot create a tenure.

Wikidata JSON uses historical signed years: **-0001 means 1 BCE**, with no year
zero. Its RDF/SPARQL date convention differs, so RDF dates are not reused as if
they were JSON dates. [Official date documentation](https://www.wikidata.org/wiki/Help:Dates#Years_BC).

These normalized candidates still require the independent source-level samples
and conflict checks in `prepare_ruler_broad_import.py`; the raw candidate inventory
does not claim acceptance or complete rosters. See `accuracy-report.json` for the
published collection and `broad-import.json` for sample denominators and limits.
