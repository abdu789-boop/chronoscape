# Terrain shading and rivers — 2026-10-03

The user asked for "terrain shading and rivers as geographical options that can
be turned on and off". Both are new map layers, switched on by default, under
"Present-day geography" in the Layers panel. Base: `f752a39`. **Published
2026-10-03 as `71b05fb`**; see [Publication](#publication).

## Changes

**Data.** `scripts/build_geography.py` builds two published files from three
public-domain Natural Earth 1:50m inputs, which `scripts/fetch_sources.sh` now
downloads (hashes in [raw-inputs.txt](qa/raw-inputs.txt)):

- `docs/data/rivers.json` (606 KB): 461 river lines, including river courses
  through lakes, and 357 natural lakes, simplified to about 1 km, each with
  Natural Earth's scale rank. The 48 reservoirs are left out because most are
  twentieth-century dams; the river's course through each is drawn instead.
- `docs/data/terrain.webp` (1.5 MB): the SR_50M shaded relief, re-centred so
  that level ground (value 206, the raster's most common value) is mid-grey,
  with its contrast doubled, resampled to 8192 × 4096. At 4096 × 2048 the relief
  was visibly soft at regional zoom. WebP at quality 75 is 1.51 MB against
  2.24 MB for JPEG at quality 75, with slightly better fidelity (PSNR 39.9 dB
  against 39.2 dB).

`build_app_data.py` runs the script. Its `--check` compares `rivers.json` byte for
byte and the relief within a decoded tolerance, because WebP encoders differ
between library versions. `update_data_versions.py` now fingerprints any file
type: eleven files. `requirements.txt` pins Pillow, which encodes the WebP.

**Drawing.**

- `docs/js/terrain.js` renders the relief with WebGL 2. A fragment shader inverts
  the current Equal Earth or orthographic projection for each pixel, using d3's
  formulas, and samples a mipmapped single-channel texture, with the longitude
  gradient unwrapped at the antimeridian. One image therefore serves both
  projections and stays registered at every zoom and rotation.
- `map.js` blends the relief over the land (`hard-light` at 50%, both themes),
  clipped to the coastline, then draws rivers, and lakes filled with the sea
  colour with two engraved water lines and a shore line. All three are on the
  basemap, beneath the historical washes, as on a hand-coloured plate; a year
  change does not redraw them.
- Rivers up to rank 3 and lakes up to rank 1 show on the whole-world map; every
  rank shows from 6× zoom. Line width tapers with rank.
- On the flat map, river and lake paths are projected once per scale and reused
  through an affine transform while panning and zooming; a still frame at a new
  scale projects them again. The globe projects them for each rotation, after
  skipping features whose bounding cap lies outside the visible part of the
  sphere. Without these, rivers added about 4–5 ms to every drag frame.
- Without WebGL 2 the terrain switch is disabled with the note "Terrain shading
  needs WebGL 2, which this browser does not provide."; rivers still draw.

**Interface.**

- The Layers panel groups "Historical" (territory labels, historical cities) and
  "Present-day geography" (terrain shading, rivers and lakes, borders), with the
  note: "Relief, rivers, lakes and borders are drawn as they are today.
  Coastlines and river courses have changed over the period mapped."
- The key adds "Present-day river" ("River" on phones, where space is short).
- Links record `terrain=0` or `rivers=0` only when a layer is off. A switched-off
  layer is not downloaded; requests start once the basemap has arrived.
- On phones the taller Layers panel now opens over the zoom buttons.

Historical geometry, rulers and the other published files are unchanged.

## Verification

Logs, screenshots and environment are in [qa/](qa/).

- 109 JavaScript tests and 55 Python tests pass. New tests cover the layers' URL
  state, the published files, versioned loading and lake winding, rivers
  switching off, path reuse while panning, rivers kept at the globe's edge, and
  drawing without WebGL 2. Disabling the path reuse or over-culling the globe
  makes the matching test fail ([mutation-check.txt](qa/mutation-check.txt)).
- 51 full historical checks pass with no failures or skips, including four new
  geography checks. The ruler build, coverage audit, alias file, geography layers
  and data fingerprints reproduce.
- **Browser checks:** the ruler suite (17 checks) and the atlas suite (15 checks,
  two new) pass in Chrome without page errors. The new checks sample map pixels:
  relief changes the Himalaya and leaves the Pacific unchanged, the Nile is drawn
  where it runs today, each layer switches off and updates the link, and a layer
  is downloaded only when switched on. All 13 screenshots were inspected, then
  reduced to a 256-colour palette for storage. Light, dark, globe, zoomed and
  phone views are in [screens/](qa/screens/), stored as WebP.
- **Registration:** after panning, zooming and turning the globe, the map matched
  a fresh load of the resulting link apart from edge pixels
  ([registration.txt](qa/registration.txt)).
- **Frame timing** against the published site, two local runs per view
  ([frame-times.txt](qa/frame-times.txt), method in
  [frame-times-method.txt](qa/frame-times-method.txt)). Each cell gives the
  range over the two runs, in milliseconds:

  | Published → this change | Flat, world | Flat, zoomed | Globe | Globe, zoomed |
  |---|---|---|---|---|
  | Drag frame, median | 9.0–9.2 → 9.2–9.3 | 11.8 → 11.8 | 8.8–9.1 → 10.4–10.6 | 9.7–9.8 → 10.5 |
  | Full-detail frame after moving | 12.9–15.1 → 12.6–13.0 | 10.8–12.2 → 11.7–12.3 | 10.8–12.3 → 16.8–16.9 | 12.4–14.4 → 16.8–17.1 |
  | Year step | 4.5–4.6 → 4.2–4.4 | 13.9–14.8 → 11.8–13.2 | 4.5–4.8 → 4.3–4.4 | 4.0–4.4 → 4.2–4.3 |
  | Wheel zoom, 90th percentile | 11.8–13.2 → 14.6–15.2 | 15.3–15.5 → 24.1–24.2 | 12.0–13.5 → 14.8–15.2 | 13.8 → 13.8–16.6 |

  The slower wheel frames are those crossing a zoom level that adds rivers. The
  2026-10-01 method's "year step" pressed an arrow key while the map had focus,
  which pans it; this method measures both.

All relative links in the edited documents resolve ([link-check.txt](qa/link-check.txt)).
Node.js is not on this machine's PATH; the Codex-bundled Node 24.19.0 and
Playwright 1.62.1 were used with installed Chrome, whose headless WebGL 2 ran on
the GPU ([environment.txt](qa/environment.txt)).

## Publication

Pushed `f752a39..71b05fb` to `main`. Evidence is in [qa/live/](qa/live/),
summarized in [publication-check.txt](qa/live/publication-check.txt).

- Pages run 37125350663 (deployment 6828001521) for `71b05fb` succeeded.
- The live `index.html`, stylesheet, changed modules, `terrain.js` and
  `data-version.js` match the commit byte for byte, as do `rivers.json` and
  `terrain.webp` at their versioned URLs; the relief is served as `image/webp`.
- Both browser suites (17 ruler and 15 atlas checks) passed against the live
  site without page errors, including the relief, river and download checks.
  Their 13 screenshots were inspected and are stored as WebP; the reports keep
  the suites' original `.png` names.

## Not done

- Rivers, lakes and coastlines are present-day. Historical courses and
  shorelines, such as the Yellow River's mouths, the Mesopotamian coast or the
  Aral Sea, would need sourced reconstructions for each period.
- The relief softens beyond about 8× zoom: the texture has about 23 pixels per
  degree, below the source's 30.
- WebGL 2 relief was tested only in Chrome. No accessibility conformance audit or
  physical-device test.
