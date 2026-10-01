# Extraction and scope inspection

This inspection is separate from independent historical-source sampling. The
36-record selection is retained in
`../working/notes/extraction-inspection-sample.json`: the first SHA256-ordered
candidate per previously empty polity. It exposed errors; it is not recorded as
a passing historical accuracy sample.

The inspected snapshots and row/list-item locators are retained with each
candidate. Corrections made before the final public build:

- Dedicated-list parsing excludes navigation, table-of-contents entries,
  office-title histories, statistics, provinces and collective-government names.
  Examples included a Blue Horde section label and Spain's office title being
  mistaken for people. Rectors with leading dates retain the actual personal name.
- Abkhazia, Banjar and Mann use explicit branch scopes. Samegrelo princes,
  Kusan rulers and South Isles rulers cannot fill those neighboring rosters.
- Every Commagene 38–72 Antiochus IV observation is held, including newly found
  list-page variants. The already inspected source describes deposition and
  restoration in 41; the combined interval cannot erase that interruption.
- Egyptian tables preserve names spanning two equivalent name columns and
  resolve linked common names such as Djoser. Reign lengths remain unknown
  tenure bounds. Unnumbered claimant/queen/regent possibilities and the explicitly
  fictional Nitocris narrative are held for office/historicality assessment.
- Multi-row term headers use explicit start/end columns, excluding durations.
  Regression fixtures exercise the French presidency, Palmyra, BCE headers,
  combined name cells and navigation formats without turning fixture people
  into production evidence.

The broader source review remains limited to the declared independent comparison
sample. These extraction checks do not certify every imported reign or complete
any polity's succession list. The final all-polity work inventory is
`sources/rulers/coverage-audit.json` at the repository root.

Final before/after review also found that Chinese tables label real year ranges
“Duration of reign”; those columns remain eligible while actual reign lengths
are rejected by the date parser. “Took office” headers now identify the Cretan
commissioners instead of inheriting Ottoman provincial governors. A reviewed
route explicitly selects medieval Vlastimirović Serbia instead of the modern
principality linked by the atlas metadata. Unknown-date lists preserve table
order across dynasties rather than sorting equal row numbers from different
tables together. A regression fixture covers these cases.

The prior Gutian Tirigan range was extracted from a column containing competing
chronologies/reign lengths; it is not reinstated without explicit interpretation.
Galuh and Frisia article snapshots carry factual-accuracy dispute banners, so
those observations remain held. Existing Archigos effective-leader records can
include a collective executive (the 1883 Honduran Council of Ministers); that
source-defined role is retained rather than inventing an individual person.
