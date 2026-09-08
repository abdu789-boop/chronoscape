# Version history

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

The UI improvement suggestions are proposals, not implemented features. The
baseline also retains existing behavior and limitations, including timestamped
data URLs that prevent normal cache reuse across visits. Saving this version
is not a new validation or performance benchmark.
