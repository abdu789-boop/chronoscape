# Method — how this project decides what is true

**Objective** — state the reasoning rules the map is built on, and the evidence
behind each. These rules look arbitrary until you know what goes wrong without
them, so each one carries the failure that motivated it.

**Read after** [ARCHITECTURE.md](ARCHITECTURE.md). **Read before** adding a
source, changing the engine, or correcting any data.

---

## 1. The problem

No dataset covers 3400 BCE to today at usable quality. The good ones are regional
and disagree with the global ones, and the concept of a border does not survive
being pushed back far enough — for most of history a map is depicting zones of
effective control, tribute networks and nomadic range, not delimited frontiers.

The project's founding rule is therefore: **zones of effective control ARE the
borders, until delimited borders historically exist.** Everything below follows
from taking that seriously while refusing to pretend the sources agree.

## 2. The precedence hierarchy

Sources are ranked, and each declares *where and when* it may speak. All of this
is data, in `sources/registry.yaml`, not code.

| tier | role | members |
|---|---|---|
| 1 | regional specialist — authoritative inside a declared domain | AWMC / Barrington Atlas (classical Mediterranean) |
| 2 | global skeleton — the default answer everywhere else | Cliopatria (Seshat) |
| 3 | tiebreak — never drawn, only compared | historical-basemaps |
| — | reference — not polity borders | Natural Earth, Pleiades, Reba cities, OWID population |

A specialist outranks a global source **only because it passed a quality gate**.
Rank is not automatic: any new candidate is graded on coverage, provenance and
verifiability before it earns a tier.

### Authority windows are narrow on purpose

Every tier-1 source declares the years its geometry is trusted for. AWMC's 117 CE
map is trusted for 114–117 only, because Hadrian abandoned the Mesopotamian
provinces in 118 — applying it a year later would draw a frontier that never
existed. A maximum-extent map is evidence about the moment it depicts, not about
the century around it.

## 3. The resolution rules

The engine enforces six rules. Four exist because the obvious alternative failed.

1. **A higher tier clips a lower one.** Never the reverse.
2. **A source is never clipped by its own tier.** A source's internal arrangement
   is its own business.
3. **Where two tiers describe the *same* polity, the higher tier replaces it
   outright** — it does not clip. *Why:* clipping left a 16.5% halo of
   Cliopatria's Roman Empire around AWMC's more precise one. The sliver problem.
4. **Where they describe *different* polities, the lower-tier neighbour is
   merely clipped** — it loses the contested ground and keeps the rest.
5. **A tier-1 source clips only inside its own declared bounding box.** Authority
   is spatial as well as temporal.
6. **Tier 3 is never drawn**, only reported as disagreement. That is what earns
   it the name tiebreak.

Every output feature carries the source that produced it. Provenance lives in the
data and is deliberately never shown on the map.

### What resolution is measured against

The design's headline claim is that an independent specialist agrees closely with
the skeleton it overrides. Measured, as IoU:

| polity | year | agreement |
|---|---|---|
| Roman Empire | 200 CE | 0.80 |
| Alexander's empire | 323 BCE | 0.79 |
| Roman Empire | 117 CE | 0.76 |
| Achaemenid Empire | 500 BCE | 0.68 |
| Roman Republic | 60 BCE | 0.58 |

The last is a genuine signal, not noise: Cliopatria's late-Republic extent is 24%
larger than Barrington's, which suggests its surrounding centuries are inflated
too. Logged as OQ-5. `scripts/validate.py` asserts the Roman figures so a rebuild
cannot quietly regress them.

## 4. Arbitration

Where no rule can decide, a human does, and the decision is recorded rather than
applied silently.

**`arbitration/decisions.jsonl`** holds corrections the build applies. Each
carries scope, action, reasoning, effect and evidence. Two are active:

- **ARB-001** renames Cliopatria's "Ptolemaic Kingdom" to "Macedonian Empire" for
  331–324 BCE. Ptolemy became satrap in 323 and king in 305, so the label ran up
  to 26 years early on 4.8M km² of Alexander's conquests. The rename was later
  *independently confirmed*: the renamed geometry matches AWMC's Alexander extent
  at IoU 0.79.
- **ARB-002** suppresses 1,722 umbrella records that duplicate the geometry of
  the entities they contain. The test is an exact one — a non-empty `Components`
  field occurs if and only if the name is parenthesised. This decision records
  its own correction: it originally scoped on `Type == RELATION`, which caught
  only 385 of the 1,722.

**`arbitration/OPEN_QUESTIONS.md`** holds six decisions deliberately *not* made.
Leaving them open is a position, not an oversight — the alternative is a blanket
rule that would be wrong in cases we have already identified.

## 5. Identity — which records are the same polity

Records are grouped by Wikidata id where trustworthy, else by alias-normalised
name (`sources/aliases.yaml` folds "Carthaginian Empire" into "Carthage", and so
on). "Where trustworthy" is doing real work: **115 of Cliopatria's 1,400 Wikidata
ids name more than one unrelated polity.** Q175881 is both the ancient Roman
Republic and the revolutionary one of 1799; Q41137 is both Assyria and Syria;
Q555994 is both Aq Qoyunlu and the Zhou-era state of Lu. Grouping on those fused
distinct states into single polities with absurd lifespans — "Roman Republic,
500 BCE – 1799 CE, formed from the Achaemenid Empire". The build therefore trusts
an id only when it names exactly one polity. That fix alone split the index from
1,403 entries to 1,544.

## 6. Derived facts, and how far to trust them

Three things on the map are inferred rather than sourced. Each was validated
against something falsifiable, and the method changed when validation failed.

**Areas** are geodesic km² computed from the *resolved* geometry, not from a
source's own figure. A polity clipped against a tier-1 envelope is smaller than
its source claims, and tier-1 features carry no area at all.

**Predecessors and successors** are inferred by asking who holds a polity's
ground the year before it appears and the year after it ends. Two corrections
were needed, both found by checking output against known history:

- *Measure at the polity's height, not its last moment.* A dying empire's final
  record is a rump, so asking who took the rump gives a true but useless answer —
  by that reading the Byzantine Empire is "succeeded by Genoa 100%", because its
  last holding was a Crimean remnant.
- *Use pre-clip geometry.* The Seleucid Empire reported **no successor at all**,
  despite Pompey annexing it in 64 BCE, because precedence clipping had left it
  holding precisely the ground Rome's envelope did not cover.

After both fixes the results read correctly: the Achaemenids form from Media,
Neo-Babylon, Lydia and Egypt's 26th Dynasty; the Mongol Empire breaks into
exactly the four khanates; Western Rome into Visigoths, Vandals, Ostrogoths and
Burgundians. Percentages are always shown, and the lists never claim to be
exhaustive — fragmented collapses are only partly captured.

**Label anchors** (algorithm: home piece must be ≥1% of the polity's largest
piece; a piece counts as occupied when ≥50% of it is covered by other polities
active during that record's interval) are the subtlest rule in the project, and exist because of two
reported bugs with *different* causes. Anchoring a label to a polity's largest
piece put "French Fifth Republic" over Algeria and "Kingdom of Great Britain"
over Oman. The first was a data defect (France still holds Algeria in the data
until 2023, with an independent Algeria drawn on the same ground); the second was
not (Britain genuinely held Aden and the Trucial States in 1960). So the anchor
rule is, in order: the piece containing the polity's **home ground**; else the
largest piece **no other polity is sitting on**; else the piece nearest home.

Home is the largest piece of a polity's **smallest** record above 1% of its peak.
Every part of that sentence was forced by a failure. *Earliest* record fails —
the Fifth Republic's first record already spans French West Africa, which would
make Mali its heartland. A 5% floor fails — Portugal is only 4% of the Estado
Novo's empire, so the floor discarded the very record identifying the homeland.
1% still rejects debris such as the 6,892 km² Cabinda fragment Cliopatria
attributes to Estado Novo until 2023, 29 years after the regime fell.

`scripts/validate.py` asserts both reported bugs stay fixed across nine years.

## 6a. The derived facts, precisely

§6 gives the reasoning; this section gives the computation, including every
threshold, so a successor can judge or change them rather than reverse-engineer
them from code.

### Area

Geodesic area on the WGS84 ellipsoid (`pyproj.Geod.geometry_area_perimeter`) of
the **resolved, pre-simplification** geometry. Cliopatria's own `Area` field
agrees to within 0.003%, so the recomputation is not correcting the source — it
corrects *us*, because clipped polities are smaller than their source claims and
tier-1 features carry no area at all.

### Predecessors and successors

For polity P with lifespan `first..last`:

```
predecessors = who occupies P's peak-extent geometry in year (first - 1)
successors   = who occupies P's peak-extent geometry in year (last  + 1)
```

- Candidates are all records whose interval covers that year, excluding P itself.
- Overlap is measured as **share of P's own geometry**, not of the candidate's.
- Floor **3%**, keep the **top 6**, ranked by share.
- Both use the **peak** geometry (§6) and **pre-clip** geometry (§6).
- Empty when P touches the dataset edge, since the answer is unknowable there.

Percentages rarely sum to 100 and are not meant to: a fragmented collapse is only
partly captured, which is why the map always shows the figure.

### Territory covered today

The peak-extent geometry is intersected with Natural Earth 50m country polygons.
Each hit reports the **percentage of that country** the polity covered; the list
is ranked by **absolute overlap area** (so large territories lead rather than
micro-states at 100%), filtered at **≥3%**, truncated at **14** entries.
Antarctica is excluded.

### World population

Taken from OWID directly — 261 points from 10000 BCE to 2023, no derivation. The
viewer interpolates **in log space** between adjacent points, because population
grows multiplicatively; a straight line between two millennia understates
everything in between. The same log interpolation drives city sizes.

Per-polity population is deliberately absent; see BACKLOG.md for the two
implementations, their validation, and why the feature was withdrawn.

These are properties of the data, not bugs in the code. They are documented
because a successor will otherwise rediscover them the hard way.

- **Cliopatria freezes colonial extents after independence.** The French Fifth
  Republic is one 1961–2023 record still holding Algeria; the Kingdom of Great
  Britain keeps its Arabian holdings from 1956 to 2023; Estado Novo holds Cabinda
  until 2023 despite falling in 1974. A 1900–2024 sweep found **36 polity pairs
  overlapping by ≥30%** of the smaller. Crucially, **not all are defects** — some
  are occupations (the USA in Japan, Korea, Iraq) and some are unions (Syria and
  the UAR), which the ontology models as relations. The overlap detector is
  really a *relation* detector. See OQ-6. The visible symptom is fixed; the
  geometry is not.
- **Cliopatria's fast-conquest decades are coarse** — the defect behind ARB-001.
- **AWMC's `political_shading` layers are maximum-extent**, not year-specific,
  which is what authority windows exist to contain.
- **Cliopatria reuses Wikidata ids** across unrelated polities — see §5.
- **Cliopatria's umbrella records** duplicate their components' geometry — ARB-002.

## 8. Uncertainty the map does not yet represent

Stated plainly because the map currently looks more confident than it is.

- **Unsurveyed and genuinely stateless ground look identical.** Distinguishing
  them was an explicit project goal and remains unmet; it needs a curated
  "known-unrecorded" mask, which nothing can derive automatically. OQ-2.
- **Disputed and frontier zones are drawn as hard lines.** For most pre-modern
  frontiers a crisp line is itself a falsehood. Hatching for disputes and
  feathered edges for steppe frontiers are both intended and unbuilt.
- **Sub-polities are absorbed into their overlords.** Vassals, clients and
  satrapies inside an envelope simply vanish. This is a deliberate consequence of
  choosing envelope semantics plus default-to-sovereign; see
  [ONTOLOGY.md](ONTOLOGY.md) §4 for the accepted casualties and the one-line
  arbitration edge that restores any of them.
