---
package: '@flighthq/capture'
updated: 2026-07-09
---

# capture — Status Log

## 2026-07-21 — adopted by tool-capture

The deferred TypeScript tooling adoption is complete. `@flighthq/tool-capture` now consumes the comparison tolerances/evaluators and baseline record operations directly. Its manifest-driven `validate` CLI and `runCaptureValidation` API own Playwright fingerprint collection, self-stability rechecks, baseline-file I/O, parity/regression gates, reporting, and interruption. Flight's parity/regression npm scripts use that CLI; the loose `scripts/compare-render.ts` implementation was removed.

## 2026-07-09 — standalone policy/format layer shipped (first build)

Built the pure, importable-in-isolation first layer per the 2026-07-09 charter decision. No Playwright, no Node `fs`, no DOM — depends only on `@flighthq/surface` (fingerprint math) and `@flighthq/types` (header types).

Shipped:

- Types (in `@flighthq/types`): `CaptureBaseline` (= `Record<string, CaptureColumnBaseline>`), `CaptureColumnBaseline` (`{ fingerprint?, sha256? }`), `CaptureCheckTier` (`'regression' | 'parity' | 'smoke'`), `CaptureCheckResult` (`{ pass, difference, tolerance }`).
- Comparison policy (`packages/capture/src/captureComparison.ts`): constants `CAPTURE_REGRESSION_TOLERANCE` (5) / `CAPTURE_PARITY_TOLERANCE` (15); `compareCaptureFingerprints(a, b)` — parses both via surface's `parseSurfaceFingerprint`, returns `Number.POSITIVE_INFINITY` when either is unparseable **or the grid sizes differ** (so any downstream tolerance check fails), else `compareSurfaceFingerprints`; `evaluateCaptureRegression` and `evaluateCaptureParity` returning a `CaptureCheckResult`.
- Baseline record ops (`packages/capture/src/captureBaseline.ts`): `createCaptureBaseline`, `getCaptureBaselineField`, `setCaptureBaselineField`, `formatCaptureBaseline` (sorted keys, 2-space indent, trailing newline — byte-for-byte matching the tooling's `writeBaseline`), `parseCaptureBaseline` (`null` sentinel on malformed / non-object JSON).

Registered in `tsconfig.base.json`, `tsconfig.build.json`, and the `@flighthq/sdk` barrel (export + dep + tsconfig reference). Green: package tests (25), `packages:check`, `typecheck`, `lint`, `format`, `order:check`, `exports:check`, `api:check`.

**Deferred (blessed later step):** tool adoption. `scripts/compare-render.ts`, `scripts/baseline-store.ts`, and `tools/harness/verify.ts` still own their duplicated logic and were intentionally left untouched — migrating them to import this package follows the Rust parity crate per the 2026-07-03 sequence, and touches the currently-green render tooling.

## 2026-07-03 — chartered from the render-verification direction session

Package blessed as the SDK-side home for deterministic render capture and verification (fingerprints, baseline formats, comparison policy), with the Rust `flighthq-capture` crate as its parity twin and the capture tools as future importers. No source yet — the capability currently lives in `scripts/capture-core.ts` / `scripts/compare-render.ts` / `scripts/baseline-store.ts` and `@flighthq/surface`'s fingerprint functions. Four items approved for the current tooling home (see assessment.md › Approved): per-test tolerance overrides, raw-RGBA hashing, fingerprint-capture acceleration, and clock pinning in the harness.
