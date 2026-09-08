# Open arbitration items

**Objective** — record the historiographical decisions this project has
deliberately *not* made, with the evidence for each, so a successor inherits the
question rather than an unexplained silence.

**Read after** [METHOD.md](METHOD.md) §4, which explains how arbitration works
and where resolved decisions live.

Each item needs a human call. In most cases the engine already has the mechanism
and simply will not guess, because a blanket rule would be wrong in cases already
identified here. Resolved items move to `decisions.jsonl` and become code the
build applies.

---

## OQ-1 — Sub-polities erased by their own parent  *(RESOLVED 2026-08-19, see ONTOLOGY.md)*

**Diagnosis corrected.** This was not primarily an ontology gap. The measured
cause is a semantics mismatch between sources: at 200 CE the Kingdom of Osroene
is 0% inside Cliopatria's Rome but 100% inside AWMC's Rome, because Cliopatria
maps directly administered territory while AWMC/Barrington maps imperium
including client kingdoms. Precedence treated the two as answering the same
question, so the higher tier destroyed a distinction the lower tier got right.

**Decision.** A border means the sphere of effective control (the envelope
reading), dependencies render as a lighter tint of the overlord's hue, and a
polity with no relation edge defaults to sovereign. The listed casualties below
therefore remain absorbed **by design** — with no evidence of a distinct
dependency, the envelope's claim stands. Each is recoverable with a one-line
`subject_of` edge in `decisions.jsonl`; the `% yielded` column is the curation
shortlist.

Original evidence retained:

Measured cases:

| Year | Polity | Yielded | What it actually was |
|---|---|---|---|
| 323 BCE | Perdiccas | 99.8% | regent of Alexander's whole empire |
| 323 BCE | Kingdom of Lysimachus | 94.2% | satrap of Thrace under that empire |
| 323 BCE | Laomedon | 85.0% | satrap of Syria under that empire |
| 200 CE | Kingdom of Osroene | 100% | Roman client kingdom from 195 |
| 200 CE | Kingdom of Adiabene | 80.4% | contested Rome/Parthia after 198 |
| 200 CE | Kingdom of Gordyene | 56.0% | contested Rome/Parthia |
| 500 BCE | Macedonian Empire | 99.4% | genuinely a Persian vassal after 512 |

The Diadochi cases are unambiguous: in 323 these men governed *within* Alexander's
empire, so clipping them against it is wrong — they should nest inside the fill as
internal lines (the Achaemenid style already chosen for this project).

The 200 CE cases are genuinely contested and are a different problem: Osroene was a
Roman client, while Adiabene and Gordyene were Parthian-facing and only briefly
Roman after Severus' 198 campaign. These may be true disputed-territory cases
deserving hatching rather than nesting.

`protect_from_clip` exists as a decision action and will exempt a polity, but the
real fix is the polity ontology (deferred to its own session). Do not paper over
this case-by-case; it is the concrete evidence for what the ontology must model.

---

## OQ-2 — "Unsurveyed" vs "genuinely stateless" is not yet distinguishable

The project requires these to look different on the map. The engine currently
reports one number: percent of view under a polity (roughly 21% at 550 BCE,
34% at 200 CE for the slice). The remaining area is reported as "surveyed but
empty", which is only honest in the weak sense that Cliopatria declares global
coverage and shows nothing there.

That conflates two very different states: the Sahara interior in 200 CE (people
present, polities arguably present, boundaries unrecorded) and genuine unclaimed
land. Resolving it needs an editorial "known-unrecorded" mask — a curated layer
per region and era. Nothing automatic can derive it.

---

## OQ-5 — Cliopatria overstates the Roman Republic at 60 BCE

Agreement with tier 1 is markedly worse here than anywhere else in the slice:
IoU 0.577, with Cliopatria's Republic 123.9% of AWMC's area. Compare Rome at
117 CE (0.76) and 200 CE (0.80). Tier 1 wins automatically inside 70-59 BCE, so
the drawn map is fine, but the gap suggests Cliopatria's late-Republic extent is
inflated across the surrounding centuries where no tier-1 source covers us.
Worth a targeted look at 100-30 BCE.

---

## OQ-3 — Annexation vs distinct polity (tier-3 signal, not yet arbitrated)

Tier 3 consistently names polities the drawn result does not, even after alias
reconciliation. At 117 CE: Armenia, Dacia, Alans, Blemmyes. At 200 CE: Armenia,
Himyarite Kingdom, Suren Kingdom.

Rome annexed Dacia in 106 and Armenia in 114, so Cliopatria folding them into the
Roman Empire is defensible; historical-basemaps keeping them separate is also
defensible. This is an ontological disagreement about when a conquered polity
stops existing, not a geometry error. It needs a written editorial policy, which
belongs with the ontology work.

---

## OQ-4 — Tier-1 authority windows are asserted, not derived

Every `authority.years` window in the registry is a judgement call about how long
a snapshot stays true (Trajan's 117 extent is trusted 114–117; the Severan 200 CE
map is trusted 190–235). These are defensible but unreviewed. They deserve a pass
by someone checking each against the actual campaign chronology.

---

## OQ-6 — Cliopatria freezes colonial extents after independence

Found 2026-08-19 from two user-reported label misplacements, which turned out to
be a symptom of a data defect rather than a rendering one.

Cliopatria holds long modern intervals that never register decolonisation:

- **French Fifth Republic, 1961..2023** — one 62-year record of 3.03M km², which
  is metropolitan France (~640k) plus Algeria (~2.38M). Algeria became
  independent in 1962. A separate `People's Democratic Republic of Algeria`
  record exists from 1963 and covers *exactly* the same ground, so the two
  claims sit on top of each other for six decades. The 2024 record finally drops
  to 680k km² with no Algerian overlap.
- **Kingdom of Great Britain, 1956..2023** — retains its Arabian holdings
  throughout. From 1956 the largest single piece of "Britain" is in Arabia, not
  the British Isles.
- **Estado Novo, 1979..2023** — the Portuguese regime fell in 1974, yet a 6,892
  km² record covering Cabinda runs to 2023. Small enough to be invisible on the
  map, big enough to corrupt anything computed per polity.

A sweep of 1900–2024 at five-year steps found **36 polity pairs overlapping by
≥30% of the smaller one**. They are not all defects — they sort into three kinds:

| kind | examples | verdict |
|---|---|---|
| stale colonial claim | Britain × Kuwait / Qatar / Cyprus; France × Algeria / Djibouti; Portugal (Estado Novo) × Angola / Guinea-Bissau; British East Africa × Kenya / Uganda | defect |
| occupation / basing | USA × Japan (1955), USA × Korea (1950), USA × Iraq (2015) | arguably correct — this is `occupied_by` |
| union | Syria × United Arab Republic; Denmark-Norway × Iceland | correct — `personal_union_with` / `member_of` |

So the overlap detector is really a **relation detector**: overlapping claims mark
exactly the places where a flat sovereign model breaks and the ontology's edges
are required. Two of the three kinds are not errors at all.

**Decided so far:** the rendering half is fixed — labels no longer anchor to
ground another polity occupies (see `label_points()` in `build_app_data.py`).

**Not decided:** whether to correct the underlying geometry. Doing so needs a new
arbitration action that subtracts one polity's territory from another over a year
range, plus a per-case ruling on roughly twenty colonial pairs. A tempting
general rule — "a later-beginning polity's independence ends the earlier claim on
that ground" — would fire correctly on the colonial cases but wrongly on the
occupation and union cases, so it cannot be applied blindly.
