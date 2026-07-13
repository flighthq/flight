---
package: '@flighthq/capture'
status: solid
score: 72
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# capture — Review

**Verdict:** solid — 72/100. The 2026-07-09 first-build decision (pure policy/format layer, no Playwright/Node I/O) is delivered exactly and tested well; the score is capped not by the code but by adoption: the package has **zero consumers** today, and three of the four 2026-07-03 Approved items (which now execute in `tool-capture`'s source) remain undelivered.

## Present capabilities

Two source files under `packages/capture/src/`, types header-first in `@flighthq/types` (`CaptureBaseline`, `CaptureColumnBaseline`, `CaptureCheckTier`, `CaptureCheckResult`):

- **Comparison policy** (`captureComparison.ts`): `CAPTURE_REGRESSION_TOLERANCE` (5) / `CAPTURE_PARITY_TOLERANCE` (15) with rationale comments grounded in measured backend agreement; `compareCaptureFingerprints(a, b)` parsing both strings via surface's `parseSurfaceFingerprint` and returning `Number.POSITIVE_INFINITY` when either is unparseable **or grid sizes differ** (Infinity fails any finite tolerance — corrupt baseline reads as a failing check, not a crash); `evaluateCaptureRegression` / `evaluateCaptureParity` producing a `CaptureCheckResult` `{ pass, difference, tolerance }`.
- **Baseline record ops** (`captureBaseline.ts`): `createCaptureBaseline`, `getCaptureBaselineField` (null sentinel), `setCaptureBaselineField`, `formatCaptureBaseline` (sorted columns, canonical field order, 2-space indent, trailing newline — byte-for-byte the tooling's on-disk format), `parseCaptureBaseline` (null on malformed/non-object JSON).
- **Tier vocabulary** — `CaptureCheckTier = 'regression' | 'parity' | 'smoke'` in types; smoke deliberately has no evaluator (charter: it stays in the tools).
- **Boundary hygiene** — deps exactly `@flighthq/surface` + `@flighthq/types`; no re-export of surface's fingerprint math (per the 2026-07-09 Decision); 25 tests across both files including round-trip, corrupt-input, and grid-mismatch cases.

## Gaps

1. **No consumers.** `grep` finds `@flighthq/capture` imported only by the sdk barrel. `scripts/compare-render.ts` still calls `@flighthq/surface`'s `parseSurfaceFingerprint`/`compareSurfaceFingerprints` directly with its own CLI tolerances, and `tool-capture`'s `baselineStore.ts` re-implements the identical baseline format/merge logic (its `writeBaseline` mirrors `formatCaptureBaseline` line-for-line). This duplication is the blessed deferral (2026-07-09 Decision: tool adoption follows the Rust parity crate) — recorded here because it is the package's largest real-world risk: two byte-format twins that can drift.
2. **Approved-ledger items outstanding.** Of the four 2026-07-03 Approved items (which target the tooling home): per-test tolerance overrides — not done (`compare-render.ts` still uses global `--regression-tolerance`/`--parity-tolerance` flags); raw-RGBA hashing — not done (`tool-capture/captureEntry.ts` hashes PNG screenshot bytes); clock pinning — not done (`tool-capture/captureBrowser.ts` seeds `Math.random` and explicitly notes "It does not pin the clock"). Fingerprint-capture acceleration is partially addressed by `tool-capture`'s `captureParallel`. Since the tooling home has itself moved into `@flighthq/tool-capture`, these items now straddle two cells.
3. **No `explain*` for the silent sentinels.** `compareCaptureFingerprints` collapses three distinct causes (unparseable a, unparseable b, grid mismatch) into one Infinity; `parseCaptureBaseline` collapses malformed-JSON vs non-object into null. The diagnostics rule gives every silent sentinel a shakeable `explain*` query returning plain data — none exists.
4. **Per-column tolerance has no home in the record shape.** The Approved per-test tolerance override will need a place to live; `CaptureColumnBaseline` is `{ fingerprint?, sha256? }` only. (A format decision, not a bug.)
5. **Rust parity crate** (`flighthq-capture`) not started — the blessed sequence's next step.

## Charter contradictions

None. The build matches the 2026-07-09 first-build Decision precisely: pure functions, no Node/DOM, surface keeps pixel math, no re-exports, tolerances as decided, format byte-compatible with the tooling.

## Contract & docs fit

- Full unabbreviated names, sentinels not throws, `Readonly<>` params, single root export, `sideEffects: false`, types header-first, every export tested. Clean.
- **Candidate docs revisions:** (a) the charter banner still says "Today the capability lives in the tooling layer (`scripts/capture-core.ts`, …)" — those scripts have since been absorbed into `@flighthq/tool-capture`, so the banner and the assessment preamble reference files that no longer exist; (b) the 2026-07-03 Approved items' stated execution home ("`scripts/capture-core.ts`") is likewise stale — they now execute against `tool-capture` source; (c) capture's Open direction 6 is marked resolved by the 2026-07-09 decision and could be annotated as such.

## Candidate open directions

1. **Who owns the Approved tooling items now?** The four 2026-07-03 items were frozen against a scripts home that has become `@flighthq/tool-capture`. Re-home them explicitly (capture's ledger vs tool-capture's assessment) so the next dispatch targets the right cell.
2. **Baseline-record extension policy** — may `CaptureColumnBaseline` grow a `tolerance` (or per-column policy) field, and does the committed format version itself need a marker, before the Rust crate freezes the shape?
3. **Adoption trigger** — the blessed sequence says tools adopt after the Rust crate; given `baselineStore.ts` already duplicates the format byte-for-byte, is an earlier TS-side adoption (tool-capture consuming capture) worth pulling forward? (tool-capture's own Open direction 0 asks the same from the other side.)
