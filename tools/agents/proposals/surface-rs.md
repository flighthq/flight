---
id: surface-rs
title: '@flighthq/surface-rs'
type: depth
target: surface-rs
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/surface-rs.md
  - tools/agents/docs/reviews/depth/surface-rs.md
depends_on: []
updated: 2026-06-23
---

## Summary

authoritative — 92/100; a complete, faithful, conformance-tested wasm drop-in covering the entire bulk-pixel surface of `@flighthq/surface`, with boundary-crossing, aliasing, defaulting, and version semantics all handled correctly.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

Minimum viable — the 20% that closes 80% of the residual gap. These are pure conformance-completeness fixes against the existing override model; no new API surface, no boundary redesign.

- **Override `rotateSurface(dest, source, quarterTurns)`** — the mode-dispatching wrapper exported by `@flighthq/surface` and re-exported (un-shadowed) here. It currently falls through to the JS dispatcher, so a caller using the general rotate entry point gets JS even though `rotateSurface180` / `rotateSurfaceClockwise` / `rotateSurfaceCounterClockwise` are wasm-backed. Add `rotateSurface` to `surfaceWasm.ts` dispatching to the three wasm primitives (or a single `rotate_surface_wasm` taking a quarter-turn count), and to the explicit re-export list in `index.ts`. Mirror the same `runRegionPair` aliasing/version contract.
- **Centralize the `repr(u8)` discriminant maps against a single source of truth.** Today `SURFACE_BEVEL_TYPE`, `SURFACE_CONVOLUTION_EDGE`, `SURFACE_DISPLACEMENT_MODE`, `PIXEL_ORDER`, `RESIZE_MODE`, `THRESHOLD_OPERATION` are hand-typed numbers that must stay in lockstep with the Rust `repr(u8)` enums by hand — a silent cross-language arg-corruption hazard the depth review flagged. Bronze fix: emit the discriminant values from the Rust crate (a `#[wasm_bindgen]` const table or generated `surfaceWasmEnums.ts` written by `scripts/embed-wasm.ts`) and have `surfaceWasm.ts` consume the generated constants instead of literals. At minimum, add a cross-referenced comment naming the exact Rust enum each map shadows and a test asserting map cardinality matches.
- **Add a conformance-drift test that enumerates every `@flighthq/surface` bulk export and asserts surface-rs shadows it.** A single test that imports `* as reference` and `* as rs`, then for the known bulk-op name set asserts `rs.fn !== reference.fn` (i.e. genuinely overridden, not falling through). This would have caught the `rotateSurface` miss mechanically and guards future additions to `@flighthq/surface`.
- **Document the divergence in the conformance map.** Per [rust/conformance.md](../../../rust/conformance.md#conformance-map), record the deliberate non-overrides (`compareSurface`, `getSurfaceMismatch`, `createSurfaceFingerprint`, the `create*`/single-pixel/builder/browser-bound set) as reviewed entries with rationale — turning "JS by choice" from a comment into an auditable registry entry.

### Silver

Competitive/solid — matches `@flighthq/surface` feature-for-feature on the paths that actually pay for a crossing, with a measured near-zero-copy boundary and the edge cases handled.

- **Override the fingerprint/compare full-buffer scans** the depth review flagged as borderline-omission: `createSurfaceFingerprint` (hash over the full buffer — exactly single-crossing work), `compareSurface`, and `getSurfaceMismatch` (per-pixel diff scans). Add `create_surface_fingerprint_wasm`, `compare_surface_wasm`, `get_surface_mismatch_wasm` and shadow the three in `index.ts`. Keep the string-format helpers (`formatSurfaceFingerprint`, `parseSurfaceFingerprint`, `compareSurfaceFingerprints`) as JS — string work, no crossing benefit. This is the conformance reference path for the whole port, so accelerating it has leverage beyond surface-rs itself.
- **Close the `apply*FilterToSurface` ergonomic-entry-point gap.** The filter-wrapper family (`applyBlurFilterToSurface`, `applyDropShadowFilterToSurface`, `applyConvolutionFilterToSurface`, `applyGlowFilterToSurface`, `applyBevelFilterToSurface`, `applyColorMatrixFilterToSurface`, `applyGradientGlowFilterToSurface`, `applyGradientBevelFilterToSurface`, `applyInnerGlowFilterToSurface`, `applyInnerShadowFilterToSurface`, `applySharpenFilterToSurface`, `applyDisplacementMapFilterToSurface`, `applyMedianFilterToSurface`, `applyPixelateFilterToSurface`) lives in `@flighthq/filters-surface` and calls its bulk primitives by module-internal reference, so the wasm override never interposes — a user calling the ergonomic wrapper silently gets JS. Two routes, pick one and record it as a divergence-map decision (this crosses a package boundary, so raise it as a design question per the depth review):
  1. **Injection seam (preferred):** add a `set*SurfaceOps`/registry seam in `@flighthq/surface` (or `@flighthq/filters-surface`) so the wasm primitives can be installed once and the JS wrappers dispatch through it. surface-rs then registers the wasm ops at `initSurfaceRs`. Tree-shakable: the seam is a nullable hook, not a flag.
  2. **Sibling `@flighthq/filters-surface-rs`** that shadows the `apply*FilterToSurface` family the same way surface-rs shadows the bulk ops — a focused neighbor package matching the `-rs` mixing pattern.
- **Prove the near-zero-copy boundary with a measured benchmark, not an assumption.** Add a `tools/`-driven micro-benchmark comparing JS vs wasm per call across buffer sizes (256², 1024², 4096²) for the heavy ops (`gaussianBlurSurface`, `convolveSurface`, `medianSurface`, `resizeSurface`). Confirm the `asUint8` view path makes exactly one crossing and no per-call buffer copy beyond the unavoidable wasm-linear-memory transit; document the crossover size below which JS wins (small surfaces where the crossing dominates — the documented reason single-pixel ops stay JS).
- **Harden marshalling edge cases.** Cover and test: zero-area regions (`width` or `height` 0), regions at surface bounds, sub-region (non-full-surface) `descOf` paths for every op, `out`/`source` aliasing where the caller passes the same backing array, `null` channel maps in `applySurfacePaletteMap`, and the `length`-mismatch cases in `convertSurfacePixelOrder`/`premultiplySurfacePixels`. Assert wasm matches the JS reference's clamp/no-op behavior in each, not just the happy path.
- **Verify wasm memory growth and detached-buffer behavior.** A `Uint8Array` view (`asUint8`) over wasm-resized memory can detach; confirm surface-rs's pattern (caller-owned JS-side buffers, wasm operating on a transient view) is immune, and add a regression test that runs many large ops in sequence without a detached-`ArrayBuffer` throw.

### Gold

Authoritative/AAA/production — exhaustive coverage, locked 1:1 conformance, full error/edge handling, and the boundary discipline a published mixing crate needs.

- **Generated, single-source enum bridge end to end.** Promote the Bronze enum-comment fix to a build-time generated bridge: the Rust crate is the single source of truth for every `repr(u8)` discriminant (`SurfaceBevelType`, `SurfaceConvolutionEdge`, `SurfaceDisplacementMapMode`, `PixelOrder`, `SurfaceResizeMode`, `ThresholdOperation`, `BlendMode`), emitted into a generated TS module consumed by `surfaceWasm.ts`, with a `packages:check`-style gate that fails CI if the checked-in generated file drifts from the crate. Zero hand-maintained discriminants.
- **Full assertion-port conformance, not just name-match.** Per [rust/conformance.md](../../../rust/conformance.md#the-bar-behavior-not-name-match), the bar's "definition of done" is assertion-ported tests, not coverage by name. Ensure every `@flighthq/surface` bulk op's TS test assertions have a counterpart that asserts the wasm output byte-for-byte against the JS reference (the package already does this shape; Gold makes it exhaustive across every option permutation: each `edge` mode, each `mode`, each `ThresholdOperation`, each resize mode, premultiplied on/off, grayscale on/off, multi-pass counts, every default-path and explicit-value path).
- **Determinism and cross-platform byte-exactness audit.** The mixing path's value is that `surface-rs` and `@flighthq/surface` agree to the byte. Audit and lock the float-sensitive ops where Rust and JS rounding can diverge: `gaussianBlurSurface`/`computeGaussianKernel` weights, `resizeSurface` bicubic/bilinear sampling, `colorMatrixSurface`/`applySurfaceColorTransform` rounding, `fillSurfacePerlinNoise`/`fillSurfaceNoise` RNG. For any op that cannot be made byte-identical, record a tolerance in the divergence map with rationale rather than leaving it as silent drift.
- **Error/precondition semantics matched exactly.** Confirm surface-rs reproduces `@flighthq/surface`'s sentinel-vs-throw contract: expected failures return sentinels (`getSurfaceColorBoundsRectangle` → `null`, threshold/dissolve count returns, `getSurfaceCoverage` ratio), and programmer-error preconditions behave identically (the wasm path must not panic where JS returns a sentinel, and must not silently no-op where JS throws). Add tests for mismatched buffer lengths, out-of-range region coordinates, and invalid enum inputs.
- **`@flighthq/types`-first audit of the binding surface.** Confirm every cross-boundary descriptor (the 6-element `descOf` region pack, the 256-byte channel map, the 1024-entry histogram, the rect/4-tuple) is expressed against types owned by `@flighthq/types` (the header layer), not inline shapes in `surfaceWasm.ts`. Any binding-specific value type that crosses the wasm boundary belongs in `@flighthq/types` first per the Flight rule, so the Rust crate, the TS reference, and surface-rs all read the same contract.
- **Published-mixing-crate hardening.** Per the mixing section of [rust/index.md](../../../rust/index.md#mixing), `surface-rs` is the canonical "value-in / value-out leaf" drop-in. Gold means: a documented zero-copy contract for `ImageSource`/`Surface.data` buffers, a stable wasm ABI version stamped in `surfaceWasmBytes.ts` (so a TS↔wasm mismatch is detectable), bundle-size measurement (`npm run size`) of the embedded-bytes cost with a documented baseline, and docs covering the warm-up tradeoff (`initSurfaceRs`), the single-crossing model, and the small-surface crossover where JS is faster.
- **Continuous conformance gate.** Wire surface-rs into `npm run rust:conformance` reporting (or a TS-side equivalent) so the wasm-vs-JS parity suite runs in CI and any new `@flighthq/surface` bulk export that surface-rs fails to shadow turns the gate red — closing the relocation/un-carried-export drift class for the binding the same way the Rust dependency-edge check does for crates.

## Sequencing & effort

Cumulative; each tier presupposes the one before it.

1. **Bronze (small, ~1–2 days).** Override `rotateSurface`; add the "every bulk export is shadowed" guard test; comment-link the discriminant maps and add cardinality tests; write the divergence-map entries. Self-contained within surface-rs and the docs — no package-boundary changes, no Rust rebuild required except optionally emitting enum constants. Highest ratio of verdict-points-closed to effort; do first.
2. **Silver (medium, ~1 week).** Two parts. (a) **In-package:** override the fingerprint/compare scans (needs new Rust functions + rebuild), the marshalling-edge-case tests, the benchmark, and the memory-growth audit — all inside surface-rs + `flighthq-surface-wasm`. (b) **Cross-boundary:** the `apply*FilterToSurface` interposition seam touches `@flighthq/surface`/`@flighthq/filters-surface` and must be raised as a design question before implementing (the depth review's #1 follow-up). Do the in-package work first; gate the seam on the design decision.
3. **Gold (large, ongoing).** The generated enum bridge, exhaustive assertion-port across every option permutation, the byte-exactness/determinism audit, error-semantics matching, the `@flighthq/types`-first audit, published-crate hardening, and the CI conformance gate. This is steady conformance-hardening work rather than a single push, and it is the layer that converts "authoritative for its domain" into "1:1 production drop-in."

Net: Bronze likely moves the verdict from 92 to ~96 (closes the `rotateSurface` miss and the drift hazard); Silver to ~98 (feature-for-feature + the ergonomic-filter path + measured boundary); Gold is the exhaustive 100 — byte-locked, generated bridge, CI-gated.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/surface-rs` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
