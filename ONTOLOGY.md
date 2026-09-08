# Polity ontology

> ## ⚠ STATUS: SPECIFICATION — NOT IMPLEMENTED
>
> **Nothing in this document exists in the code.** No `subject_of` edge, no
> render root, no `polity_class`, no dependency tinting. Grep the repository for
> any term below and you will find nothing; the map today treats every polity as
> a flat sovereign competitor.
>
> This is a design agreed in advance of building it, so that the data model is
> settled before anyone writes the migration. Read it as "what the map should
> become", never as "how the map works". For how the map actually works, see
> [ARCHITECTURE.md](ARCHITECTURE.md).

**Objective** — settle what counts as a polity, how polities relate to one
another, and what the map should draw as a result, before any of it is built.

**Read after** [METHOD.md](METHOD.md), whose §8 lists the uncertainties this
model is meant to resolve. **Read before** attempting the migration — several
decisions below were forced by measured failures, recorded in
[arbitration/OPEN_QUESTIONS.md](arbitration/OPEN_QUESTIONS.md).

**Why it matters:** this is the largest single piece of unbuilt work in the
project. It is what would fix sub-polities being erased by their overlords
(OQ-1), dissolve the annexation-versus-distinct-polity dispute (OQ-3), enable the
dependency tinting chosen in §3, and give the label rule the continuity signal it
needs for cases like Estado Novo.

---

## 1. Polities are uniform nodes; subordination is an edge

"Vassal" is never a property of a polity. Bavaria is sovereign in one century
and subject in the next, and the same duchy can be a province of one empire and
an ally of another simultaneously. So every polity is the same kind of node, and
all hierarchy lives in **time-bounded edges** between nodes — which fits the
event-interval schema the project already uses.

```
polity   { id, name, wikidata, polity_class, aliases[] }
edge     { type, from_polity, to_polity, from_year, to_year, source, confidence }
```

### Edge types

| type | symmetric | territorial effect |
|---|---|---|
| `province_of` | no | integral subdivision; drawn as internal lines |
| `subject_of` | no | vassal / tributary / client / protectorate / satrapy |
| `member_of` | no | league or confederation membership |
| `personal_union_with` | yes | shared ruler, separate states; no nesting |
| `alliance_with` | yes | none — never affects rendering |
| `occupied_by` | no | de facto control differs from de jure claim |
| `continues` | no | same entity, renamed (Byzantium continues Rome) |
| `succeeds` | no | new entity inheriting a predecessor (Qing -> ROC) |

`continues` and `succeeds` are the identity axis, and they are what drives the
already-agreed rule that successor states inherit their predecessor's colour.

### Polity class

`polity_class` never affects hierarchy — only **border style**:
sedentary_state, city_state, nomadic_confederation, thalassocracy, league,
colonial_empire. This is where feathered steppe frontiers would live, as opposed
to hard delimited borders. Not yet decided (see open items).

---

## 2. A border means the sphere of effective control  *(decided)*

Where sources disagree about what a border encloses, the map takes the
**envelope** reading: a polity's border is everything it effectively controlled,
client states included. This follows the project's founding rule that zones of
effective control *are* the borders until delimited borders exist.

Consequence, measured: at 200 CE the Kingdom of Osroene is 0% inside
Cliopatria's Rome but 100% inside AWMC's Rome, because Cliopatria maps *directly
administered* territory while AWMC/Barrington maps *imperium*. Under the
envelope rule AWMC wins and Osroene's ground is Roman.

Sources therefore declare in `registry.yaml` what their geometry means:

```yaml
semantics: envelope      # outer frontier incl. clients (AWMC extent maps)
semantics: direct_rule   # directly administered only (Cliopatria)
semantics: claimed       # asserted, not necessarily held
```

---

## 3. Dependencies render as a lighter tint of the overlord  *(decided)*

A dependency keeps its own shape but is drawn in a **paler tint of its
overlord's hue**, with a lighter boundary — the convention of the Macedon
reference map, where dependent territories appear in pale orange against solid
Macedonia. An empire still reads as one colour block while showing what was held
directly versus indirectly.

| relation | fill | boundary |
|---|---|---|
| render root (sovereign) | full hue | solid |
| `province_of` | parent hue, unchanged | thin internal line (Achaemenid style) |
| `subject_of` | parent hue, lightened | thin, lighter |
| `member_of` | parent hue, desaturated | thin, dashed |
| `occupied_by` | hatched over de jure fill | per dispute convention |

**Render root**: a polity with no outgoing `province_of` / `subject_of` /
`member_of` edge in the current year. Walk the chain upward; the top is the root
and supplies the hue.

**Render depth is two levels.** Deeper nesting is stored but collapses visually
into the nearest rendered ancestor, so the Holy Roman Empire does not explode
into bishoprics.

---

## 4. Missing relations default to sovereign  *(decided)*

Only ~20% of Cliopatria records carry a `MemberOf` edge, and geometric inference
within a single source is useless — no polity is meaningfully contained inside
another, because sources carve clients out rather than nesting them. Rather than
auto-inferring, **a polity with no edge is treated as sovereign.**

Accepted consequence: where an envelope source covers a polity that has no edge,
that polity is absorbed and disappears. This is the OQ-1 behaviour, now
deliberate rather than accidental — with no evidence of a distinct dependency,
the envelope's claim stands. Measured casualties in the slice: Osroene,
Adiabene, Gordyene (200 CE), Lysimachus (323 BCE), Judea, Galatia (60 BCE).

Each is recoverable with a single arbitration edge, e.g.

```json
{"id":"ARB-0NN","action":{"type":"edge","edge":"subject_of",
 "from":"Kingdom of Osroene","to":"Roman Empire","years":[195,214]}}
```

The `% yielded` figures already produced by `scripts/resolve.py` are the
shortlist of candidates worth curating.

---

## 5. What this dissolves

The annexation-versus-distinct-polity dispute (OQ-3) stops being a question that
needs an answer. Rome annexed Dacia in 106; Cliopatria folds Dacia into Rome and
historical-basemaps keeps it separate. Under an edge model Dacia becomes
`province_of` Rome in 106 and continues to exist as an entity drawn as an
internal line. Both sources were right; they simply chose different render
collapses of the same fact.

---

## Open items

- **Border style by polity class.** Should nomadic confederations and desert or
  steppe frontiers render feathered rather than as hard lines? A crisp line is
  arguably a falsehood for most pre-modern frontiers.
- **Continuity rules.** Which transitions are `continues` (identity preserved,
  colour inherited) versus `succeeds` (new entity, colour inherited once)?
  Byzantium/Rome, Qing/ROC/PRC, and the Frankish partitions each need a call.
- **Where edges come from at scale.** Cliopatria supplies ~20%. Wikidata has
  richer relations via the same ids Cliopatria already carries, and
  historical-basemaps has `SUBJECTO`, which on inspection is mostly
  self-referential and needs verification before use.
- **Leagues.** The Peloponnesian League, Delian League and League of Corinth are
  `member_of`, but whether a league is itself a render root or only a tint on its
  members is undecided.
