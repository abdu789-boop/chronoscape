# Backlog

**Objective** — record what is wanted next, what it actually needs, and what was
tried and rejected, so nobody re-runs an investigation that already has an answer.

**Read after** [METHOD.md](METHOD.md). Feasibility notes here are from measured
tests, not estimates; where something was rejected, the measurement that killed
it is given.

## UI redesign — implemented

Before UI work, the existing version was preserved as `pre-ui-redesign` at
commit `108468a7d158409ab11a9d31b41c70da4b46e1d1`. See
[VERSION_HISTORY.md](VERSION_HISTORY.md) for how to inspect or run it.

The priorities were **readability, speed, aesthetics, and modernization**, in
that order. The current viewer implements:

- An explorer/detail sidebar, mobile bottom sheet, aligned fact lists, explicit
  inference labels and percentage meanings, an extent chart, maximum-extent and
  zoom actions, and clear selection outlines.
- Search across all eras, exact BCE/CE year entry, narrower timeline windows,
  previous/next map changes, playback, and a visible 2024 dataset endpoint.
- A light/dark atlas design, sans-serif controls and facts, curated polity
  palettes, multiline map labels with halos, and city selection by viewport.
- Stable data fingerprints generated after builds, progressive basemap loading,
  a worker for the large JSON parse/winding pass, bounded year caches, batched
  animation frames, cached canvas layers and projected paths.
- Native ES modules, semantic controls, keyboard/search navigation, pinch
  gestures, explicit layer choices, help, retry states, and shareable view URLs.

The whole-history slider still snaps to map-change years; direct entry and
zoomed windows allow individual years. Source data and historical methodology
are unchanged. This implementation entry does not assert a deployment or a
measured speedup; see [ARCHITECTURE.md](ARCHITECTURE.md) for mechanisms and tests.

Remaining UI/performance work should start from measurements: era-based geometry
loading, adjacency-aware colors, and a WebGL renderer are not implemented.
Successor color inheritance still needs the ontology. The original floating
card, dense global label limits, and timestamped data requests remain inspectable
at the baseline tag rather than describing the current UI.

## The one big item

**Implement the polity ontology.** [ONTOLOGY.md](ONTOLOGY.md) is designed and
unbuilt, and it is the prerequisite for most of what remains: sub-polities being
erased by their overlords (OQ-1), the annexation dispute (OQ-3), dependency
tinting, and the continuity signal the label rule needs. Everything below is
smaller than this.

---

## F1 — Polity details: archived implementation notes

These notes record the original August 2026 implementation and investigations.
The redesign presents the resulting facts in a selected-polity sidebar; hover
now provides a brief name/area preview. METHOD remains authoritative for the
current derivations.

### F1a. Size of the state at the hovered year  ✅ DONE 2026-08-19

The original proposal required replacing source areas and a crude tier-1
`deg² × 12365` proxy. The shipped solution computes geodesic area from resolved
geometry (`pyproj.Geod`), so precedence-clipped territories report the area
actually represented. `a` (km²) rides on every feature; see METHOD §6a.

### F1b. Origin and end years  ✅ DONE 2026-08-19

Aggregate min/max year across all records sharing a polity identity (wikidata
first, alias-normalised name otherwise — `sources/aliases.yaml` already does
this). Caveat: Cliopatria spans 3400 BCE–2024 CE, so a polity alive at either
edge has its lifespan truncated by the dataset, not by history. Flag those
rather than asserting a false date.

### F1c. Predecessor and successor states  ✅ DONE 2026-08-19

Not present in any source, and the ontology's `succeeds`/`continues` edges remain
unimplemented. The initial experiment used a polity's final extent, looked at the
following year, and ranked whoever overlapped it. These historical measurements
preceded the corrections described below:

| polity | inferred successors |
|---|---|
| Seleucid Empire (ends 64 BCE) | Roman Republic 99.6% — correct, Pompey annexed Syria in 64 |
| Gupta Empire (ends 554) | Maukhari Dynasty 49.9% |
| Western Roman Empire (ends 475) | Kingdom of Soissons 26.9%, Visigothic Kingdom 11.5% |
| Achaemenid Empire (ends 327 BCE) | "Ptolemaic Kingdom" 79.9% ← **only on raw data** |

Two lessons from that table. Fragmented collapses are only partly captured — the
Western Roman case accounts for 38% of the territory, so the panel should show
percentages and never claim to be exhaustive. And the Achaemenid row is the
ARB-001 defect leaking through, because this test deliberately ran on raw
Cliopatria: **succession inference must run on post-arbitration resolved data**,
or it will publish known-wrong history into the UI.

**Shipped**, with two method corrections found by checking the output against
known history rather than trusting it:

- **Measure at the polity's height, not its last moment.** A dying empire's final
  record is a rump, so asking who took the rump is true but useless: by that
  reading the Byzantine Empire is "succeeded by Genoa 100%", because its last
  holding was a Crimean remnant. Both directions are now measured over the peak
  extent.
- **Use pre-clip geometry.** A polity clipped against a tier-1 envelope leaves a
  sliver that nobody succeeds — the Seleucid Empire reported no successor at all,
  despite Pompey annexing it in 64 BCE, because its surviving remnant was
  precisely the ground Rome's envelope did not cover.

Still worth cross-checking against Wikidata `P155/P156` (follows/followed by) and
`P1365/P1366` (replaces/replaced by), reachable through the Wikidata ids
Cliopatria already carries — treat Wikidata as authoritative where present and
geometry as the fallback that supplies the percentages.

### F1d. Year of maximum extent, click to jump there  ✅ DONE 2026-08-19

Argmax of area across the polity's records, precomputed at build time. Clicking
calls the viewer's existing `setYear`. Cheapest item in this document, and the
most fun.

### F1e. Modern countries covered at maximum extent  ✅ DONE 2026-08-19

The initial proposal considered `ne_110m_admin_0_countries.json`; the shipped
build uses Natural Earth 50m to retain small states. It intersects the maximum
extent at build time and stores a ranked list of countries with percentages.

### Shipped in the first F1 pass

The first index (`app/data/polity_index.json`, now `docs/data/polity_index.json`)
contained 1,403 distinct polities, before later identity corrections. Entries used
the engine's identity key (wikidata, else alias-normalised name) and carried
lifespan, peak year, peak area and dataset-edge truncation flags. Areas are
now true geodesic km² (`pyproj.Geod`) computed from **resolved** geometry.

The original card showed extent at the hovered year, lifespan, and a clickable
maximum-extent line. Hovering updated it; clicking pinned it while the year
changed. These interaction notes describe the original viewer, not the sidebar.

Spot-checks: Rome peaks 118 CE at 5.26M km², Achaemenids 513 BCE at 5.73M
(Darius I), Mongol Empire 1279 at 27.44M, and Mongolia is flagged "still
current" because it is alive at the dataset edge.

**Known nuance from mixed sources.** At 117 CE the card reads 4.66M km² because
tier-1 AWMC geometry is in force, while the peak line points at 118 CE / 5.26M
from Cliopatria — the two sources disagree about Rome's area by ~13%, so "maximum
extent" lands the year *after* the tier-1 window ends. Honest, but worth knowing.

### F1 interaction follow-through

The originally deferred interaction work is implemented: hit-testing prefers
the smallest polity, the brief hover preview stays within the map, and a click
or keyboard search result opens persistent details. The sidebar has explicit
deselection and zoom controls and distinguishes a selected polity that is not
mapped in the current year.

---

## F2 — Modern country borders as reference underlay/overlay  ✅ DONE 2026-08-19

`ne_110m_admin_0_boundary_lines_land.json` (107 KB) or the countries polygons,
drawn as thin lines with a toggle for above/below the polity fills. Cheapest
feature in the backlog and probably the highest orientation value: it answers
"where actually *is* this" without leaving the map.

Draw it in a neutral desaturated tone so it never competes with polity colour,
and keep it off by default so the historical map stays the subject.

**Shipped.** `docs/data/borders.json` (186 LineStrings, 107 KB). The original
viewer cycled off → over → under with one button. The redesign provides explicit
Hidden / Above territories / Below territories choices in Layers. Reference
lines remain subdued and solid; the planned disputed-border convention is still
unimplemented.

---

## Original feature sequence — completed

1. ~~**F2**~~ — done.
2. ~~**F1a/F1b/F1d + equal-area fix**~~ — done.
3. ~~**F1e**~~ — done (`ne_50m_admin_0_countries`, build-time only).
4. ~~**F1c**~~ — done by geometric inference. Revisit when the ontology's
   succession edges land, so Wikidata and geometry can be reconciled.

---

## Fixed 2026-08-19 — labels landing on the wrong country

Reported: "French Fifth Republic" sitting over Algeria from 1963, and "Kingdom of
Great Britain" over Oman in the 20th century.

Anchoring a label to a polity's largest piece breaks for empires. From 1956 the
largest single piece of "Britain" is its Arabian holdings (59.98 deg²) rather
than the British Isles (33.34), and France's largest piece is Algeria. Two
distinct causes needed two rules, now both in `label_points()`:

1. **Stale colonial claim.** France still holds Algeria in Cliopatria until 2023
   while an independent Algeria is drawn on the same ground — so skip any piece
   another polity is sitting on.
2. **Legitimately held but not home.** Britain really did hold Aden and the
   Trucial States in 1960, so no coverage rule can catch it — anchor instead to
   the piece containing the polity's home ground.

Home is taken from a polity's **smallest** record, not its earliest: the Fifth
Republic's first record already spans French West Africa, so "earliest" would
name Mali its heartland, while its smallest record is 2024 — metropolitan France.
By the same rule Rome's home is Latium.

Anchors are precomputed per record as `lp`, which also removed the runtime
`geoCentroid` work. The underlying geometry defect is untouched — see OQ-6.

**Original follow-up investigation: Estado Novo over Angola.** This exposed the
hard variant in the original anchor heuristic. Every Estado Novo record from
1926 to 1975 is ~2.2M km² — Portugal plus Angola and Mozambique — and the only
smaller ones are the stale 6,892 km² Cabinda fragments. The regime never existed
without its empire in this dataset, so no "smallest record" rule can locate
Portugal under that original rule. The later 1% peak-area floor and complete
current anchor rule are documented in METHOD §6; the UI redesign does not alter
that rule.

The obvious fix, inheriting home from the predecessor (Estado Novo formed from
the Portuguese Republic at 100%), is unsafe in general: the Macedonian Empire's
predecessor is the Achaemenid Empire, so inheritance would move Macedon's label
to Persia. Distinguishing a continuation from a conquest is precisely the
`continues` versus `succeeds` distinction in ONTOLOGY.md. Fix this when those
edges land.

---

## Built, validated, and rolled back — per-polity population

Recorded so the investigation is not repeated. Full implementation and its
validation are in git history at **5c15486**.

The request was a population figure per polity, shown under each state's name and
in the hover card. It was built twice.

**First attempt — area shares.** Credit each polity a share of every modern
country it covered, proportional to *area*. Validation killed it: Han China came
out at 25M against a census of ~57M, the Ming at 37M against estimates upwards of
100M. The assumption that population is spread evenly within a country is simply
false — the Ming held about half of China's area but 89% of its people.

**Second attempt — land-use weighting.** Spread each country's population across
the Anthromes 12K grid (Harvard Dataverse, CC0), whose classes derive from HYDE
and so encode where people actually lived, then credit a polity with the cells it
held. This validated well:

| polity | year | estimate | published |
|---|---|---|---|
| Roman Empire | 117 | 44.7M | 45–70M |
| Han Dynasty | 2 | 50.8M | ~57M (census) |
| Qing Dynasty | 1800 | 333M | ~330M |
| Ottoman Empire | 1600 | 31.4M | ~28M |

**Rolled back anyway**, by decision: a derived per-polity number carries error
bars too wide to sit under a state's name as though it were a fact. World
population — which *is* sourced, from OWID — was kept.

Worth knowing if it is ever revived: Ming China came out at 88M against a
frequently quoted ~160M, and that gap is a source disagreement rather than an
error. Ming covers 89.4% of China's population weight, and OWID/HYDE put China's
1600 population at 98.1M. Ming estimates genuinely span 60M to 200M.
