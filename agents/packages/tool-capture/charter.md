---
package: '@flighthq/tool-capture'
crate: null
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tool-capture — Charter

## What it is

`@flighthq/tool-capture` is the **capture-execution harness** — the first member of the `tool-*` suite (the dev/CI sibling of `host-*`). It drives a Flight page (an example, a functional test, or the landing site) in a headless browser, **synchronizes to one clean presented frame**, and extracts a deterministic `screenshot.png` + `logs.jsonl` + `status.json`. It is the machinery a working agent, the `capture:*` npm scripts, and other repos (`flight-reference`, `flight-rs`) all call to get clean screenshots and logs — one hardened path instead of copied harness scripts.

It is **not** an SDK library: it depends on Playwright/Node I/O, is never in a browser bundle, and is excluded from the `@flighthq/sdk` barrel (per `tool-*` policy). It is the *execution* layer; the pure *policy/format* layer is `@flighthq/capture`, which this consumes.

## North star

One versioned, reusable capture API — `captureRenderTarget(target, name, renderer, options) → { screenshotPath, logsPath, status }` — that launches the target URL, waits for a genuinely presented frame (the `waitForPresentedFrame` + `gl.finish()`/rAF-boundary sync, hardened once here), captures the screenshot, drains structured logs to `logs.jsonl`, and emits a `status.json` verdict (rendered / blank / errored, plus the baseline hash compare via `@flighthq/capture`). Watch mode, baseline write, and the multi-renderer/multi-tool sweep compose over that core. DRY across repos: the same package, not copy-pasted scripts.

## Boundaries

- **A `tool-*` package** (`crate: null`, TS-only): not tree-shakable, `sideEffects: false` but Playwright imported lazily (no import side effect), not in the sdk barrel, may declare Node/Playwright deps. Consumed by a harness, never shipped to a browser.
- **Depends on `@playwright/test` + `picocolors` + Node (`fs`) today; `@flighthq/capture` is a chartered-but-not-yet-wired seam** (see the [2026-07-10] consumption decision below). It executes; the comparison *policy* belongs in `@flighthq/capture` and baselines in `flight-reference` / the `tools/baselines` hash store it reads — but the current lift kept the self-contained sha256/baseline-JSON compare in place rather than redesign it onto capture's record shape.
- **Execution + artifacts, not the project harness.** It exposes the capture primitive; the repo's specific `capture:*` script glue, vite gallery, and config stay in `scripts/`/`tools/` composing over it. It owns no scene fixtures (a future `tool-fixtures`) and no image diffing beyond delegating to `@flighthq/capture`.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Consolidation, not a rewrite.** The machinery already exists, scattered across `scripts/capture-core.ts` (~823 lines: Playwright driving, renderer routing, status/format), `tools/harness/verify.ts` (~231: the present-frame sync), and `scripts/baseline-store.ts`. This package **absorbs those** into one cohesive module with a clean programmatic + CLI entry, preserving behavior — the existing `capture:*` scripts must keep passing, now importing `@flighthq/tool-capture` instead of the loose files. `scripts/compare-render.ts` stays harness-side (it already consumes `@flighthq/capture`) or moves as fits.
- **[2026-07-10] Deterministic present-frame sync is the load-bearing contract.** The `waitForPresentedFrame` (2 real rAFs via the stashed real `requestAnimationFrame`) + `gl.finish()` before WebGL readback — the fix that ended the color-transform flake — lives here once, reused by every capture. A capture never screenshots frame 0 or a mid-present buffer.
- **[2026-07-10] Agent-facing contract.** The `visual-capture` skill drives this package; the artifacts are the stable trio `screenshot.png` (read directly), `logs.jsonl` (structured), `status.json` (`{ rendered, blank, changed, error }`). Baselines are sha256 hash text (git-diffable), reconciled with the spun-out `flight-reference` for full-image references.
- **[2026-07-10] Built as a behavior-preserving lift; two scoped deviations from the initial framing (recorded, blessed).** (1) **The Node-side capture machinery moved; `tools/harness/verify.ts` did not.** That file is *in-page browser code* that imports `@flighthq/sdk` (forbidden in any package) and is wired to the functional harness via the `@ft/verify` alias, `target.ts`, the four backend files, and 100+ scenes. It stays verbatim in `tools/harness/`, coordinating with the moved capture code through the **unchanged `window` contract** (`__ftRealRequestAnimationFrame`, `__ftRenderImage`, `__captureFramesReached`). The load-bearing sync is therefore split by substrate — Node driving in the package, in-page verifier in the harness — not centralized into one file; an end-to-end run reproduced a committed baseline hash byte-for-byte, confirming the contract is intact. (2) **`@flighthq/capture` was NOT taken as a dependency.** The existing sha256 + per-column baseline-JSON compare is self-contained; routing it through capture's record shape is a redesign, not a lift, and a dead dep would violate the deps-honest rule. Wiring the compare/tier policy onto `@flighthq/capture` is promoted to an Open direction. Existing export names were preserved (not yet fully-qualified) — a separate naming pass, since this is a dev/CI `tool-*` surface, not the SDK barrel.

## Open directions

0. **Consume `@flighthq/capture` for compare/tier policy.** Replace the self-contained sha256/baseline-JSON comparison with `@flighthq/capture`'s `compareCaptureFingerprints`/`evaluateCaptureRegression` + the baseline-store record shape, making capture the single source of comparison truth — the redesign the behavior-preserving lift deferred.

1. **`flight-reference` integration.** Read/write full-image baselines from the spun-out reference repo (beyond the in-repo hash store), so visual review has real PNGs.
2. **Sibling `tool-*` cells.** `tool-baseline` (the sha256/reference store as its own primitive), `tool-fixtures` (scene/test fixtures), `tool-diff` (image/fingerprint diff over `@flighthq/capture`) — extracted as the harness needs them.
3. **CI verdict streaming.** Structured pass/fail + artifact upload for CI, and a remote-inspector sink.
