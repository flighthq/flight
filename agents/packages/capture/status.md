---
package: '@flighthq/capture'
updated: 2026-08-11
by: principal
---

# capture — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

**CI's screenshot-baseline legs exclude WebGL, and only the charter's pinning decision can restore it.**
`tests.yml` runs `capture:{functional,examples}:check` on dom/canvas/webgpu — the pinned rasterizers —
because a committed sha256 over decoded RGBA is only environment-independent where the rasterizer is.
Not a failure: the WebGL hashes reproduce on a developer clone, and no CI-runner run exists to compare
against. Settling charter Open direction 1 (pin WebGL to SwiftShader) is what would let that column in.

**Restored `scene-*` fingerprints are UNVERIFIED against current output.** `85280ab17` renamed four
baselines back from `scene3d-*` (swept there by the package rename `c0eeab24e`), restoring seven `✓`
marks: `scene-morph`, `scene-skin-morph-compose`, `scene-skinning`, `scene-transparent`. Those
fingerprints were captured *before* the rename and have never been re-verified against what the scenes
render today. The support matrix is internally consistent — realization plus committed fingerprint — but
that is a weaker claim than agreement, and `test:functional:regression` is only valid where its baselines
were captured, so it cannot settle this in an arbitrary sandbox. Whoever runs regression in the capture
environment should check these four first if something moves.

Re-checked against `packages/capture/src/` and its one consumer `packages/tool-capture/src/` on
2026-08-11. A citation here is a claim about this tree, not about a session. Citations name the
**symbol**, not a line — line numbers in this cell rotted within three days of being written, while
every claim they carried stayed true.

- **No `explain*` for either silent sentinel.** `compareCaptureFingerprints` (`captureComparison.ts`)
  collapses three distinct causes into one `Number.POSITIVE_INFINITY` — `a` unparseable, `b`
  unparseable, mismatched grid sizes — and `parseCaptureBaseline` (`captureBaseline.ts`) returns one
  `null` for both malformed JSON and valid non-object JSON. The diagnostics rule wants a shakeable
  query per sentinel; both `explainCapture*` exports in the tree are tool-side
  (`explainCaptureParityUncovered`, `explainCaptureVerificationStall` in
  `tool-capture/src/captureValidation.ts`), none is here.
- **Three 2026-07-03 Approved items remain undelivered**, and their execution home moved to
  `tool-capture` when the tooling adopted this package — so who owns them is a ledger question for
  the user (assessment › Backlog):
  - _Per-test fingerprint tolerance._ The regression tolerance is a single run-wide option
    (`CaptureValidationOptions.regressionTolerance`, defaulted once from
    `CAPTURE_REGRESSION_TOLERANCE`). Per-target overrides exist only for **parity** groups
    (`CaptureParityGroup.tolerance`) and for the **benchmark** tier
    (`CaptureManifestBenchmark.regressionTolerance`), which is a performance budget, not a
    fingerprint tolerance.
  - _Hash decoded RGBA instead of PNG bytes._ All three `createHash('sha256')` sites in
    `captureEntry.ts` hash the encoded `screenshotBuffer`, so PNG-encoder drift is still a live
    failure mode. **`CaptureColumnBaseline.sha256` already documents itself as the hash "of the raw
    decoded RGBA pixels"** — the header describes the undelivered behaviour as if it shipped, so
    that doc comment is wrong until this lands. Owned by `types`, not fixed from here.
  - _Pin the clock._ `launchBrowser`'s init script (`captureBrowser.ts`) seeds `Math.random` but
    stubs neither `performance.now` nor `Date`, so time-parameterized scenes are still deterministic
    only at frame 1.
- **The baseline record has no per-column tolerance field.** `CaptureColumnBaseline`
  (`packages/types/src/CaptureColumnBaseline.ts`) carries `fingerprint` / `sourceHash` / `sha256`
  only. This is a format decision that should precede a Rust twin freezing the shape, not a defect.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-11** — Citations converted from `file:line` to symbol names after a stale-citation report
  (builder2, routed by foreman). Re-resolved all 17 line citations by content: **no dead files and no
  false claims** — every claim survived. Eight line numbers had drifted, all of them in the consumer
  `tool-capture`, none in this package. Recorded the one substantive find the sweep surfaced: the
  `CaptureColumnBaseline.sha256` doc comment describes the undelivered decoded-RGBA hashing as
  current.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two carried claims checked out **false**
  and were deleted: the 2026-07-09 "deferred tool adoption" (`scripts/compare-render.ts`,
  `scripts/baseline-store.ts`, `tools/harness/verify.ts` still owning duplicated logic) — all three
  files are gone and `tool-capture/src/baselineStore.ts` + `captureValidation.ts` import this package
  directly; and the recommended format-pinning tests, which landed in `captureBaseline.test.ts`. The
  three 2026-07-03 Approved items above are still genuinely undelivered.
- **2026-07-21** — `@flighthq/tool-capture` adopted the comparison tolerances/evaluators and baseline
  record operations; the loose `scripts/compare-render.ts` implementation was removed.
- **2026-07-09** — First build: the pure policy/format layer (no Playwright, no `node:fs`, no DOM),
  depending only on `@flighthq/bitmap` for fingerprint math and `@flighthq/types` for headers.
- **2026-07-03** — Chartered from the render-verification direction session as the SDK-side home for
  deterministic render capture and verification, with the capture tools as future importers.
