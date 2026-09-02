---
package: "@flighthq/textbidi"
updated: 2026-09-01
by: manager
---

# textbidi — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Checked against `packages/textbidi/src/` on 2026-09-01, after the explicit-backend work landed in
`a3d8f8898`.

- **The module-scoped backend still exists.** `_backend` and its deprecated, contract-only
  `setBidiClassBackend` remain in `bidiClassBackend.ts` as the source-compatible fallback for calls
  that omit the argument. Until they are removed, the omitted-argument path is still ambient state
  and the explicit dependency model is satisfied on the preferred route only, not exclusively.
  Removing the global is the remaining step, and it is a breaking change for any caller still
  relying on the setter — worth doing while there are no published consumers.
- **The compact table covers common scripts only.** A codepoint outside the ranges it knows resolves
  to the safe default `L`, silently. That is the blessed design — the full table is the designated
  `flight-rs` backend — but it means correct-looking output for uncovered scripts (CJK, Indic,
  Thaana, N'Ko, Syriac) rather than a diagnosable gap, and there is no `explain*` query that would
  tell a caller its text fell outside the table.
- **No guard module.** Neither the silent `L` default above nor a caller mixing an explicit backend
  with a previously installed one has an `enableTextBidiGuards` seam.
- **The charter's open directions are unchanged**: the `textbidi-data` full-table `rust:` backend,
  UAX #9 paragraph and bracket-pair (BD16/N0) rules, and shaping/layout integration all remain open.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-01** — Explicit `bidiClassBackend` parameter on `resolveBidiLevels`/`getBidiRuns` landed
  in `a3d8f8898`; charter Decision recorded, superseding the 2026-07-10 backend *delivery* wording
  only — the compact-default/full-table ruling is untouched. Status rewritten to the `Open`/`Log`
  contract from the old append-only log stub.
