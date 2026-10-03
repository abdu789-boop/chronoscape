# Knowledge and handover changes

## 2026-10-03 — terrain shading and rivers

Added present-day terrain shading and rivers and lakes as map layers that can be
switched off, built from public-domain Natural Earth data by
`scripts/build_geography.py` and drawn with a new WebGL 2 relief renderer.
Updated ARCHITECTURE, HANDOVER, README, CREDITS, BACKLOG, requirements, the
browser QA guide and release records, and corrected the Folio record's
"year step" timing, which measured a keyboard pan.

Provenance: [terrain handoff](../workstreams/maintenance/chats/2026-10-03__terrain-rivers/handoff.md).

## 2026-10-01 — Folio interface

Built the approved "Folio" design and its features into the viewer:
- Georgia type, with paper and navy themes.
- A hand-coloured map and a scale-of-years timeline.
- What changed, wider search with published aliases, polity playback and a reign
  chart.
- Globe orientation, and a phone sheet that keeps the map visible.
- City visibility starts at the first population figure.

Removed the unused Space Grotesk font. Updated ARCHITECTURE, HANDOVER, README,
CREDITS, BACKLOG, the browser QA guide and release records. Published 2026-10-01
as `9664250` at the user's request; the deployment and live browser checks were
verified.

Provenance: [Folio handoff](../workstreams/maintenance/chats/2026-10-01__folio-interface/handoff.md).


## 2026-09-30 — follow-up fixes

Removed the thousands separator from displayed years, restored a detectable MIT
LICENSE with its scope recorded in CREDITS.md (adding D3's required notice), and
made HANDOVER.md's current-state table the single tested home for headline
counts. Current-state and deliverable indexes now link to that table. Published
2026-10-01 as `5200e2b` at the user's request; the deployment, licence
detection and live browser checks were verified.

Provenance: [fixes handoff](../workstreams/maintenance/chats/2026-09-30__year-format-licence-counts/handoff.md).


## 2026-09-30

Expanded sourced ruler coverage to 945 identities and preserved missing tenure
bounds explicitly. Added an all-polity work inventory and a durable continuation
record; updated canonical reproduction, handover, QA and deliverable pointers.
Retained a failed century-list source sample and extraction diagnostics instead
of treating successful downloads as historical verification. All rosters remain
partial, and 599 identities still have no accepted ruler.

Provenance: [ruler handoff](../workstreams/rulers/chats/2026-09-29__complete-ruler-coverage/handoff.md).


## 2026-09-29

Audited documentation against `1e83435`; added the developer handover and current
state/index pointers. Corrected setup dependencies, ruler validation/rebuild
instructions, browser QA setup, benchmark baseline recovery and OQ-1's pending
implementation status. Preserved historical QA reports and added a current
verification section with durable logs/screenshots. No application/data changes.
The handover package was committed as `732117f`. The user's subsequent “push”
request authorizes sharing it through `origin/main`.

Provenance: [audit handoff](../workstreams/maintenance/chats/2026-09-29__developer-handover/handoff.md).
