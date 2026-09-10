# Ruler accuracy and coverage policy

Status: source admission and record display policy. Executed results are in `accuracy-report.json`.

## Current verification scope

The user explicitly reduced the requested verification work on 2026-09-09: thorough verification of every polity is not required. The implementation therefore supports two distinct levels:

* **Individually cross-checked** (`corroborated`): two independently compiled records agree on identity, office and years. The detailed gates below govern this stronger label.
* **Source checked by sample** (`source-reviewed`): a source has at least five independently compared sample records and at least 90% year-level agreement within that declared sample. Its sampling note and every sampled record, including failures, remain inspectable. Other imported rows require exact mapped polity identity, source record/locator, snapshot hash, valid dates and role, and must not conflict with known evidence. They are not described as individually verified.

The 90% threshold is an editorial admission rule, **not a confidence percentage** for a ruler or an estimate of overall source accuracy. Samples may be small or convenience samples and their limits are documented. A source that misses this threshold can still contribute individually corroborated rows. Known conflicting rows are withheld rather than admitted through the sample rule. Unknown dates are not invented. Approximate dates, documented traditions and incomplete coverage remain labelled. Every atlas key receives a coverage/source-discovery record; that does not mean every key has an accepted ruler list.

This source-level route supersedes any implication below that every displayed row needs two independent confirmations. It does not weaken the meaning of the individually cross-checked or complete-roster labels.

### Explicit comparative chronologies in sampled references

A reference that passed source-level sampling may also reproduce a table with
different named published chronologies. These entries may display as **Disputed
chronology**, without claiming independent reconciliation of the underlying
publications. This narrow route requires `basis: published-comparative-chronology`,
at least two differently named chronology assertions from the same inspected
table snapshot, their source record IDs and locators, and every differing date
alternative retained. The UI displays the alternatives and never marks one as
definite activity. It is not available for ordinary conflicting imports, inferred
uncertainty, or unsupported legendary/historicality labels. The executed example
is the Parthian comparative table; attribution remains to Wikipedia contributors,
the reference actually inspected, rather than asserting that its cited books
were independently read. Tests enforce the sampled admission, snapshot, named
column and retained-alternative requirements.

Scope: rulers only, for every polity identity in `docs/data/polity_index.json`. A successful parser, plausible chronology, or passing schema test is not evidence of historical accuracy. Source discovery, claim verification, and completeness are separate outcomes.

## What the current index actually contains

Read-only audit on 2026-09-09 UTC: 1,544 polity entries, excluding `_span`; 1,285 `wd:` identifiers and 259 `nm:` identifiers. The map's beginning and ending years describe its mapped records. They must not be silently treated as verified dates of a state's existence, or as a ruler's accession and departure.

The following are overlapping name-based routing signals, **not verified classifications**:

| Signal | Entries | Initial routing examples actually present in the index |
| --- | ---: | --- |
| Monarchical term | 611 | Achaemenid Empire, Akkadian Empire, Shang Dynasty, Old Kingdom of Egypt |
| Republic/government term | 173 | Roman Republic, Republic of Venice, French First Republic, Guayaquil Junta |
| Collective/federal term | 56 | Sumerian City-States, Greek City-States, Swiss Confederation, Warring States Japan |
| Colonial/dependent term | 16 | British Colonial Empire, French Colony of Guiana, French Mandate for Syria and Lebanon, Russian-occupied territories |
| Archaeological/cultural term | 7 | Indus Valley Civilization, Minoan civilization, Greek Dark Ages, Classic Veracruz Culture |

The counts are reproducible from case-insensitive matches against the index's `n` values, using these regular expressions respectively:

```text
empire|kingdom|dynasty|caliphate|sultanate|khanate|emirate|duchy|principality|shogunate|safavid|pahlavi
republic|junta|people|socialist|communist|soviet|party|regime|government
city.states|confedera|league|union|united|federat|tribes|chiefdoms|kingdoms|states|republics
colon|protectorate|mandate|territor|occupation|occupied|viceroyal|company|possession|dominion|gubern|suzer
civilization|culture|iron age|bronze age|stone age|dark ages|dynastic period|formative|period
```

These signals deliberately overmatch. For example, a federal state's name does not establish collective executive rule, and an archaeological period may include historically attested monarchs. Unmatched entries still require scope decisions.

Two exact display-name groups contain different identities or periods:

* `Scandinavian minor kingdoms`: `wd:Q1275225` (500–799) and `wd:Q213649` (800–1002).
* `Timurid Empire`: `wd:Q484195` (1375–1506) and `nm:timuridempire` (1507–1528).

Therefore name equality cannot establish identity. The index also contains a concrete review trigger: `wd:Q6000379` is labelled `Hashemite Arab Federation` with mapped years 1415–1439. The State Department's historical record places the proclamation of the Iraq–Jordan Arab Union on 14 February 1958 and distinguishes Faisal II's federal office from Hussein's deputy role. This establishes a material identity/period conflict for review, not permission to move modern rulers into the medieval map record. This audit does not infer the geometry's intended replacement identity, alter the map, or certify a full roster. [FRUS 1958–1960, volume XII, document 99, editorial footnote 2](https://history.state.gov/historicaldocuments/frus1958-60v12/d99)

## Resolve office scope before collecting a roster

Every accepted roster must state its jurisdiction, office scope, and time span. The scope can change during a polity's existence, so keep separate office tracks and intervals.

| Type requiring review | Required interpretation | Prohibited shortcut |
| --- | --- | --- |
| Monarchy or dynasty | Sovereign title, legitimate/disputed claim, regency, co-rule, and any competing jurisdiction; preserve separate tenure episodes. | Treat a dynasty member, military commander, regent, or pretender as an undisputed sovereign. |
| Republic or constitutional system | Identify heads of state, heads of government, or an explicitly defined effective executive role. Label each role and retain concurrent tracks where relevant. | Substitute a modern effective-leader dataset for every monarch or head of state. |
| Colony, dependency, protectorate, or occupied territory | Distinguish local ruler, governor, high commissioner, occupying administrator, and metropolitan sovereign. Specify territorial jurisdiction and administrative period. | Assign the metropolitan monarch as the sole local ruler, or one colony's governor to an entire colonial empire. |
| Confederation, league, city-state aggregate, or fragmented empire | Establish whether a polity-wide office existed. If it did not, group documented rulers by member jurisdiction and define which members are covered. | Invent a single sequential dynasty from contemporaneous rulers of different members. |
| Collective executive or dual office | Preserve all documented concurrent officeholders and the chair's separate role. | Treat the chair or annually rotating representative as the sole executive. |
| Archaeological/cultural aggregation | Determine whether named rulers and identifiable political units are historically attested. Record scholarly evidence for knowledge limits. | Invent rulers from artistic object names, infer no government existed, or call ordinary acquisition gaps inherently unknowable. |

An authoritative modern example is Switzerland: the Federal Council has seven members; the annually selected president is first among equals. Its official account says this institution was established in 1848. These facts justify a collective track from its documented period, not a retrospective assumption about every year of the atlas's `Swiss Confederation` record. [Swiss Federal Council](https://www.admin.ch/en/the-federal-council)

Archigos supplies another concrete scope distinction. Its codebook identifies the *effective primary ruler* of states in the Gleditsch–Ward universe during 1875–2015, normally a prime minister in parliamentary systems and a president in presidential systems. It is not an all-officeholders or all-monarchs list. [Archigos v4.1 codebook, page 7](https://www.rochester.edu/college/faculty/hgoemans/Archigos_4.1.pdf)

## Evidence records and source eligibility

Each imported assertion must retain enough information to inspect what the source actually says:

* Source ID, publication or archive, title, author/editor when available, edition/release/revision, retrieval date, and a stable URL or bibliographic identifier.
* Original record or statement ID and a location: page/table/row/entry/section. Preserve the original name, role, jurisdiction, date text, and qualifiers as structured extracted values. A source landing-page URL alone does not attest a ruler's dates.
* A short permissible excerpt or a specific evidence locator plus the source snapshot/hash needed for reproduction. Do not manufacture quotations or claim a source was read when only a search result or inaccessible link was obtained.
* Publication lineage and known derivation: original research, archive, scholarly synthesis, import, translation, mirror, or copied compilation. Retain `derivedFrom` relations rather than counting hostnames.
* Source support for each relevant field: person identity, role, jurisdiction, start, end, historicality, and roster scope/completeness. A biographical name match is not support for every field.

A source is eligible only after its authorship, competence for the subject, scope, revision, and access are recorded and its extraction has been checked against actual source text. Eligibility permits comparison. It does not grant blanket trust to every fact from the source.

Wikidata is useful for discovery and matching. Its own sourcing guidance says references consisting only of `imported from Wikimedia project` do not make a statement sourced, and recommends following Wikipedia citations to the underlying sources. Consequently, a Wikidata item plus a Wikipedia page, translation, DBpedia export, or mirror of that page must not count as two independent confirmations. [Wikidata Help:Sources](https://www.wikidata.org/wiki/Help:Sources/en)

Independence is claim-specific. Two independently authored scholarly analyses can corroborate an interpretation, while still relying on the same ancient text. Record both publication lineage and underlying evidence basis. Two modern repetitions of a single ancient king list do not create two independent ancient attestations of a person's existence. Unknown or unexamined lineage cannot satisfy an independence requirement.

## Executable accuracy gates

The comparator must output findings and supporting record IDs, not simply a Boolean or an unsupported confidence score. The record status is derived from the gate results; an imported `verified: true` flag is never authoritative.

| Gate | Required condition | Failure disposition |
| --- | --- | --- |
| G1: Atlas identity | Source jurisdiction is matched to the exact atlas key with documented aliases and compatible historical scope. A pre-existing Wikidata key is a candidate identifier, not a substitute for checking its label/period. | `identity-review`; do not attach a verified roster. |
| G2: Office and scope | Source role matches the declared office track, jurisdiction, and period. Office reorganizations are retained. | `scope-review`; segregate mismatched officeholders. |
| G3: Person and aliases | Distinct names resolve through sourced aliases, identifiers, title/regnal number, and jurisdiction. Transliteration folding only generates candidates. | `identity-conflict`; no name-only merge. |
| G4: Independent support | At least two eligible, independently researched source lineages support the claim being labelled cross-verified. Each must contain matching person, role, jurisdiction, and the applicable date claim; known copying and unexamined lineage do not count. | `not-cross-verified`; retain as a candidate and disclose the missing check. |
| G5: Dates and precision | Dates agree at the precision actually claimed, with qualifiers and calendar basis preserved. Exact year agreement does not verify an exact day; approximate agreement remains approximate. | `date-dispute` with both alternatives; no averaging or silent preference. |
| G6: Historicality | A claim of historical attestation, disputed identity, or semi-legendary status has a specific supporting scholarly assessment. | `historicality-review`; missing corroboration alone does not establish legend. |
| G7: Contradiction search | Known contrary evidence for person, office, identity, or dates is recorded and resolved or visibly retained. An unresolved material contradiction prevents the same field from being labelled settled. | `disputed` for affected fields, even if a majority of repeated sources agrees. |
| G8: Tenure integrity | Separate accessions/reinstatements remain separate; source-supported co-rulers and competing claimants remain distinguishable. A gap or overlap triggers review rather than automatic repair. | `tenure-review`; preserve evidence. |
| G9: Completeness | A source explicitly covers the stated jurisdiction/office/time span; its roster is reconciled against an independent roster, with omissions, disputed entries, and exclusions accounted for. | `partial` or `unassessed`; accurate rows do not prove a complete list. |
| G10: Reproducibility | Every comparison links to the exact source records, source versions, extraction/normalization version, and the explicit decision/rationale. | `unreproducible`; no cross-verified label. |

The two-lineage requirement is a project acceptance rule implementing the user's cross-reference requirement, not a historical claim that two sources can prove an event with certainty. Where surviving evidence cannot provide independent historical verification, publish only a clearly marked, source-supported traditional/disputed account or an explicitly evidenced knowledge limitation. Do not relabel ordinary unfinished research as an inherent limitation.

The historicality exception permits a single inspected assertion from an otherwise admitted scholarly source. An unmatched traditional assertion must preserve `inspected: true`, its `sourceRecordId` and `locator`, and `snapshot: {path, sha256}` identifying the inspected raw artifact. It must match the claimed person, office, polity, and the dates actually supplied, including null endpoints. Specific scholarly classification evidence must separately support `legendary` or `semi-legendary`. A snapshot identifier is not proof that the raw file exists or was read: the acquisition/build audit must verify its content and hash. The UI may show this as a documented tradition; it may not show it as settled historical rule.

Contradiction detection has a deliberately lower threshold than corroboration. A locatable, valid extracted record from an admitted source with matching person, role, and jurisdiction can raise a date conflict even if no second source agrees with that particular record. Two agreeing sources plus one unpaired contrary record therefore cannot silently become settled chronology. A null date is missing information, not a conflicting date.

### Date comparison rules

* Preserve raw date strings and their calendar/era. The display uses BCE/CE with no year zero; convert any source's astronomical numbering explicitly and reproducibly.
* Preserve accession, proclamation, coronation, assumption of effective power, deposition, abdication, death, and successor's accession as different events. Match the event appropriate to the declared office.
* Represent uncertain endpoints independently. A known end and unknown start must not become a fully dated reign. An unknown end is not an infinite reign and must not mark a ruler active today.
* Represent a scholarly date range as a range, not a midpoint. Two overlapping ranges are not by themselves proof that the sources agree. If different estimates remain, preserve alternatives and the scholarly chronology used.
* A source giving `c. 2600 BCE` does not justify an invented uncertainty radius. Store the approximate qualifier and the supplied precision. Do not create a fabricated `±5 years` interval.
* Year-only dates support a year-level display. They do not resolve within-year succession; several rulers may legitimately be shown for the same year. Do not subtract a year from the outgoing ruler to manufacture exclusivity.
* Do not clip an independently sourced tenure to a coarse map boundary and then present the clipped endpoints as accession/departure dates. Display the actual attested tenure with a scope note where necessary.
* Distinguish definite activity from possible activity when endpoint uncertainty spans the selected year. If the date bounds do not establish activity, show uncertainty rather than an unqualified active badge.

## Historically supported uncertainty examples

These examples establish how evidence should be represented. They are not a substitute for the per-ruler cross-reference process.

1. **Ancient lists mix historical and traditional material.** The Ashmolean describes the Sumerian King List as a combination of myth, legend and historical information, beginning with fantastically long reigns. A verbatim ancient list therefore cannot automatically pass as a factual chronology. Record list tradition and scholarly historicality separately. [Ashmolean: Sumerian King List](https://ashmolean.web.ox.ac.uk/sumerian-king-list)
2. **Approximate chronologies and alias uncertainty are explicit in scholarly collections.** The Metropolitan Museum's Old Kingdom chronology labels its dates approximate and notes that some names are uncertain or occur in variants. It also identifies Khufu/Cheops, Khafre/Chephren, and Menkaure/Mykerinus as name equivalents. These particular aliases are supported; the document does not license automatic merging of similarly spelled names elsewhere. [Metropolitan Museum: Old Kingdom chronology and list of kings](https://www.metmuseum.org/de/press-releases/landmark-exhibition-of-egyptian-art-opens-at-metropolitan-museum-on-september-16-1999-exhibitions)
3. **Contemporary and later sources can contradict one another.** The scholarly account of Kawād I discusses conflicting eastern and western narratives and uncertainty in the dates and interpretation of his reign. Preserve alternate reconstructions and reinstatement episodes; the presence of several texts does not make a single chronology settled. [Encyclopaedia Iranica: Kawād I, Reign](https://www.iranicaonline.org/articles/kawad-i/kawad-i-reign/)
4. **A ruler's name on an object does not establish the date of rule.** Iranica documents post-conquest coins retaining Sasanian emperors' names and differing era systems. A coin's apparent date must not be used mechanically to extend a ruler's tenure. Scholarly attribution and calendar interpretation are required. [Encyclopaedia Iranica: Coins and Coinage](https://www.iranicaonline.org/articles/coins-and-coinage/)
5. **Artifact nicknames are not personal names or proven offices.** Archaeologist Jonathan Mark Kenoyer explains that the Mohenjo-daro sculpture conventionally called the “Priest-King” does not establish that priests or kings ruled the city. It must not become a named ruler in the Indus Valley Civilization roster. This statement also does not prove that the society lacked leadership. [Kenoyer: An Ancient Indus Valley Metropolis](https://www.harappa.com/content/ancient-indus-valley-metropolis-0)

## Completeness and all-polity reporting

Every atlas key must appear in the coverage inventory with a separate disposition for identity, office scope, candidate acquisition, verification, and completeness. Missing entries in a source are not evidence of absence in history.

Allowed roster outcomes should distinguish:

* A complete, cross-checked roster for an explicit office/jurisdiction/time span.
* A partial roster whose individual accepted entries have passed their applicable gates.
* A mixed historical and traditional roster with entry-level uncertainty and source assessments.
* A documented polity aggregate with no single polity-wide office; member coverage must be stated.
* A documented limit of surviving evidence for named rulers, with scholarly support.
* Work still pending: identity unresolved, sources unavailable, extraction unfinished, comparisons absent, or material disputes unresolved.

Report at least these separate counts: atlas keys inventoried; identities resolved; scopes resolved; candidate rosters acquired; entries independently cross-checked; dates disputed/approximate/unknown; historically disputed or semi-legendary entries; complete scoped rosters; evidence-limited polities; and unfinished polities. Record both numerator and denominator. Do not combine an empty pending row and a completed researched roster into a single “coverage” percentage.

“All atlas polities processed” means the inventory has a disposition for all 1,544 current keys. It does not mean all rulers have been found or verified. The requested all-polity feature is not complete while avoidable acquisition, scope, or verification work remains.

## Accuracy tests must challenge evidence, not declarations

The cross-source identity audit establishes a person through canonical page/ID
metadata, unique exact recorded aliases, or a documented inspected crosswalk
before considering dates. Exact-name normalization preserves regnal numerals;
ambiguous names and equal years cannot establish identity. Title equivalents
outside ordinary translation/formatting rules require a polity-specific review.
Different offices and day-dated separate terms cannot be bridged by a generic
leader title or a year-only observation. Every consolidated row keeps original
source observations; consolidation must not fabricate a reciprocal comparison,
erase uncertainty, or upgrade a source-reviewed row to corroborated. Newly
identified overlapping chronology/scope conflicts remain held for review.

Required adversarial fixture scenarios for the agreed comparator schema:

* A Wikidata statement, Wikipedia page, and mirror in one lineage cannot satisfy independent corroboration.
* Two syntactically complete records with different offices, territories, or homonymous people cannot agree.
* Source support for a name only cannot verify accession and departure dates.
* Two exact dates that differ remain disputed; a broad overlapping interval cannot erase the disagreement.
* Agreement only at year precision does not verify a month/day. Approximate qualifiers survive agreement.
* An unavailable reference or a fabricated/unreviewed extraction cannot count as inspected evidence.
* Contradictory reviewed evidence prevents a settled label even when two supporting records exist.
* Repeat reigns, co-rulers, member jurisdictions, and within-year transitions are preserved.
* A traditional king-list entry needs a cited historicality assessment; an unsupported person is not automatically “semi-legendary.”
* A perfectly sourced short sample cannot be marked a complete roster without the separate completeness reconciliation.
* No source data cannot become “no rulers existed,” an evidence-limited conclusion, or a successful all-polity completion.
* Regression cases drawn from actual inspected source records must accompany generic comparator fixtures. Cite their record IDs and source versions; label invented fixture people as synthetic so they cannot become production evidence.

Tests can prove the software enforces these rules. They cannot independently certify a source's authority, extraction accuracy, lineage independence, or interpretation; those assertions require an inspectable evidence record and review.

The comparator indexes reciprocal checks and matched source records once per validation run. Browser callers may recursively freeze the completed source registry to reuse this index across timeline updates; a frozen registry is an explicit contract that its nested records will also remain immutable. Mutable build/test registries are reindexed, preventing stale verification decisions after edits.
