# Backlog

Features wanted, with what each actually needs. Feasibility notes are from
measured tests, not estimates.

---

## F1 — Polity hover tooltip

Hovering a state shows a panel with its details. Five parts, very different costs.

### F1a. Size of the state at the hovered year  ✅ DONE 2026-08-19

`a` (km²) already rides on every feature. Two correctness fixes first:

- Cliopatria's `Area` is the source's own figure, computed **before** precedence
  clipping. A polity clipped against a tier-1 envelope would report a size larger
  than what is drawn. Area must be recomputed from resolved geometry.
- Tier-1 features currently use a crude `deg² × 12365` proxy. Real km² needs an
  equal-area projection (Mollweide/ESRI:54009) at build time.

### F1b. Origin and end years  ✅ DONE 2026-08-19

Aggregate min/max year across all records sharing a polity identity (wikidata
first, alias-normalised name otherwise — `sources/aliases.yaml` already does
this). Caveat: Cliopatria spans 3400 BCE–2024 CE, so a polity alive at either
edge has its lifespan truncated by the dataset, not by history. Flag those
rather than asserting a false date.

### F1c. Predecessor and successor states  ✅ DONE 2026-08-19

Not present in any source, and the ontology's `succeeds`/`continues` edges are
still unimplemented. But it can be inferred geometrically: take a polity's final
extent, look at the following year, and rank whoever overlaps it. Measured:

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

`ne_110m_admin_0_countries.json` (708 KB, free) intersected with the polity's
maximum-extent geometry at build time, stored as a ranked list with percentages.
Use 50m rather than 110m if small states (Lebanon, Kuwait, Montenegro) get lost
at 110m resolution.

### Shipped in the first F1 pass

`app/data/polity_index.json` — 1403 distinct polities keyed by the same identity
the precedence engine matches on (wikidata, else alias-normalised name), each
with lifespan, peak year, peak area and dataset-edge truncation flags. Areas are
now true geodesic km² (`pyproj.Geod`) computed from **resolved** geometry.

The card shows extent at the hovered year, lifespan, and a clickable maximum-
extent line that jumps the slider. Hovering updates it; clicking a polity pins
it; the pinned card stays live as the year changes under it.

Spot-checks: Rome peaks 118 CE at 5.26M km², Achaemenids 513 BCE at 5.73M
(Darius I), Mongol Empire 1279 at 27.44M, and Mongolia is flagged "still
current" because it is alive at the dataset edge.

**Known nuance from mixed sources.** At 117 CE the card reads 4.66M km² because
tier-1 AWMC geometry is in force, while the peak line points at 118 CE / 5.26M
from Cliopatria — the two sources disagree about Rome's area by ~13%, so "maximum
extent" lands the year *after* the tier-1 window ends. Honest, but worth knowing.

### What F1 needs beyond data

The viewer's hover is currently a single line of text driven by `d3.geoContains`
over the snapshot. A real tooltip needs a hit-test that prefers the *smallest*
polity under the cursor, a positioned panel that avoids screen edges, and a
sensible dismissal rule. This is the "future interaction phase" deferred at v1.

---

## F2 — Modern country borders as reference underlay/overlay  ✅ DONE 2026-08-19

`ne_110m_admin_0_boundary_lines_land.json` (107 KB) or the countries polygons,
drawn as thin lines with a toggle for above/below the polity fills. Cheapest
feature in the backlog and probably the highest orientation value: it answers
"where actually *is* this" without leaving the map.

Draw it in a neutral desaturated tone so it never competes with polity colour,
and keep it off by default so the historical map stays the subject.

**Shipped.** `app/data/borders.json` (186 LineStrings, 107 KB). One button cycles
off -> over -> under. Rendered in a cool grey-blue at low alpha, deliberately
solid rather than dashed: dashes are reserved for the disputed-border convention
this project plans to adopt, so the reference layer must not pre-empt it.

---

## Suggested order

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

**Still misplaced: Estado Novo, labelled over Angola.** This is the hard variant
and it needs the ontology, not a better heuristic. Every Estado Novo record from
1926 to 1975 is ~2.2M km² — Portugal plus Angola and Mozambique — and the only
smaller ones are the stale 6,892 km² Cabinda fragments. The regime never existed
without its empire in this dataset, so no "smallest record" rule can locate
Portugal.

The obvious fix, inheriting home from the predecessor (Estado Novo formed from
the Portuguese Republic at 100%), is unsafe in general: the Macedonian Empire's
predecessor is the Achaemenid Empire, so inheritance would move Macedon's label
to Persia. Distinguishing a continuation from a conquest is precisely the
`continues` versus `succeeds` distinction in ONTOLOGY.md. Fix this when those
edges land.