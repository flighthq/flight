---
package: '@flighthq/capture'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# capture — Review

**Verdict:** solid — 78/100. The pure policy/format layer is complete and well-tested. Since the last review (2026-07-13), the package gained provenance recording for baseline values — per-value (not per-column) provenance with copy semantics, proper public/contract lane separation, and 30 passing tests. The score moves up from 72: provenance closed a real observability gap and the `sha256` doc comment in types was corrected. Remaining gaps are the missing `explain*` diagnostics for both silent sentinels and three undelivered Approved items whose execution home has shifted to `tool-capture`.

## Present capabilities

Two source files under `packages/capture/src/`, all types header-first in `@flighthq/types`:

**Baseline record ops** (`captureBaseline.ts`, 7 exported functions):
- `createCaptureBaseline()` — allocates an empty `CaptureBaseline` (`Record<string, CaptureColumnBaseline>`).
- `getCaptureBaselineField(baseline, column, field)` — returns the string value or `null` sentinel for absent column/field.
- `setCaptureBaselineField(baseline, column, field, value)` — creates the column entry on first write, merges later fields.
- `formatCaptureBaseline(baseline)` — serializes to committed text form: sorted column keys, canonical field order (`fingerprint`, deprecated `sourceHash`, `sha256`, then provenance blocks last), 2-space indent, trailing newline. Byte-for-byte matches `tool-capture`'s on-disk format, so re-baselining one column produces a minimal diff.
- `parseCaptureBaseline(text)` — returns `null` for malformed JSON or non-object top-level. No crash path.
- `getCaptureBaselineProvenance(baseline, column, field)` — per-value provenance (not per-column); `null` when the value predates provenance recording, reading as UNKNOWN, never as agreement. Contract-only.
- `setCaptureBaselineProvenance(baseline, column, field, provenance)` — copies the provenance record (no aliasing). Contract-only.

**Comparison policy** (`captureComparison.ts`, 2 constants + 3 exported functions):
- `CAPTURE_REGRESSION_TOLERANCE` (5) / `CAPTURE_PARITY_TOLERANCE` (15) with rationale comments grounded in measured backend agreement.
- `compareCaptureFingerprints(a, b)` — parses both strings via `@flighthq/bitmap`'s `parseBitmapFingerprint` and returns `Number.POSITIVE_INFINITY` when either is unparseable or grid sizes differ. Infinity fails any finite tolerance.
- `evaluateCaptureRegression(fingerprint, baselineFingerprint, tolerance?)` — produces `CaptureCheckResult { pass, difference, tolerance }`. Doc comment explicitly states what a pass does not establish (high-frequency content can change completely while cell averages stay put).
- `evaluateCaptureParity(a, b, tolerance?)` — same shape, defaults to parity tolerance. Environment-independent.

**Types** (in `@flighthq/types`):
- `CaptureBaseline`, `CaptureColumnBaseline`, `CaptureBaselineField`, `CaptureBaselineProvenance`, `CaptureBaselineProvenanceField`, `CaptureCheckResult`, `CaptureCheckTier`.
- `CaptureColumnBaseline` carries `fingerprint?`, deprecated `sourceHash?`, `sha256?`, `fingerprintProvenance?`, `sha256Provenance?` — one provenance per independently-written value, not per column.
- `CaptureBaselineProvenance` records `computationId`, `frames`, `sourceHash`, `targetKind`, `verifyPublished`, `warmupFrames`.

**Package shape:**
- Dependencies: exactly `@flighthq/bitmap` + `@flighthq/types`. No Node, no Playwright, no DOM — importable in isolation, Rust/wasm-conformable.
- `sideEffects: false`. Two export lanes: `.` (public) and `./contract`. Provenance accessors are contract-only (consumed by `tool-capture`).
- 30 tests across 2 files, all passing. Tests cover round-trip serialization, corrupt input, grid mismatch, boundary tolerance, provenance independence, copy-not-alias semantics, and legacy-column-as-UNKNOWN.
- Consumed by `@flighthq/tool-capture` (`captureValidation.ts`, `baselineStore.ts`) and re-exported through `@flighthq/sdk`.

## Gaps

1. **No `explain*` for the two silent sentinels.** `compareCaptureFingerprints` collapses three distinct causes into one `Number.POSITIVE_INFINITY` — unparseable `a`, unparseable `b`, grid-size mismatch — and `parseCaptureBaseline` collapses malformed JSON vs non-object into one `null`. The diagnostics convention gives every silent sentinel a shakeable `explain*` query returning plain data. Neither exists. Status.md records this as open.

2. **No format-pinning test for provenance serialization.** `formatCaptureBaseline` tests cover the pre-provenance shape (sorted columns, canonical field order, trailing newline) but no test asserts the serialized form of a baseline with provenance blocks. Since provenance is emitted last by design (so adding it to a column is an appended block, not a rewrite), a test pinning that ordering would protect the Rust crate conformance.

3. **Three 2026-07-03 Approved items remain undelivered.** Their execution home has moved to `tool-capture`:
   - _Per-test fingerprint tolerance_ — only run-wide `regressionTolerance` exists; per-target overrides are only for parity groups and benchmarks.
   - _Hash raw decoded RGBA instead of PNG bytes_ — `tool-capture/captureEntry.ts` still hashes the encoded `screenshotBuffer`. The `CaptureColumnBaseline.sha256` doc comment was corrected (now says "ENCODED PNG BYTES"), so the types no longer claim undelivered behavior.
   - _Pin the clock_ — `captureBrowser.ts` seeds `Math.random` but does not stub `performance.now` or `Date`.

4. **No per-column tolerance field in `CaptureColumnBaseline`.** The Approved per-test tolerance override will need a place in the record shape. A format decision that should precede the Rust crate freezing the shape.

5. **Rust parity crate** (`flighthq-capture`) not started — the blessed sequence's next step.

## Charter contradictions

None. The build matches the 2026-07-09 first-build Decision precisely: pure functions, no Node/DOM dependency, `@flighthq/bitmap` keeps pixel math, no re-exports of surface functions, tolerances as decided, format byte-compatible with the tooling. The provenance model is consistent with the charter's boundary that capture owns the baseline format while bitmap owns the pixel math.

## Contract & docs fit

**Package compliance** — full unabbreviated names (`compareCaptureFingerprints`, `evaluateCaptureRegression`, `getCaptureBaselineProvenance`), sentinels not throws (`null`, `Infinity`), `Readonly<>` on baseline params, `sideEffects: false`, types header-first in `@flighthq/types`, two export lanes, every export colocated-tested. Clean.

**Candidate docs revisions:**

1. The charter banner still references `scripts/capture-core.ts`, `scripts/compare-render.ts`, `scripts/baseline-store.ts` — all three are gone, absorbed into `@flighthq/tool-capture`. The banner reads as if the capability still lives in the tooling scripts.
2. The charter's Open direction 6 ("The seam with `@flighthq/bitmap`") was resolved by the 2026-07-09 Decision but is not annotated as resolved in the Open directions list.
3. The assessment's Backlog item "Tool adoption" says `scripts/compare-render.ts` still owns duplicated logic — this is stale; `tool-capture` already imports this package directly (verified: `baselineStore.ts` and `captureValidation.ts` both import from `@flighthq/capture/contract`).
4. The status.md Open section claims `CaptureColumnBaseline.sha256` "documents itself as the hash of the raw decoded RGBA pixels" — this was corrected in commit `8d5718ced`; the comment now correctly says "ENCODED PNG BYTES." The status claim is stale.

## Candidate open directions

1. **Who owns the three undelivered Approved items?** They were frozen against `capture` but execute in `tool-capture`. Re-home them explicitly so dispatching targets the right cell.
2. **Baseline-record extension policy** — may `CaptureColumnBaseline` grow a `tolerance` or per-column policy field, and does the format need a version marker, before the Rust crate freezes the shape?
3. **Provenance comparison gate staging** — `CaptureBaselineProvenance` is recorded but not yet enforced (refusing to compare across differing provenance is held until most records carry it, per the type's own doc comment). When is "most records"?
