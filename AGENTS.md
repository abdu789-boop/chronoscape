# Repository guidance

Start with [HANDOVER.md](HANDOVER.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
Read [METHOD.md](METHOD.md) before changing data resolution; read
[sources/rulers/policy.md](sources/rulers/policy.md) before changing ruler admission.

- The site is served directly from `docs/`; no frontend bundler is required.
- Run commands from the repository root. Validation and optional browser setup
  are documented in HANDOVER.md and tests/browser/README.md.
- Keep interface text factual or instructive and historical uncertainty explicit.
- ONTOLOGY.md is a specification, not implemented behavior. Preserve that distinction.
- Do not hand-edit raw source inputs. Regenerate data through the relevant
  pipeline, update cache fingerprints, and review the resulting evidence/diff.
- Keep application code, committed evidence and generated outputs consistent.
  Do not describe a skipped raw-source check as a full validation pass.
- Update existing canonical documentation when behavior or setup changes. Retain
  dated handoff/QA records under `workstreams/`; keep the current-state and
  deliverable indexes as links rather than copies of the datasets.
