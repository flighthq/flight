---
package: '@flighthq/tool-capture'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - assessment.md
  - source
---

# tool-capture — Review

**Verdict:** solid. The package has roughly quadrupled its surface since the 2026-07-13 review (9 modules to 37 implementation files), landing the `@flighthq/capture` adoption that was then the top gap, a benchmark tier, batch workflow orchestration, DOM readback, coverage manifests, fixture confound analysis, build identity stamping, host provenance, and CLI entry filtering. The core capture-verification-validation pipeline is coherent and well-layered. Remaining gaps are structural rather than functional: the status.json shape still diverges from the charter's stated agent contract, the clock is not pinned (`Date`/`performance.now` are live), observe mode cannot diagnose the verifier-never-registered case it exists to explain, and environment-bound modules are still existence-only tested. Score up from 73 because the former top gap is closed and the new features are real, not speculative.

## Present capabilities

Thirty-seven implementation source files under `packages/tool-capture/src/`, of which 21 are re-exported through `contract.ts` and 15 are package-internal helpers consumed by the exported modules. A `browser` condition in the package exports limits page-side imports to three modules (`capturePage`, `captureProtocol`, `functionalVerify`), keeping Rollup from pulling Node/Playwright into Vite bundles. Judged as a `tool-*` package: Node/Playwright allowed, `crate: null`, excluded from the SDK barrel, inline exported types are a stated exemption from the types-home rule.

### Deterministic browser preparation (`captureBrowser.ts`)
Lazy `import('@playwright/test')` (no import-time Playwright cost, honoring `sideEffects: false`). Fixed 800x600 viewport. Init script sets `__flightCapture` / `__flightCaptureVerify`, seeds `Math.random` with an inline mulberry32 PRNG (deliberate, documented duplicate of `@flighthq/math`'s algorithm), and installs the `--frames=N` rAF halt: rAF interception with `__captureFramesReached`, stashed `__ftRealRequestAnimationFrame` for the in-page verifier, and forced `preserveDrawingBuffer` on `getContext('webgl'/'webgl2')` so the halted GL frame survives screenshot. WebGPU adapter warm-up fires ahead of page load. Clock (`Date`, `performance.now`) is **not** pinned (status.md open item, confirmed in source).

### Core capture pass (`captureEntry.ts`, ~1435 lines)
Per-(entry, renderer) page drive. Structured log drain (`flight-log`, `console.error`, `pageerror`, `requestfailed`) into `logs.jsonl`. Two-rAF or frames-halt sync. Per-renderer screenshot strategy: WebGPU via `__ftRenderImage` GPU readback data URL, DOM via Playwright element screenshot through `captureDomReadback.ts`, canvas/WebGL via `canvas` locator, full-page fallback. Screenshot hash computed over decoded RGBA pixels (`captureScreenshotHash.ts`), not raw PNG bytes, making the hash encoding-invariant. Provenance (`captureBuildIdentity.ts` + `captureHostProvenance.ts`) built once per capture and shared across fingerprint and SHA-256 writes. Atomic tmp-then-rename artifact writes with `status.json` last. `BACKEND_UNAVAILABLE` skip-not-fail policy. Interrupt-aware teardown. Registry-miss detection (`captureRegistryMiss.ts`) upgrades a specific class of log warnings (missing `ShapeRasterizer` / `MaterialRenderer`) to verdict-level failures. `captureParallel` fans entries x renderers over N pages via a shared synchronous job queue; `captureWorkerCount.ts` resolves worker count with headroom and an expedient ceiling of 4.

### Page-side protocol and adapters (`capturePage.ts`, `captureProtocol.ts`, `functionalVerify.ts`)
Versioned capture protocol (`CAPTURE_PROTOCOL_VERSION = 1`). `CaptureVerification` type carries `protocolVersion`, `render`, `coverage`, `fingerprint`, `state`, `stage`, `error`, and optional `oracle`. Page-side integration via `installCaptureTarget` (the single call a raw consumer needs), `installCaptureElementTarget` (adapts existing DOM/canvas elements), `verifyCaptureTarget`, `failCaptureTargetVerification`, and `registerCaptureBenchmarkTarget`. `functionalVerify.ts` implements the verification handshake: `runRenderVerification` waits for a presented frame (budgeted share of the per-page timeout, not a fixed constant), reads back pixels, measures coverage against `DEFAULT_MIN_COVERAGE` (0.0008), computes a 16x16 bitmap fingerprint, invokes the optional scene oracle, and publishes the data URL. `publishFunctionalRenderSync` provides a synchronous GL readback path for animated apps that cannot use `preserveDrawingBuffer`. `registerWgpuFunctionalTarget` enables frame capture and MSAA guards for every WebGPU scene. Budget shares are expressed as fractions of a per-page ceiling injected by the runner, not as fixed milliseconds, so moving the ceiling moves all waits together.

### Validation (`captureValidation.ts`, ~1575 lines)
Parity (Tier 3) and regression (Tier 5) validation. Consumes `@flighthq/capture/contract` directly: `compareCaptureFingerprints`, `evaluateCaptureParity`, `evaluateCaptureRegression`, `CAPTURE_PARITY_TOLERANCE`, `CAPTURE_REGRESSION_TOLERANCE`. Key exports: `runCaptureValidation`, `CaptureValidationResult`, coverage types, explainers (`explainCaptureParityUncovered`, `explainCaptureVerificationStall`, `formatCaptureParityRanking`), coverage failure predicates (`isCaptureParityCoverageFailure`, `isCaptureRegressionCoverageFailure`). Includes DOM fingerprint capture, fixture background comparison, source hash freshness classification (reports stale baselines but does not gate on them, per charter decision [2026-08-04]), and coverage manifest diffing (`captureBaselineCoverageManifest.ts`) against a pinned identity set.

### Baseline store (`baselineStore.ts`, ~235 lines)
Per-test JSON at `<subject>/baselines/<name>.json`. Delegates to `@flighthq/capture/contract` for parsing, formatting, and field access (`createCaptureBaseline`, `formatCaptureBaseline`, `getCaptureBaselineField`, `parseCaptureBaseline`, `setCaptureBaselineField`). Includes provenance matching assertion and write-side evidence sanity checks: blank-frame rejection via `isRejectedCaptureBaselineHash` and uniform-fingerprint rejection via `isUniformCaptureFingerprint` (`captureBaselineSanity.ts`).

### Benchmark tier (`captureBenchmark.ts`)
Performance measurement with calibration, statistics (median, p95, MAD), reference ratios, and baseline regression detection. Wired through `captureWorkflow.ts`'s workflow orchestration. `registerCaptureBenchmarkTarget` on the page side exposes repeatable work with per-backend synchronize methods (GL `finish`, WebGPU `onSubmittedWorkDone`, DOM forced layout). Visual capture and benchmark passes get separate browsers (visual shares one, benchmark gets a clean serial launch).

### Batch and workflow orchestration (`captureWorkflow.ts`, `captureSuite.ts`, `captureBatchManifest.ts`)
`runCaptureWorkflow` composes capture + validation + benchmark into one call. `runCaptureBatch` runs multiple subjects. `runCaptureSuite` collects verified fingerprints and provenance as capture by-products. `captureBatchManifest.ts` handles multi-subject batch manifest parsing.

### CLI (`bin.ts`, `captureCliOptions.ts`)
Five commands: `observe`, `capture`, `validate`, `benchmark`, `batch`. CLI options with cross-command validation, boolean option parsing, and an audit for silent-drop prevention (a flag accepted by one command is not silently ignored by another). `captureEntryFilter.ts` separates substring (`--filter`) from exact (`--filter-exact`) matching to prevent a write operation from silently selecting more entries than named.

### Fixture and diagnostics helpers
- `captureFixtureBackground.ts` — matches declared clear colour from scene source.
- `functionalParityConfounds.ts` — compares per-backend fixture clear colours to separate fixture differences from renderer differences in parity distance.
- `captureContrast.ts` — fingerprint internal contrast measurement for diagnostic reporting.
- `captureFlightPreset.ts` — repository-owned validation presets (parity groups, parity skips).
- `captureReport.ts` — versioned JSON report writer (`CAPTURE_REPORT_VERSION = 1`), atomic tmp-then-rename.
- `captureResourceFailure.ts` — HTTP and transport failure tracking with URL retention, WebSocket noise filtering.
- `captureSourceHash.ts` — SHA-256 of scene source files for freshness classification.
- `captureTimeout.ts` — configurable per-wait budget (default 45s), module-level state.
- `captureFormat.ts` — `DetailTone`, terminal formatting for status/detail/summary lines.
- `captureInterrupt.ts` — SIGINT/SIGTERM abort handler, `isBrowserClosedError` detection.

### Test coverage
All 37 implementation files have a matching `.test.ts`. Three have additional `.e2e.test.ts` files (`captureEntry.e2e.test.ts`, `captureBenchmark.e2e.test.ts`, `captureEyes.e2e.test.ts`). Pure-logic modules (format, store, entries, interrupt, CLI options, baseline sanity, coverage manifest, entry filter, registry miss, fixture background, parity confounds, source hash, build identity, host provenance, contrast, timeout, worker count) have substantive tests with real assertions. Environment-bound modules (captureBrowser, captureEntry's `captureEntry`/`captureParallel`/`captureUrl`, captureRenderTarget, captureSuite, captureServer, captureWorkflow) still have existence-only tests, each documenting why (Playwright/browser dependency). The `bin.test.ts` is load-sensitive under the whole-repo sweep (exits with SIGTERM 143 instead of 1, passes when run scoped).

## Gaps

1. **status.json shape diverges from the charter's stated agent contract.** Charter Decision [2026-07-10] says the artifact trio's status is `{ rendered, blank, changed, error }`; the actual `CaptureStatus` type is `{ protocolVersion, state: 'ready'|'error', capturedAt, error, hash, baselineHash, changed, build, provenance, oracle, observe, expectedImageDescription }`. No `rendered`/`blank` fields exist; blank detection is purely page-side (the `functionalVerify` coverage check), surfacing only as an error string. The shipped shape is richer and more useful than the charter text, but the two should be reconciled in one direction.

2. **Capture clock is not pinned.** `launchBrowser`'s init script seeds `Math.random` and intercepts rAF/`getContext`, but `Date` and `performance.now` remain live. A time-parameterized scene (e.g. elapsed-time animation) is deterministic only at frame 1. Confirmed at `captureBrowser.ts` init script and noted in status.md.

3. **Observe mode diagnostic ordering.** The observe-mode diagnostics block (`captureEntry.ts`) sits downstream of the throw it exists to explain (the verifier-never-registered case), so it fires only when the failure did not happen. Status.md names this as the same shape as the decode-before-hash bug fixed 2026-08-10: a diagnostic placed after the failure path it describes.

4. **Verifier-failure throw conflates two causes.** `captureEntry.ts`'s "render verifier did not reach a terminal state" message covers both registered-and-stalled and never-registered, which are opposite remedies. `captureValidation.ts` already distinguishes them in its `explainCaptureVerificationStall`; `captureEntry` does not use that discrimination. Cost real investigation time (status.md log, `examples/scene3d/webgl` incident).

5. **Environment-bound test depth.** Modules requiring a live browser (captureBrowser, captureEntry, captureRenderTarget, captureSuite, captureServer, captureWorkflow) are existence-only tested in-package. The functional and example capture suites serve as the de-facto integration gate, but no in-package Playwright smoke test exists.

6. **Regression tolerance is run-wide.** `regressionTolerance` is one resolved option; only parity **groups** carry per-group overrides (`captureManifest.ts`). The `regressionTolerance` field in `captureManifest` is the benchmark tier's performance budget, not a fingerprint tolerance. A scene with known benign regression-tolerance needs cannot be tuned independently.

7. **Coverage measurement is an implication, not an auditable record.** `runRenderVerification` measures `coverage` and throws below `DEFAULT_MIN_COVERAGE`, which is what makes `state: 'ready'` carry a non-blank guarantee. But `status.json` keeps `state` and `hash`, never the coverage number itself, so 0.1% coverage and 90% are indistinguishable to downstream consumers. Status.md names this as a recurring shape: persist the measurement wherever a capture-side check produces one.

8. **Capture root accumulation.** A run writes the current suite's artifacts and deletes nothing, so `.artifacts/<subject>/` accumulates status and screenshots from scenes and columns that no longer exist. Any consumer reading found state instead of the declared manifest risks acting on residue. Status.md documents two instances and the fix shape (intersect with coverage manifest at every read).

9. **Naming pass still pending.** `Entry`, `Tool`, `Server`, `launchBrowser`, `formatDetailLine` are generic exports. The charter's own Decision notes the fully-qualified naming pass as deferred; the SDK's globally-self-identifying rule is relaxed for `tool-*` but the pass itself is unstarted.

10. **No sibling `tool-*` cells.** Charter Open direction 1 (`tool-baseline`, `tool-fixtures`, `tool-diff`) remain unextracted. `baselineStore.ts` is still the store, in-package.

## Charter contradictions

- **Compare-render has moved in.** The charter permitted `scripts/compare-render.ts` to stay harness-side or move. It now lives in the package as `captureValidation.ts` and consumes `@flighthq/capture` directly. This is a fulfilled option, not a contradiction.
- **`@flighthq/capture` adoption is complete.** Charter Open direction 0, which called for replacing the self-contained SHA-256/baseline-JSON comparison with `@flighthq/capture`'s APIs, has been executed. `baselineStore.ts` delegates to `createCaptureBaseline`/`parseCaptureBaseline`/etc., and `captureValidation.ts` uses `compareCaptureFingerprints`/`evaluateCaptureParity`/`evaluateCaptureRegression`. The charter's Open direction 0 text is now stale and should be removed or marked done.
- **status.json shape mismatch persists** (gap 1). The charter text describes `{ rendered, blank, changed, error }`; the code ships a broader, versioned `CaptureStatus`. Neither has been updated to match the other.
- **New dependencies not declared in charter boundaries.** `@flighthq/effects-wgpu`, `@flighthq/render-wgpu`, and `@flighthq/bitmap` are production dependencies in `package.json`, consumed by `functionalVerify.ts` for WebGPU frame capture, MSAA guard enabling, and bitmap operations. The charter's Boundaries section names only `@playwright/test`, `picocolors`, Node `fs`, and `@flighthq/capture`. The additional deps are architecturally sound (the page-side verifier genuinely needs bitmap operations and WebGPU frame readback), but the charter text is behind.

## Contract & docs fit

- Manifest shape is correct for a `tool-*` cell: `crate: null`, Playwright/picocolors deps declared, lazy Playwright import keeps `sideEffects: false` honest, `browser` condition in exports limits page-side surface, single root export plus `./contract` subpath, not in the SDK barrel.
- The `bin` field (`tool-capture -> dist/bin.js`) is declared and the CLI implements five commands with cross-command option validation.
- Every re-exported module has a colocated `.test.ts`.
- `status.md` is present and current (updated 2026-08-11), covering 10 open items with dated log entries. Its analysis of the capture-root accumulation pattern and the measurement-not-persisted pattern is thorough and actionable.
- **Charter Open direction 0 is stale** (implemented, should be struck or marked done).
- **Charter Boundaries section is behind** (three additional `@flighthq/*` deps not named).

## Candidate open directions

1. **Reconcile the status.json contract.** Either grow `CaptureStatus` to include the charter's `rendered`/`blank` fields (moving blank detection or its verdict Node-side), or update the charter Decision and skill text to describe the shipped shape. The shipped shape is richer; the charter text is the stale side.
2. **Pin the capture clock.** Stub `Date.now` and `performance.now` in the init script to make time-parameterized scenes deterministic beyond frame 1. The current seeded-random + rAF-halt determinism covers layout but not time.
3. **Persist the coverage measurement.** Emit the numeric coverage value in `status.json` so downstream consumers can distinguish near-blank from well-covered captures, rather than treating the non-blank guarantee as an opaque implication.
4. **Fix the observe-mode diagnostic ordering.** Move the diagnostics block upstream of the verifier-failure throw so it fires when the failure it exists to explain actually happens.
5. **Discriminate verifier-failure causes.** Use the existing `explainCaptureVerificationStall` message in `captureEntry`'s throw to distinguish registered-and-stalled from never-registered.
6. **Where does the integration gate live?** The package's browser-dependent behavior is exercised only by repo scripts. A minimal in-package Playwright smoke test (behind an env flag) would let other repos consuming the package get a self-test.
7. **Update charter Boundaries and Open directions** to reflect the current dependency set and the completed capture adoption.
