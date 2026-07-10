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
- **Depends on `@flighthq/capture` (compare/tier policy) + `@playwright/test` + Node (`fs`).** It executes; it does not define the comparison policy (that's `@flighthq/capture`) or store baselines (that's `flight-reference` / the `tools/baselines` hash store it reads).
- **Execution + artifacts, not the project harness.** It exposes the capture primitive; the repo's specific `capture:*` script glue, vite gallery, and config stay in `scripts/`/`tools/` composing over it. It owns no scene fixtures (a future `tool-fixtures`) and no image diffing beyond delegating to `@flighthq/capture`.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Consolidation, not a rewrite.** The machinery already exists, scattered across `scripts/capture-core.ts` (~823 lines: Playwright driving, renderer routing, status/format), `tools/harness/verify.ts` (~231: the present-frame sync), and `scripts/baseline-store.ts`. This package **absorbs those** into one cohesive module with a clean programmatic + CLI entry, preserving behavior — the existing `capture:*` scripts must keep passing, now importing `@flighthq/tool-capture` instead of the loose files. `scripts/compare-render.ts` stays harness-side (it already consumes `@flighthq/capture`) or moves as fits.
- **[2026-07-10] Deterministic present-frame sync is the load-bearing contract.** The `waitForPresentedFrame` (2 real rAFs via the stashed real `requestAnimationFrame`) + `gl.finish()` before WebGL readback — the fix that ended the color-transform flake — lives here once, reused by every capture. A capture never screenshots frame 0 or a mid-present buffer.
- **[2026-07-10] Agent-facing contract.** The `visual-capture` skill drives this package; the artifacts are the stable trio `screenshot.png` (read directly), `logs.jsonl` (structured), `status.json` (`{ rendered, blank, changed, error }`). Baselines are sha256 hash text (git-diffable), reconciled with the spun-out `flight-reference` for full-image references.

## Open directions

1. **`flight-reference` integration.** Read/write full-image baselines from the spun-out reference repo (beyond the in-repo hash store), so visual review has real PNGs.
2. **Sibling `tool-*` cells.** `tool-baseline` (the sha256/reference store as its own primitive), `tool-fixtures` (scene/test fixtures), `tool-diff` (image/fingerprint diff over `@flighthq/capture`) — extracted as the harness needs them.
3. **CI verdict streaming.** Structured pass/fail + artifact upload for CI, and a remote-inspector sink.
