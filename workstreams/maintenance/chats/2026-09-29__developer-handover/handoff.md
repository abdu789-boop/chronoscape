# Documentation audit handoff

## Outcome and current status

Completed a local documentation/setup audit against application commit `1e83435`
on 2026-09-29 America/New_York (2026-09-30 UTC). Ready for ongoing application
development with the transfer limits recorded below. The initial working tree
was clean. This task changes documentation and requirements, with no application
code, generated JSON or source-evidence edits. The initial audit made no commit
or push. The user's follow-up produced handover commit `732117f`; a subsequent
“push” request authorizes sharing it and these status updates through `origin/main`.

## Canonical artifacts

- [Root README](../../../../README.md) and [developer handover](../../../../HANDOVER.md).
- [Current state](../../../../knowledge/CURRENT.md) and
  [artifact index](../../../../deliverables/INDEX.md).
- [Readiness assessment](outputs/documents/readiness.md).
- [QA report](../../../../QA_REPORT.md), [ruler guide](../../../../docs/data/RULERS.md)
  and [browser setup](../../../../tests/browser/README.md).

Existing artifacts remain in place. This task adds retained test logs/screenshots
under `qa/`; empty lifecycle directories are intentional. The temporary generated
identity input and benchmark pages are reproducible intermediates, not deliverables.

## Verified facts and decisions

The static app has no required npm build or backend. Node 24.19.0 runs all 91
tests; the project Python 3.10.9 environment runs all 35 Python tests after
installing the previously undeclared lxml 6.1.1 dependency. pypdf 6.10.0 is also
declared for Archigos extraction. Playwright 1.62.1 is an optional QA dependency.
The incoming developer can reproduce the public ruler collection from committed
evidence; original extraction requires additional ignored raw files.

Existing source policy, interface requirements and implementation boundaries are
unchanged. OQ-1's proposed `subject_of` recovery is not implemented. The record
now distinguishes that design decision from current behavior. The benchmark tag
must be recreated locally from the documented hash on clones that lack it.

## Validation performed

| Check | Result and retained evidence |
|---|---|
| Node tests | 91 passed, [log](qa/node-tests.txt) |
| Python ruler tests | 35 passed, [log](qa/python-tests.txt) |
| Full historical validation | 46 passed, 0 failed/skipped, [log](qa/historical-validation.txt) |
| Public ruler build `--check` | Passed, [summary](qa/ruler-build.txt) |
| Identity audit `--check` | Passed, [summary](qa/identity-audit.txt) |
| Data fingerprints `--check` | Exit 0; command is silent on success, [log](qa/data-fingerprints.txt) |
| Python dependency consistency | Passed, [pip check](qa/python-dependencies.txt) |
| Pinned Python requirements | All installed versions match, [environment](qa/environment.txt) |
| Browser suite | 16 checks passed, [report](qa/browser/report.json) |
| Benchmark preparation | Passed, [log](qa/benchmark-preparation.txt); no new performance measurement |
| Local documentation targets | Passed, [link report](qa/documentation-links.json); external URLs/anchors excluded |
| Durable handover record | Passed without warnings, [closeout report](qa/closeout-validation.json) |

Visually inspected [desktop](qa/browser/desktop.png), [mobile](qa/browser/mobile.png),
[Parthian](qa/browser/parthian.png), [mobile tooltip](qa/browser/mobile-tooltip.png)
and [Mughal](qa/browser/mughal.png) screenshots. Ruler rows and evidence panels
fit the tested viewports; long evidence panels scroll. This does not establish
cross-browser, physical-device or complete accessibility conformance.

Node/Playwright came from the installed Codex dependency runtime; Python checks
used `.venv/bin/python`. The site was served locally on port 8451 and Chrome ran
with a temporary profile. Initial sandbox-only attempts failed to resolve PyPI
and launch Chrome; the permitted dependency/browser retries passed. Failed
attempt logs are retained beside successful logs, not represented as app failures.
Reproduction commands use ordinary tools documented in the root handover and do
not require the audit machine's absolute runtime paths.

The closeout validator used the installed end-of-chat-discipline skill script;
its report and local documentation/link checks are retained under `qa/`.

## Known gaps and exact next steps

1. Give the next developer a checkout containing handover commit `732117f` and
   its subsequent status updates. The user authorized pushing these to GitHub.
2. Before extraction work, transfer `data/raw/rulers/` with its receipts. The
   repository alone reproduces the normalized public build, not every original
   inspected source snapshot. New map downloads are not pinned to past revisions.
3. Before publishing, confirm repository permissions, Pages settings and deployed
   SHA; this local audit did not query remote state.
4. Continue the documented backlog: partial ruler coverage, ontology and open
   arbitration. Source pinning and CI remain engineering follow-ups.
5. A complete clean-machine install and full geometry rebuild were not repeated.
   Checks used the existing pinned geometry environment plus the added ruler
   packages. The 46 historical checks used raw sources already present locally.

No original files were moved or deleted; no new external historical source claims
were introduced. Historical release evidence is preserved and labeled by date.
