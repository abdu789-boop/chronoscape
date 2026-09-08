# Version history

## Typography, factual text, and dark-theme refinement

The initial UI redesign remains preserved at commit `ee4339a`. This refinement
updates its presentation without changing historical data or navigation behavior.

- Polity labels and detail headings use self-hosted Space Grotesk at medium
  weight. Thinner map text halos preserve contrast without adding the appearance
  of heavy lettering.
- Removed slogans, promotional descriptions, and decorative flavor text from
  the interface. **All app text must remain informative or instructive**; this
  is a persistent product requirement for future changes.
- Dark mode uses charcoal and gray interface surfaces, subdued slate and sage
  territory colors, and a mint selection outline. The map has stronger contrast
  against the surrounding interface.
- Sidebar swatches use the same identity-based palette as the map and update
  immediately when the theme changes. Browser theme color follows the active
  theme.
- Font loading remeasures label collision boxes and requests a redraw while
  retaining cached map geometry. The font is served locally with the app; no
  external font service is required.

See [CREDITS.md](CREDITS.md) for font attribution and its SIL Open Font License,
[ARCHITECTURE.md](ARCHITECTURE.md) for rendering behavior, and
[QA_REPORT.md](QA_REPORT.md) for validation.

## UI redesign

Implemented the atlas redesign in the requested order: readability, speed,
aesthetics, and modernization. This entry records the implementation scope;
publishing is a separate step.

- Replaced the floating detail card with an explorer and structured sidebar,
  responsive bottom sheet, extent chart, aligned percentages, inference labels,
  clear selection outlines, and explicit zoom/maximum-extent actions.
- Added search across eras, exact-year BCE/CE entry, timeline windows, map-change
  stepping and playback, explicit layers, keyboard controls, help, and view links.
  The whole-history slider snaps to data changes; narrower windows and direct
  entry allow individual years. Navigation ends at the dataset's 2024 boundary.
- Introduced coordinated light/dark themes, sans-serif controls, restrained atlas
  typography, curated territorial colors, multiline labels with halos, and
  viewport-aware city display.
- Split the viewer into native ES modules. Data URLs use content fingerprints;
  the build regenerates them automatically. Progressive basemap loading, a
  parsing/winding worker, bounded year caches, frame scheduling, reusable canvas
  layers, and projected paths reduce repeated work.

Historical data, source precedence, arbitration, and ontology implementation
status remain unchanged. The full geometry download is still required; there is
no era sharding or WebGL conversion. See [QA_REPORT.md](QA_REPORT.md) for validation and the rendering measurement
method.

Validation commands are `node --test tests/*.test.mjs`,
`python3 scripts/validate.py --quick`, and
`python3 scripts/update_data_versions.py --check`. The full historical validator
remains required after data builds. See [ARCHITECTURE.md](ARCHITECTURE.md) for
module ownership and [README.md](README.md) for local startup.

## Baseline before the UI redesign

- **Git tag:** `pre-ui-redesign` (annotated, local).
- **Commit:** `108468a7d158409ab11a9d31b41c70da4b46e1d1`.
- **Purpose:** preserve the existing viewer before work on readability, speed,
  aesthetics, and modernization, in that priority order.
- **Contents:** all tracked application code, built map data, project documents,
  source configuration, arbitration records, and build/validation scripts at
  that commit. The working tree was clean when the baseline was recorded.
- **Excluded:** ignored raw source downloads, the Python virtual environment,
  and generated local reports. They are not required to run the saved viewer;
  rebuilding data requires the setup described in README.

This is a Git snapshot, not a separate hosted deployment. Creating it does not
change the live site. The tag must be pushed explicitly if a remote copy is
wanted; it has not been published as part of this save.

### Inspect or run the saved version

From the repository root:

```bash
git show --no-patch pre-ui-redesign
git diff pre-ui-redesign -- docs/
```

To run the baseline alongside ongoing work, create a separate checkout in a new
sibling directory (the destination must not already exist):

```bash
git worktree add --detach ../chronoscape-pre-ui-redesign pre-ui-redesign
python3 -m http.server 8452 --directory ../chronoscape-pre-ui-redesign/docs
```

Open http://localhost:8452. This leaves the active checkout unchanged. To develop
a restoration in that separate checkout, create a branch there with
`git switch -c codex/restore-pre-ui-redesign`; publishing remains a separate step.

### What the baseline contains

The original full-screen D3/Canvas viewer has a dark palette, serif typography,
a floating polity detail card, Equal Earth and globe views, modern-border
controls, and a bottom timeline. See the documents at the tagged commit for the
exact architecture, methodology, and backlog that accompanied this version.

At this baseline the UI improvement suggestions were still proposals. The
snapshot retains the original behavior and limitations, including timestamped
data URLs that prevent normal cache reuse across visits. The implementation
above does not change the saved tag. Saving the baseline itself was not a new
validation or performance benchmark.
