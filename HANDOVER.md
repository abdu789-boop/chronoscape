# Developer handover

Reviewed 2026-10-03 (America/New_York), including the ruler expansion following
`3c69275`, the year-format, licence and count fixes following `3dd9e62`, the
Folio interface change following `079d818`, and the terrain and river layers
following `f752a39`.
The repository is ready for a developer to run, test and continue the current
application. This handover does not certify complete historical coverage or a
fresh deployment. The latest work expands the ruler collection, adds incomplete
tenure support and records remaining work for every atlas identity.

## Start here

1. Read [README.md](README.md) for the product and local server command.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership and data contracts,
   then [METHOD.md](METHOD.md) before changing historical data or identity rules.
3. For ruler work, read [the data guide](docs/data/RULERS.md) and
   [acceptance policy](sources/rulers/policy.md).
4. Choose work from [BACKLOG.md](BACKLOG.md) and
   [open arbitration questions](arbitration/OPEN_QUESTIONS.md).

## Run and develop

The application is a static site in `docs/`, with vendored D3, native JavaScript
modules and committed JSON. It needs no backend, credentials, environment file,
frontend build or npm install to run. From the repository root:

```sh
python3 -m http.server 8451 --bind 127.0.0.1 --directory docs
```

Open [the local atlas](http://127.0.0.1:8451/). Keep the server running in its own
terminal. Direct `file://` loading is unsupported.

Development prerequisites: Git, Node.js 24 (validated with 24.19.0), Python 3.10+
and the pinned `requirements.txt`. The audit used Python 3.10.9. Create the
virtual environment with that interpreter or a newer supported Python, then
install requirements as described in README. `lxml` is needed for Wikipedia
extraction/tests and `pypdf` for Archigos PDF extraction; both are now declared.
Map downloads additionally need curl, unzip and gunzip. There is no root
`package.json`; `docs/js/package.json` only declares ES-module semantics.

Run these checks after setup:

```sh
node --test tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -p 'test_ruler_*.py'
.venv/bin/python scripts/validate.py --quick
node scripts/build_rulers.mjs --check
.venv/bin/python scripts/audit_ruler_coverage.py --check
python3 scripts/update_data_versions.py --check
.venv/bin/python scripts/build_aliases.py --check
git diff --check
```

For data rebuilds and releases, run `.venv/bin/python scripts/validate.py`
with raw map sources available and inspect its skipped count. A successful exit
with skipped raw-source checks is not full historical validation. For interface
changes, run both browser suites in [browser QA setup](tests/browser/README.md),
inspect their screenshots, and follow the manual checks in [QA_REPORT.md](QA_REPORT.md). No CI workflow is tracked; these checks are manual.

## Current state and boundaries

| Area | Verified local state |
|---|---|
| Map | 12,108 interval records, 1,544 identities, 3400 BCE–2024 CE; year zero is invalid |
| Rulers | 13,309 accepted reigns across 945 identities; 599 without accepted rulers; no complete roster |
| Ruler evidence | 270 individually cross-checked, 12,278 sampled-source, 501 approximate, 21 disputed and 239 incomplete-date records |
| Ruler work | 547 source-acquisition/extraction, 49 scope/evidence-review and 3 identity-review cases without accepted rulers |
| UI | Folio design (Georgia; paper and navy themes); search by name, alternative name, place, ruler and year; What changed between maps; polity playback; reign chart; flat/globe views; present-day terrain shading (WebGL 2) and rivers/lakes layers; share links; mobile detail sheet; ruler evidence tooltips |
| Ontology | Designed in ONTOLOGY.md, not implemented; no dependency edges or tinting |
| Removed features | No polity shortcuts, languages, religions or per-polity population; world population remains |

This table is the one place these counts are maintained. Other documents link
here rather than copying them, and `tests/current-state.test.mjs` fails when the
table disagrees with the committed data. Dated records (VERSION_HISTORY entries,
QA_REPORT sections and `workstreams/`) keep their counts as of their date.

Preserve factual/instructive interface text, uncertainty labels, original ruler
observations, repeated reigns and separate offices. Identity matching does not
independently corroborate dates. Present-day borders, relief, rivers and lakes
are reference geometry, labelled as present-day in the interface.
See [CREDITS.md](CREDITS.md) for the existing source-specific attribution and
licensing record; application code and all datasets do not share a single licence.

## Data reproduction and transfer

- **Run or rebuild the public ruler file:** committed `docs/data/` and
  `sources/rulers/` suffice. The builder and identity audit reproduce offline;
  exact commands and dependency order are in [RULERS.md](docs/data/RULERS.md).
- **Rebuild geometry:** install Python requirements, fetch map sources with
  `scripts/fetch_sources.sh`, run `scripts/build_app_data.py`, then full validation.
  The terrain and river layers rebuild on their own with
  `scripts/build_geography.py` once its three Natural Earth inputs are in
  `data/raw/`; full validation compares them with a rebuild.
  Downloads use mutable upstream branches/latest URLs and skip existing files.
  There is no pinned map-source snapshot lock, so a later fresh download can
  change results. Review output and attribution before accepting it.
- **Re-extract original ruler evidence:** transfer the ignored
  `data/raw/rulers/` cache and its acquisition receipts separately. Some inputs
  were manually acquired text extractions; no one-command bootstrap reconstructs
  every inspected snapshot. Source URLs/hashes in committed evidence describe
  provenance but do not contain the missing raw bytes.
- **Transfer existing work:** the handover package is recorded in commit
  `732117f`, including this documentation and
  `workstreams/maintenance/chats/2026-09-29__developer-handover/`.
  Include that commit and subsequent handover updates in the developer's checkout.
  Do not transfer `.venv/`;
  recreate it. `out/`, `docs/qa/` and raw downloads are ignored local artifacts.

## Release and recovery

The recorded hosting setup is GitHub Pages, `main` branch, `/docs` directory,
at [Chronoscape](https://abdu789-boop.github.io/chronoscape/). Remote settings,
current deployment SHA and collaborator permissions were not queried in this
local audit. The incoming developer needs repository write access and access to
Pages/Actions status before publishing.

1. Run the checks above, full historical validation without skips, and applicable
   browser checks. Review `git diff`, including generated data, source audits and
   `docs/js/data-version.js`. Ensure generated `docs/qa/` is not staged.
2. Update the relevant docs and VERSION_HISTORY with the change and actual test
   results. Commit the intended files; retain the previous deployed SHA.
3. When a release is authorized, push/merge the reviewed commit to `main`, check
   the Pages deployment status and SHA, then smoke-test the public site.
4. For a regression, revert the offending commit(s) in a new commit, rerun the
   applicable checks and publish the revert. Source and generated outputs must
   stay consistent; a local revert is not itself a deployed rollback.

The pre-redesign baseline is commit
`108468a7d158409ab11a9d31b41c70da4b46e1d1`. Its `pre-ui-redesign` tag is local;
fresh clones should use the commit hash. The benchmark guide documents how to
recreate the local tag, and VERSION_HISTORY explains separate-checkout use.

## Validation and next work

The latest recorded results are in the newest entry of
[VERSION_HISTORY.md](VERSION_HISTORY.md), with details in
[QA_REPORT.md](QA_REPORT.md) and logs/screenshots in the matching dated
workstream. The ruler expansion's source review and remaining coverage work are
in the [ruler handoff](workstreams/rulers/chats/2026-09-29__complete-ruler-coverage/handoff.md);
it did not remeasure rendering performance. The earlier documentation audit
remains in its dated maintenance workstream.

The next developer can start feature work immediately. For extraction ownership,
first arrange the raw-cache transfer. Engineering follow-ups are source snapshot
pinning and CI. Product/data follow-ups are partial ruler coverage, ontology
implementation and the unresolved arbitration cases. Full accessibility,
cross-browser and physical-device testing remain outside this audit.

## Common setup failures

| Symptom | Action |
|---|---|
| `node: command not found` | Install Node.js 24 and ensure its `bin` directory is on PATH |
| `No module named lxml` or `pypdf` | Use `.venv/bin/python` and reinstall `requirements.txt` |
| `Cannot find module playwright` | Follow the separate browser-QA install and set `PLAYWRIGHT_MODULE` |
| Browser connection refused | Start the server and match `QA_BASE_URL`, including its trailing slash |
| `Stale compared input` or `Stale ruler identity audit` | Follow the evidence → comparisons → identity audit → public build → fingerprints order in RULERS.md |
| Cache fingerprint check fails | Regenerate with `python3 scripts/update_data_versions.py` after intentional data edits |
| Layers panel says terrain needs WebGL 2 | The browser has WebGL 2 disabled or unavailable; the other layers still work. Headless QA uses the GPU, not SwiftShader |
| Missing `pre-ui-redesign` | Restore the documented local tag from the baseline commit; fetch missing history if necessary |
