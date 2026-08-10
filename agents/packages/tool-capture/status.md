---
package: '@flighthq/tool-capture'
updated: 2026-08-08
by: principal
---

# tool-capture — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/tool-capture/src/` on 2026-08-08. This is the dev/CI tooling tier: it
sits outside the `@flighthq/sdk` barrel and is not tree-shakable by design (`scripts/sdk-policy.ts`),
and its inline exported types are a stated exemption from the types-home rule — neither is a gap.

- **WebGPU is exempt from the presented-frame wait.** `functionalVerify.ts:207-209` skips
  `waitForPresentedFrame` for `webgpu` only; every other backend gets a budgeted wait that fails by
  name on stall (`:318-334`). The reasoning is sound (the wgpu path copies into a retained capture
  buffer in the same frame, so waiting buys nothing and adds a dependency on a canvas the browser
  never presents), but the consequence stands: a hung WebGPU capture has no equivalent
  named-await failure, so it surfaces as the outer runner's generic timeout.
- **Regression baseline freshness is classified but never gates.** `classifyCaptureBaselineFreshness`
  runs only inside the already-failing branch (`captureValidation.ts:661`), where it appends a
  `sourceHashStatus` to the message (`:673`). A baseline stale against a changed scene therefore
  still passes if the fingerprint happens to land inside tolerance.
- **Regression tolerance is run-wide.** `regressionTolerance` is one resolved option
  (`captureValidation.ts:63`, `:817`); only parity **groups** carry a per-group override
  (`captureManifest.ts:19`). The `regressionTolerance` in `captureManifest.ts:29` is the benchmark
  tier's performance budget, not a fingerprint tolerance. This is `capture`'s outstanding
  2026-07-03 Approved item, now homed here.
- **The capture clock is not pinned.** `launchBrowser`'s init script fixes the viewport and seeds
  `Math.random` (`captureBrowser.ts:57`, `:83`) but stubs neither `performance.now` nor `Date`, so a
  time-parameterized scene is deterministic only at frame 1 and stays out of the gated set.
- **Screenshot baselines hash PNG bytes, not decoded pixels.** `captureEntry.ts:492`, `:1061`, and
  `:1092` sha256 the encoded buffer, leaving PNG-encoder drift as a failure mode the fingerprint tier
  does not have. Also `capture`'s outstanding Approved item.
- **No sibling `tool-*` cells.** `tool-capture` is still the whole tooling tier; `tool-baseline`,
  `tool-fixtures`, and `tool-diff` (charter Open direction 2) have no package. `baselineStore.ts`
  remains the store, in-package.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-10** — Capture resource failures now retain their URL across HTTP error responses and
  transport failures in the capture, observe, and validation paths (`captureResourceFailure.ts`). The
  Chromium browser contract deliberately exercises 404, 503, and dropped-connection resources and
  asserts that every resulting resource message names its URL.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract; both carried "watch for" items
  re-verified against source and kept (WebGPU frame-wait exemption, advisory-only freshness). Charter
  Open direction 0 checked out **landed** and is not listed: `baselineStore.ts` and
  `captureValidation.ts` import `@flighthq/capture` directly for the tolerances, comparison, and
  baseline record shape, so the self-contained duplicate is gone. `referenceCapture.ts` covers
  direction 1's driver side (flight-reference dev server + route enumeration), though PNG baselines
  still are not read or written from that repo.
- **2026-08-05** — The blank-frame class of bug closed at every layer: blank frames hard-rejected at
  the baseline write path, uniform fingerprints refused as baselines, gated runs that compared
  nothing failing rather than passing silently, registry misses failing the capture, and a WebGL
  capture with no render image failing rather than passing as black — with measured pixel coverage,
  not verifier-publish, as the source of truth for "blank". The `observe <url>` bin landed alongside
  it for zero-integration capture of any canvas page, and a stalled verifier now names the await it
  is sitting in with a budget resolved from a flag or the environment.
