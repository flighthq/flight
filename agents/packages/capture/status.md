---
package: '@flighthq/capture'
updated: 2026-08-10
by: builder2
---

# capture — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

**Restored `scene-*` fingerprints are UNVERIFIED against current output.** `85280ab17` renamed four
baselines back from `scene3d-*` (swept there by the package rename `c0eeab24e`), restoring seven `✓`
marks: `scene-morph`, `scene-skin-morph-compose`, `scene-skinning`, `scene-transparent`. Those
fingerprints were captured *before* the rename and have never been re-verified against what the scenes
render today. The support matrix is internally consistent — realization plus committed fingerprint — but
that is a weaker claim than agreement, and `test:functional:regression` is only valid where its baselines
were captured, so it cannot settle this in an arbitrary sandbox. Whoever runs regression in the capture
environment should check these four first if something moves.

Re-checked against `packages/capture/src/` and its one consumer `packages/tool-capture/src/` on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **No `explain*` for either silent sentinel.** `compareCaptureFingerprints` collapses three distinct
  causes into one `Number.POSITIVE_INFINITY` — `a` unparseable, `b` unparseable, mismatched grid
  sizes (`captureComparison.ts:21-25`) — and `parseCaptureBaseline` returns one `null` for both
  malformed JSON and valid non-object JSON (`captureBaseline.ts:44`). The diagnostics rule wants a
  shakeable query per sentinel; every `explainCapture*` export in the tree is tool-side
  (`tool-capture/src/captureValidation.ts:210`, `:387`), none is here.
- **Three 2026-07-03 Approved items remain undelivered**, and their execution home moved to
  `tool-capture` when the tooling adopted this package — so who owns them is a ledger question for
  the user (assessment › Backlog):
  - _Per-test fingerprint tolerance._ The regression tolerance is a single run-wide option
    (`tool-capture/src/captureValidation.ts:63`, `:817`). Per-target overrides exist only for
    **parity** groups (`captureManifest.ts:19`) and for the **benchmark** tier
    (`captureManifest.ts:29`), which is a performance budget, not a fingerprint tolerance.
  - _Hash decoded RGBA instead of PNG bytes._ `captureEntry.ts:492`, `:1061`, and `:1092` all sha256
    the encoded `screenshotBuffer`, so PNG-encoder drift is still a live failure mode.
  - _Pin the clock._ `launchBrowser`'s init script seeds `Math.random`
    (`tool-capture/src/captureBrowser.ts:83`) but stubs neither `performance.now` nor `Date`, so
    time-parameterized scenes are still deterministic only at frame 1.
- **The baseline record has no per-column tolerance field.** `CaptureColumnBaseline`
  (`packages/types/src/CaptureColumnBaseline.ts:8`) carries `fingerprint` / `sourceHash` / `sha256`
  only. This is a format decision that should precede a Rust twin freezing the shape, not a defect.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two carried claims checked out **false**
  and were deleted: the 2026-07-09 "deferred tool adoption" (`scripts/compare-render.ts`,
  `scripts/baseline-store.ts`, `tools/harness/verify.ts` still owning duplicated logic) — all three
  files are gone and `tool-capture/src/baselineStore.ts` + `captureValidation.ts` import this package
  directly; and the recommended format-pinning tests, which landed at `captureBaseline.test.ts:27`,
  `:47`, `:53`, `:76`. The three 2026-07-03 Approved items above are still genuinely undelivered.
- **2026-07-21** — `@flighthq/tool-capture` adopted the comparison tolerances/evaluators and baseline
  record operations; the loose `scripts/compare-render.ts` implementation was removed.
- **2026-07-09** — First build: the pure policy/format layer (no Playwright, no `node:fs`, no DOM),
  depending only on `@flighthq/bitmap` for fingerprint math and `@flighthq/types` for headers.
- **2026-07-03** — Chartered from the render-verification direction session as the SDK-side home for
  deterministic render capture and verification, with the capture tools as future importers.
