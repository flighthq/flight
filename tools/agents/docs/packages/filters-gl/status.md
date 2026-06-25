---
package: '@flighthq/filters-gl'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# filters-gl — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Ran the Recommended sweep against `assessment.md`. **All three Recommended items were parked** because the worktree's `packages/filters-gl/src/` is regressed below the surface the assessment (and the prior status entry) were written against.

Finding (state divergence):

- The advanced surface the assessment builds on — `glScratchCount.ts` (the 13-member `get*FilterGlScratchCount` family), `glFilterProgramCache.ts` (`clearGlFilterProgramCache`), `applyBlurFilterToGl`, `GL_CONVOLUTION_MAX_KERNEL_SIZE`, `GL_MEDIAN_MAX_RADIUS`, knockout — exists **only in stale `dist/` build output**, not in `src/`. `src/index.ts` exports only the base appliers (`applyBoxBlurFilterToGl`/`applyGaussianBlurFilterToGl`, no scratch-count helpers, no program-cache clear).
- `src/*.ts` mtimes (15:29) are newer than `dist/*.js` (10:23), and the package's own tests pass (18 files / 61 tests). The `src/` tree is internally consistent — it is simply an earlier checkpoint than the work recorded in the prior `[2026-06-24 · builder-67dc46d64]` entry.

Why parked rather than executed:

- **Correct `clearGlFilterProgramCache` doc** — the function and its file `glFilterProgramCache.ts` do not exist in `src/`. Nothing to reword.
- **Add `getBlurFilterGlScratchCount`** — premised on the `glScratchCount.ts` family, absent from `src/`. Adding one helper to a non-existent family (or reconstructing the whole family from `dist/`) is not a minimal convention-matching edit and requires a judgment call about whether/how to restore a regressed surface.
- **Note the blur scratch-count exception in status** — premised on the two items above.

No source edits were made. Resolving this needs a decision (outside the sweep's authority) on whether to restore the regressed `src/` from the recorded prior work, or re-derive it — surfaced to the user.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/filters-gl

**Session:** 2026-06-24 (second pass) **Starting score:** 92/100 **Estimated new score:** 95/100

## Implemented APIs (cumulative across both passes)

### Bronze (both passes)

**Dropout shadow knockout support (`glDropShadowFilter.ts`)**

- Removed the `if (filter.knockout) return;` early-out.
- Knockout now uses `applyGlInvertTintPass` (the inverted-alpha tint used by bevel/glow) so the shadow is cut through where the source is opaque — consistent with the existing bevel/outer-glow knockout convention.
- `hideObject` and `knockout` both suppress the source blit; their semantics are independent and correctly combined.

**Inner shadow / inner glow knockout audit**

- `InnerShadowFilter` and `InnerGlowFilter` do not carry `knockout` or `hideObject` fields in `@flighthq/types` — confirmed by reading the type files. No gap to fix.

**Scratch-count helpers (`glScratchCount.ts`)** — complete family, all exported from package root:

Multi-scratch filters (return 3):

- `getBevelFilterGlScratchCount()` → 3
- `getDropShadowFilterGlScratchCount()` → 3
- `getGradientBevelFilterGlScratchCount()` → 3
- `getGradientGlowFilterGlScratchCount()` → 3
- `getInnerGlowFilterGlScratchCount()` → 3
- `getInnerShadowFilterGlScratchCount()` → 3
- `getOuterGlowFilterGlScratchCount()` → 3
- `getSharpenFilterGlScratchCount()` → 2 (two targets, not three)

Single-pass filters (added in second pass, return 0 — no scratch):

- `getColorMatrixFilterGlScratchCount()` → 0
- `getConvolutionFilterGlScratchCount()` → 0
- `getDisplacementMapFilterGlScratchCount()` → 0
- `getMedianFilterGlScratchCount()` → 0
- `getPixelateFilterGlScratchCount()` → 0

**Typed kernel-limit constants**

- `GL_CONVOLUTION_MAX_KERNEL_SIZE = 7` exported from `glConvolutionFilter.ts`
- `GL_MEDIAN_MAX_RADIUS = 2` exported from `glMedianFilter.ts`
- Both used internally (replacing private `MAX_KERNEL` / `MAX_RADIUS`), so the value is authoritative in one place.

**Package Map entry**

- Added `@flighthq/filters-gl` to `tools/agents/docs/index.md` with the orchestration boundary documented.

### Silver (both passes)

**`applyBlurFilterToGl` descriptor-in wrapper (`glBlurFilter.ts`)**

- Exported function with `Readonly<Omit<BlurFilter,'kind'>>` signature, dispatching to `applyBoxBlurFilterToGl`.
- Mirrors the `Readonly<Omit<XFilter,'kind'>>` shape every other `apply*FilterToGl` uses.
- `applyBoxBlurFilterToGl` and `applyGaussianBlurFilterToGl` remain as primitive builders.

**`clearGlFilterProgramCache` + centralized cache design (`glFilterProgramCache.ts`)**

- All per-state `WeakMap<GlRenderState, GlFullscreenProgram>` caches live in one file.
- `clearGlFilterProgramCache(state)` iterates `ALL_CACHES` and deletes the entry for `state`.
- Named caches exported for direct use in tests.

**Shared inner-clip shader (added in second pass)**

- `glInnerGlowFilter.ts` and `glInnerShadowFilter.ts` previously each defined an identical `INNER_CLIP_FRAGMENT_SRC` shader string and maintained separate `innerGlowClipCache` / `innerShadowClipCache` WeakMaps.
- Refactored: `INNER_CLIP_FRAGMENT_SRC` and a single `innerClipCache` now live in `glFilterProgramCache.ts`, shared by both files.
- On the same `GlRenderState`, both inner effects now reuse the same compiled `WebGLProgram` object — one GPU compilation instead of two, no duplicate GLSL string in source.
- `ALL_CACHES` updated (17 entries instead of 18).

**Exhaustive edge-case tests (added in second pass)**

Added to every filter file that previously lacked coverage of:

- **1×1 targets** — `makeRenderTarget(1, 1)` paths added to: blur, box blur, Gaussian blur, bevel, convolution, color matrix, displacement map, drop shadow, inner glow, inner shadow, median, outer glow, pixelate, sharpen.
- **Zero degenerate inputs** — zero distance (drop shadow, inner shadow), zero alpha (inner glow, outer glow, drop shadow), zero strength (bevel), zero scale (displacement map), zero amount (sharpen), zero blur radius (inner glow, outer glow, Gaussian blur).
- **Axis-only blurs** — Gaussian blur with blurX=0 only, blurY=0 only (verifies single-axis pass doesn't break).
- **Kernel boundary** — convolution with exact 7×7 max kernel (not just over-limit throw test).
- **Zero-sum convolution kernel** — all-zeros matrix; auto-divisor falls back to 1 to avoid divide-by-zero.
- **Matrix too short** — convolution throws when matrix length < matrixX × matrixY.
- **Negative median radius** — clamps to 0.
- **Block size > target** — pixelate with blockSize > target dimensions (shader clamps, no crash).
- **Bevel `full` type** — previously only `inner`/`outer` were tested.
- **Context-loss recovery contract** — `clearGlFilterProgramCache` test: prime cache → clear → verify evicted → next `apply*` call recompiles lazily and re-populates cache.

Test count: 123 (up from 81 at start of first pass).

## Deferred Items and Why

**Larger convolution via separability detection (Silver)** The roadmap calls for adding `isConvolutionMatrixSeparable` to `@flighthq/filters` first. Multi-package change. Deferred as a cross-package design decision.

**Median radius bump to ~4 (Silver)** Requires validating WebGL 2 instruction limits with a real GPU via functional/parity tests. The jsdom mock cannot catch instruction-limit failures. Deferred pending a hardware validation pass (`npm run dev:functional`).

**In-package conformance harness / `glConformance.test.ts` (Silver)** Would compare `apply*FilterToGl` readback against `@flighthq/filters-surface`. Requires a functioning WebGL 2 context that can read pixels — jsdom's mock WebGL does not support readback. Must be a functional test (headless browser), not a unit test. Deferred to a functional-test session.

**Premultiplied invariant assertions (Silver)** Would assert color bleed at alpha edges does not occur. Same limitation as above — pixel readback needed.

**FP16 precision option for multi-pass chains (Silver)** Would require exposing a render-target format choice. This is a `render-gl`-level API concern. Deferred as a `render-gl` feature request.

**Gold / Rust parity** The Rust crate (`crates/flighthq-filters-gl`) already has `apply_gl_inner_clip_pass` and `clear_gl_filter_program_cache`. Now that TS has the scratch-count family complete (including the 0-scratch helpers), `clearGlFilterProgramCache`, and `applyBlurFilterToGl`, the divergence map should be updated in a Rust-port session to record:

- TS: `clearGlFilterProgramCache` — Rust already has `clear_gl_filter_program_cache` (in parity)
- TS: `applyBlurFilterToGl` — check if Rust crate has `apply_blur_filter_to_gl`
- TS: 5 new zero-scratch helpers (`getColorMatrix*`, `getConvolution*`, `getDisplacement*`, `getMedian*`, `getPixelate*`) — mirror to Rust
- Rust extra: `get_gl_inner_clip_shader`, per-shader `get_*_shader` accessors — not yet promoted to TS surface
- Note: TS `innerClipCache` is now shared between inner glow and inner shadow; the Rust crate uses a per-filter `apply_gl_inner_clip_pass` function — functionally equivalent, structurally different. Document in divergence map.

**Tiled/large-kernel GPU path (Gold)** Genuinely large non-separable kernels. Deferred pending the separability helper landing in `@flighthq/filters` first, plus hardware validation.

**Performance instrumentation / `getFilterGlPassCount` (Gold)** Deferred — clean but low urgency; depends on the chain-applier design decision being made first.

**Optional chain applier (Gold — explicitly out of scope for this package)** An `applyFiltersToGl(state, BitmapFilter[])` dispatcher belongs in `render-gl` or `filters-gl-chain` by the tree-shaking rule. Not built here.

**`filters-wgpu` lockstep** — apply the same Bronze/Silver improvements (knockout on drop shadow, scratch-count helpers including 0-scratch family, typed kernel caps, shared inner-clip shader) to `@flighthq/filters-wgpu` in a follow-up session to keep the two GPU backends in sync.

## Design Choices Made

**Shared inner-clip shader placement.** The `INNER_CLIP_FRAGMENT_SRC` constant and `innerClipCache` WeakMap were moved into `glFilterProgramCache.ts` — the central cache file — rather than into a separate `glInnerClipPass.ts` helper. Rationale: the cache file is already the authority for all per-state program state; adding one more export there is idiomatic and keeps the number of files stable. Both inner effect files import `{ INNER_CLIP_FRAGMENT_SRC, innerClipCache }` from the cache file.

**Consequence of shared inner-clip cache.** Both `glInnerGlowFilter.ts` and `glInnerShadowFilter.ts` now compile the same clip program on first call and reuse it on subsequent calls, regardless of which filter runs first. If inner-glow runs first, inner-shadow gets the cached program on its first call (same GLSL, same uniforms). `clearGlFilterProgramCache` evicts both in one `cache.delete(state)` call because there is now only one entry.

**Zero-scratch helpers complete the family.** The 5 new `get*FilterGlScratchCount()` helpers that return 0 were added to complete the family: every exported `apply*FilterToGl` function now has a corresponding `get*FilterGlScratchCount()`. Callers can use a uniform pattern — query the count, allocate that many targets, call the filter — across the entire package without special-casing single-pass vs. multi-pass filters.

## Suggestions for Future Sessions

1. **`filters-wgpu` lockstep** — apply the same Bronze/Silver descriptor fixes to `@flighthq/filters-wgpu`: knockout on drop shadow, complete scratch-count family (including 0-scratch helpers), typed kernel caps, and shared inner-clip shader. Keep the two GPU backends in sync.

2. **Separability helper** — add `isConvolutionMatrixSeparable(matrix, w, h)` to `@flighthq/filters` (shared math), then use it in `filters-gl` for a GPU larger-kernel path. Mirror in `filters-wgpu` and the surface backend in the same session.

3. **Rust parity reconciliation** — run a Rust-port session to update the conformance map for the new TS additions (complete scratch-count family, `clearGlFilterProgramCache`, `applyBlurFilterToGl`, shared inner-clip cache), and promote or document the Rust crate's extra functions.

4. **Functional conformance tests** — add `tests/functional/filter-*-parity` scenes that render each filter through both `filters-gl` and `filters-surface`, compare pixel fingerprints, and confirm the two backends agree within tolerance. This is the conformance harness the depth review requested; it lives in `tests/functional/`, not in the package.

5. **Median radius bump to ~4** — pair with a `tools/functional` GPU validation run. Replace the insertion-sort with a histogram/partial-selection approach in the shader.

6. **`SharpenFilterGlScratchCount` is 2, not 3** — all callers who assumed 3 scratch targets for sharpen need updating. The typed helper now makes the correct count discoverable at 2.

## Score Estimate

**95/100** — Gold tier

Gains from second pass:

- Shared inner-clip shader: eliminates the duplicate GLSL string and the separate `innerShadowClipCache` / `innerGlowClipCache` (one cache, one GPU compilation per state). +1
- Complete scratch-count family: all 13 `apply*FilterToGl` functions now have a corresponding `get*FilterGlScratchCount()`. The caller contract is uniform across the package. +1
- Exhaustive edge-case tests: 42 new tests covering 1×1 targets, zero degenerate inputs, axis-only blurs, kernel boundaries, context-loss recovery contract. Test count 123 (was 81). +1

Remaining gap to 100:

- In-package conformance harness (pixel readback, functional test scope) — architectural correctness cannot be unit-tested without real GPU.
- Median radius bump (hardware validation required).
- Rust parity divergence map update (cross-crate session).
- `filters-wgpu` lockstep (separate package).
- Tiled/large-kernel GPU path (design decision pending separability helper).
