---
package: '@flighthq/tool-capture'
status: solid
score: 73
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# tool-capture — Review

_No `status.md` exists in this cell yet (the 2026-07-10 build is recorded in the charter's Decisions instead); evidence is the live source._

**Verdict:** solid — 82/100. Capture and fingerprint validation now share one package-owned lifecycle: deterministic browser prep, manifest/server discovery, parallel scheduling, baseline I/O and policy, reporting, and verdicts. Flight invokes the `capture` and `validate` commands directly; other packages can use the same JSON manifest or the `runCaptureSuite` / `runCaptureValidation` APIs. Remaining gaps are the deferred naming pass, a status.json shape that diverges from the charter's stated contract, and thin environment-bound tests.

## Present capabilities

Nine modules under `packages/tool-capture/src/` (judged as a `tool-*` package: Node/Playwright allowed, `crate: null`, excluded from the sdk barrel):

- **Deterministic browser prep** (`captureBrowser.ts`): lazy `import('@playwright/test')` (no import-time Playwright cost, honoring `sideEffects: false`), SwiftShader-pinned WebGPU flags, fixed 800×600 viewport, and the init script that sets `__flightCapture`/`__flightCaptureVerify`, seeds `Math.random` with inline mulberry32 (deliberate, documented duplicate of `@flighthq/math`'s algorithm), and installs the `--frames=N` halt: rAF interception with `__captureFramesReached`, the stashed `__ftRealRequestAnimationFrame` for the in-page verifier, and forced `preserveDrawingBuffer` so the halted GL frame survives the screenshot.
- **The core capture pass** (`captureEntry.ts`): per-(entry, renderer) page drive — flight-log/console-error/pageerror/requestfailed drains into `logs.jsonl`, two-rAF or frames-halt sync, per-renderer screenshot strategy (webgpu via `__ftRenderImage` GPU readback, dom via `body > div`, canvas/webgl via `canvas`, full-page fallback), sha256 baseline compare or `updateBaseline` write, atomic tmp→rename artifact writes with `status.json` last, `BACKEND_UNAVAILABLE` skip-not-fail policy, and interrupt-aware teardown. `captureParallel` fans entries × renderers over N pages via a shared synchronous job queue. `getCaptureOutputPaths` defines the on-disk layout in one place.
- **Programmatic single-target entry** (`captureRenderTarget.ts`): the charter's north-star call shape — composes `captureEntry` over one renderer and returns `{ screenshotPath, logsPath, statusPath, status, result }`.
- **Baseline hash store** (`baselineStore.ts`): per-test JSON at `<subject>/baselines/<name>.json`, read-merge-write preserving other fields/columns, prettier-compatible sorted serialization.
- **Discovery + vocabulary** (`captureEntries.ts`, `functionalScenes.ts`): `RENDERERS`, `Tool`, `discoverEntries`, the filename-encoded functional-scene manifest (`<name>.ts` vs `<name>.<backend>.ts`) shared with the functional Vite harness, `rendererMatchesFilter`, `routeSegment`.
- **Server lifecycle** (`captureServer.ts`): `resolveServer` (Vite dev, with predev + startup scan + 60s timeout) and `resolveStaticServer` (auto-building lightweight static server with MIME table and path-traversal guard).
- **Interrupt + terminal formatting** (`captureInterrupt.ts`, `captureFormat.ts`): `installAbortHandler`/`isBrowserClosedError`; the shared detail/status/summary line formatters keeping capture and compare-render output aligned.

## Gaps

1. **`@flighthq/capture` adoption is complete** — validation uses its comparison tolerances/evaluators and `baselineStore.ts` delegates parsing, formatting, and field access to its canonical baseline operations. The former byte-format drift risk is closed.
2. **`status.json` shape diverges from the charter's stated agent contract.** The charter Decision says the trio's status is `{ rendered, blank, changed, error }`; actual `CaptureStatus` is `{ state: 'ready'|'error', capturedAt, error, hash, baselineHash, changed }` — no `rendered`/`blank` fields (blank detection lives in the in-page functional verifier and surfaces only as an error log). Either the code grows the verdict fields or the charter/skill text should describe the real shape.
3. **Naming pass pending** — `Entry`, `Tool`, `Server`, `launchBrowser`, `formatDetailLine`, `baselinePath` are generic exports from a package root; the SDK's globally-self-identifying rule is relaxed for `tool-*` but the Decision itself notes the fully-qualified pass as a separate step.
4. **Env-bound modules have existence-only tests** — `captureBrowser`, `captureRenderTarget`, `captureServer`, `captureEntry`/`captureParallel` assert only that the function exists (each documents why); the pure helpers (format, store, discovery, interrupt, entries) are tested for real. No harness-level integration test lives in the package itself (the `capture:*` scripts are the de-facto gate).
5. **The undelivered capture-determinism items now live here** — clock pinning in `launchBrowser`'s init script and raw-RGBA hashing in `captureEntry` are 2026-07-03 items in **capture's** Approved ledger whose execution home is this package's source.
6. **Charter-scoped later work** — flight-reference full-image baselines (OD 1), sibling `tool-*` cells (OD 2), CI verdict streaming (OD 3).

## Charter contradictions

- The charter allowed `scripts/compare-render.ts` to stay harness-side or move; it now lives in the package as `captureValidation.ts` and consumes `@flighthq/capture` directly.
- The status.json shape mismatch (gap 2) sits between Decision text and code; flagged rather than judged.

Otherwise the build matches the Decisions closely — including the recorded split of the present-frame sync (Node driving here, in-page verifier staying in `tools/harness/` via the unchanged `window` contract).

## Contract & docs fit

- Manifest is correct for a `tool-*` cell: `crate: null`, Playwright/picocolors deps declared, lazy Playwright import keeps `sideEffects: false` honest, single root export, not in the sdk barrel. Every export has a `describe`.
- **Candidate docs revisions:** (a) the compare-render claim above; (b) the cell has no `status.md` — the scaffold contract expects one, and the 2026-07-10 build/deviation story currently lives only in charter Decisions; (c) the Package Map's tool-capture line says it "consumes `@flighthq/capture` for compare/tier policy" — aspirational, not current.

## Candidate open directions

1. **status.json verdict fields** — grow `CaptureStatus` toward the charter's `{ rendered, blank, … }` (moving blank detection Node-side or surfacing the verifier's verdict), or re-charter the contract to the shipped shape?
2. **Where does the integration gate live?** The package's real behavior is only exercised by repo scripts; should a minimal in-package Playwright smoke (behind an env flag) exist so other repos consuming the package get a self-test?
3. **Export naming policy for `tool-*`** — decide how far the fully-qualified-name rule applies to tool packages before the deferred naming pass runs (e.g. `CaptureEntry`/`CaptureTool` vs today's `Entry`/`Tool`).
