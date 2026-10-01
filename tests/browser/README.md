# Browser verification

The app and Node unit tests require no npm packages. The optional ruler browser
suite uses Playwright (verified with 1.62.1) and Chromium or an installed Chrome.
Install QA dependencies in a separate local directory:

```sh
npm install --prefix /tmp/chronoscape-browser-qa --no-save --package-lock=false playwright@1.62.1
node /tmp/chronoscape-browser-qa/node_modules/playwright/cli.js install chromium
python3 -m http.server 8451 --bind 127.0.0.1 --directory docs
```

In a second terminal, from the repository root:

```sh
PLAYWRIGHT_MODULE=/tmp/chronoscape-browser-qa/node_modules/playwright \
QA_BASE_URL=http://127.0.0.1:8451/ \
QA_OUTPUT=/tmp/chronoscape-rulers-qa \
node scripts/qa_rulers.cjs
```

The atlas suite checks What changed, search by alternative name, place, ruler
and year, polity playback, globe orientation, themes and the phone sheet. Run it
the same way, with its own output directory:

```sh
PLAYWRIGHT_MODULE=/tmp/chronoscape-browser-qa/node_modules/playwright \
QA_BASE_URL=http://127.0.0.1:8451/ \
QA_OUTPUT=/tmp/chronoscape-atlas-qa \
node scripts/qa_atlas.cjs
```

Alternatively, set `CHROME_PATH` to an installed Chrome executable and omit the
Chromium download. `QA_BASE_URL` must end in `/`; the script defaults to port
8337, so set it explicitly when following the README server command. The suite
writes `report.json` and six screenshots; the atlas suite writes six more. Inspect those images; assertions alone
do not establish visual quality. Retain results in the task's `qa/` directory
when recording a release or handover, rather than relying on temporary files.

This suite checks ruler UI behavior, desktop and emulated mobile viewport fit,
and browser errors. The wider navigation/theme/share-link manual checks are
listed in [QA_REPORT.md](../../QA_REPORT.md); it is not a complete accessibility,
physical-device or cross-browser audit.

## Renderer benchmark

From the repository root, prepare the local QA pages and serve the site:

```sh
git rev-parse --verify refs/tags/pre-ui-redesign >/dev/null 2>&1 || \
  git tag pre-ui-redesign 108468a7d158409ab11a9d31b41c70da4b46e1d1
python3 scripts/prepare_benchmark.py
python3 -m http.server 8000 --directory docs
```

Open [the benchmark](http://localhost:8000/qa/benchmark.html), wait for both
renderers to load, and click **Run benchmark**. Keep the tab visible. Results
appear in the table, expandable JSON record, `window.__benchmarkResult`, and
the console. The harness sends nothing externally.

The preparation script reads the original viewer directly from the repository's
`pre-ui-redesign` Git tag and copies the three maintained harness sources into
`docs/qa/`. This output is ignored by Git and must not be deployed as part of
the product. `--repo` can specify a separate checkout holding that tag, and
`--output` can select a temporary output directory for preparation checks.
The tag was not published: the first command recreates it locally if missing.
The baseline commit must be available; use a full clone, or fetch the missing
history before preparing the benchmark. Do not move an existing tag to a
different commit.

The comparison excludes loading, product controls, animation-frame waiting,
and GPU/browser paint. It measures real d3 geometry and Canvas draw submission
in the browser, with matched 1000 × 640 viewports, camera transforms, projection
fit, clipping, and raster density (DPR capped at 2). Original and redesigned
label policies intentionally remain different. Year preparation uses each
version's actual filtering/interpolation/caching behavior. Timings describe
these workloads, not universal speed or FPS. Repeat runs, report improvements
and regressions, and retain raw evidence alongside any performance claim.
