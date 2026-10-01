# Folio interface — 2026-10-01

A redesign of the viewer, approved by the user as a private design mockup and
then built into the app. The user asked for a look like "finding a book in an
old university library" and for the original's serif type: the result sets
everything in Georgia over a hand-coloured atlas map. The new features shown in
the mockup are implemented as well. Base: `079d818`. **Published 2026-10-01 as
`9664250`**; see [Publication](#publication).

## Changes

**Look.** All text is Georgia, a system serif, so the self-hosted Space Grotesk
font and its licence file are removed. The light theme is paper and iron-gall
ink with a red accent. The dark theme is navy and gold, after the first viewer.
- **Map:** hand-coloured washes with pigment pooled inside each border, engraved
  water lines around coasts, a 15° graticule (5° when zoomed), a double neatline,
  and town symbols (circle with a centre point).
- **Labels:** spaced capitals sized to the territory, with italic sea names.
- **Globe:** a graduated ring like a library globe's.
- **Page:** a paper grain is generated in the browser for the light theme.
- **Sidebar and timeline:** the sidebar reads like a page, with dotted leaders
  and small uppercase heads. The timeline is a scale of years with hatching that
  shows how often the map changes, and step buttons name the year they move to.

**Features.**
1. **What changed.** A sidebar tab compares the map in force with the one before
   it. It lists territories first mapped, no longer mapped (with the year they
   are mapped again) and changed in area, and can be limited to the current view.
   On the map, new territories are outlined, large changes keep their colour,
   others fade, and earlier extents are dotted. The wording says "mapped", not
   "founded" or "fell".
2. **Search.** Search groups polities, places, rulers and years and shows a
   preview with a small plate of the polity at its largest. Polities match by
   name or alternative name: `sources/aliases.yaml` is now published as
   `docs/data/aliases.json` by `scripts/build_aliases.py`, so "rome" finds the
   Roman Empire. A shared word stem also counts, so "byzantium" finds the
   Byzantine Empire. Ruler names are indexed while idle once the optional ruler
   download arrives. A ruler result opens the polity at the reign, or at its
   first mapped year if the reign began earlier.
3. **Play a polity.** The detail panel plays one polity's mapped years and stops
   at the last.
4. **Polity detail.** Adds a lifespan scale, a list of the rulers in office with
   a reign chart, and divided bars for the inferred relationships.
5. **Globe and phone.** The globe opens toward the year's territories from the
   whole-world map. On phones the sheet covers at most three fifths of the map,
   and focusing (or opening a shared link without a camera position) frames the
   territory above it.
6. **Cities.** A city now appears from its first population figure rather than
   100 years before it, and is hidden inside a gap of more than 300 years between
   figures. Previously the app interpolated across such gaps, which showed Ao,
   Memphis and Handan as large cities in 1200 CE.

No geometry, ruler evidence or historical data changed. `aliases.json` is a new
published file derived from an existing source file; fingerprints now cover nine
files, and `validate.py` gained one check (47).

## Verification

Logs, screenshots and environment are in [qa/](qa/).

- 102 JavaScript tests and 55 Python tests pass. The new tests cover search
  ranking and aliases, map changes, timeline hatching, the city rule, globe
  orientation, framing above an overlay, and search against the published data.
  Two tests of Space Grotesk loading were removed with the font.
- 47 full historical checks pass with no failures or skips, including the new
  alias check. The public ruler build, coverage audit, alias file and data
  fingerprints reproduce.
- **Browser checks:** the existing ruler suite (17 checks) and a new atlas suite
  `scripts/qa_atlas.cjs` (13 checks) pass in Chrome without page errors. All 12
  screenshots were inspected, then reduced to a 256-colour palette for storage.
- **Frame timing:** one local run per view, comparing the current site with this
  change ([frame-times.txt](qa/frame-times.txt), method in
  [frame-times-method.txt](qa/frame-times-method.txt)). The full-detail drawing
  costs 13–15 ms once the map stops.

  | Measurement | World map, 1200 CE | Zoomed, 1700 CE |
  |---|---|---|
  | Drag, median per frame (this change / current) | 9.1 / 9.0 ms | 11.6 / 10.6 ms |
  | Year step (this change / current) | 18.2 / 14.9 ms | 23.6 / 20.9 ms |

All 81 relative links in the edited documents resolve ([link-check.txt](qa/link-check.txt)).

Node.js is not on this machine's PATH; the Codex-bundled Node 24.19.0 and
Playwright 1.62.1 were used with installed Chrome
([environment.txt](qa/environment.txt)).

## Publication

Pushed `079d818..9664250` to `main` at the user's request. Evidence is in
[qa/live/](qa/live/), summarized in
[publication-check.txt](qa/live/publication-check.txt).

- Pages run 36940250504 (deployment 6797416264) for `9664250` succeeded.
- The live `index.html`, stylesheet, the changed modules, `data-version.js` and
  `aliases.json` match the commit byte for byte, and the removed font returns
  404.
- Both browser suites (17 ruler and 13 atlas checks) passed against the live
  site without page errors. Their 12 screenshots were inspected, then reduced
  to a 256-colour palette for storage.

## Not done

- Historical city names are not tracked: labels use the names stored in the data
  (for example "Istanbul" in 1200 CE). The mockup's "Constantinople" assumed a
  sourced rename dataset that does not exist yet.
- Shaded relief and rivers were not added; they would need new Natural Earth
  downloads.
- Territory colours remain a stable hash of the identity, so neighbours can share
  a pigment; adjacency-aware colour and successor inheritance are not implemented.
- No accessibility conformance audit, physical-device test or cross-browser run
  beyond Chrome.
