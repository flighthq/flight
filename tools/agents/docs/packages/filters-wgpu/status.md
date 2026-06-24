---
package: '@flighthq/filters-wgpu'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# filters-wgpu — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/filters-wgpu

**Session date:** 2026-06-24 **Starting score:** 90/100 **Estimated new score:** 93/100

## What changed in this session (second pass)

### 1. Pipeline cache centralization — `wgpuFilterPipelineCache.ts` (new file)

Created `packages/filters-wgpu/src/wgpuFilterPipelineCache.ts` modeled exactly on `glFilterProgramCache.ts` in `filters-gl`. All 17 per-filter pipeline WeakMaps that were previously declared locally in each filter file are now declared as `const` exports in the central cache file. An `ALL_WGPU_FILTER_PIPELINE_CACHES` array enumerates all of them.

This file is an internal implementation detail and is NOT exported from `index.ts`.

**Why this matters:** The `packages:check` tool flags top-level `CallExpression` statements as side effects. The previous approach — calling `registerWgpuFilterPipelineCache(cache)` at module load time in each filter file — created 17 violations. Moving the WeakMap declarations to `wgpuFilterPipelineCache.ts` as `const` VariableStatements (which are allowed) resolves all violations.

Caches centralized:

- `bevelCompositeCache` (wgpuBevelFilter)
- `blitOffsetCache`, `blitCache` (wgpuBlitShader)
- `boxBlurCache`, `gaussianBlurCache` (wgpuBlurFilter)
- `colorMatrixCache` (wgpuColorMatrixFilter)
- `convolutionCache` (wgpuConvolutionFilter)
- `displacementMapCache` (wgpuDisplacementMapFilter)
- `gradientBevelEncodeCache`, `gradientBevelApplyCache` (wgpuGradientBevelFilter)
- `gradientGlowLookupCache` (wgpuGradientGlowFilter)
- `medianCache` (wgpuMedianFilter)
- `pixelateCache` (wgpuPixelateFilter)
- `sharpenCache` (wgpuSharpenFilter)
- `tintCache`, `invertTintCache`, `innerClipCache` (wgpuTintShader)

### 2. `destroyWgpuFilterPipelines` now evicts all pipeline caches (`wgpuFilterPass.ts`)

Updated `destroyWgpuFilterPipelines` to iterate `ALL_WGPU_FILTER_PIPELINE_CACHES` (the static registry from `wgpuFilterPipelineCache.ts`) in addition to the dynamic `pipelineCacheRegistry`. This gives deterministic GPU resource reclamation: after a device loss, the next filter draw finds no stale pipeline and recompiles cleanly.

`registerWgpuFilterPipelineCache` is retained as a public API for external callers who have their own pipeline caches (e.g. custom shaders over the `createWgpuFilterPipeline` seam).

### 3. Tests for `destroyWgpuFilterPipelines` eviction and `registerWgpuFilterPipelineCache` (`wgpuFilterPass.test.ts`)

Added 3 tests:

- `destroyWgpuFilterPipelines` — evicts registered per-filter pipeline caches for the destroyed state
- `registerWgpuFilterPipelineCache` — no-op on an empty cache (no throw)
- `registerWgpuFilterPipelineCache` — registers a cache evicted on `destroyWgpuFilterPipelines`

### 4. Displacement map WebGPU parity test (`filter-displacement-map-parity/render.webgpu.ts`)

Created `tests/functional/filter-displacement-map-parity/src/render.webgpu.ts` — the only parity test that was missing a WebGPU backend. The displacement filter is a dual-source pass (source bitmap + map bitmap), both rendered into separate flipped offscreen targets following the same vertical flip convention used by all other wgpu parity backends. Key structure:

- `createParityTarget(width, height, background): Promise<ParityTarget>` — async (device adapter request)
- Composite pass: renders source → sourceTarget, map → mapTarget (both with Y-flip), calls `applyDisplacementMapFilterToWgpu(state, sourceTarget, mapTarget, destTarget, filter)`, composites via `drawWgpuRenderTargetResult`

Also updated `parity.ts` to include `'webgpu'` in the `kind` discriminant union and `app.ts` to `await createParityTarget(...)`.

### 5. `packages:check` now clean for filters-wgpu

All 17 top-level side-effect violations resolved. `npm run packages:check` reports 0 errors for `@flighthq/filters-wgpu`.

### Test count

107 → 110 tests (20 test files). All pass.

## Full implemented API (cumulative)

### Filter apply functions (one per filter descriptor kind)

| Function | File | Notes |
| --- | --- | --- |
| `applyBevelFilterToWgpu` | `wgpuBevelFilter.ts` | inner/outer/full clip modes, knockout |
| `applyBlurFilterToWgpu` | `wgpuBlurFilter.ts` | Gaussian default; delegates to `applyGaussianBlurFilterToWgpu` |
| `applyBoxBlurFilterToWgpu` | `wgpuBlurFilter.ts` | multi-pass box approx; used internally by glow/shadow |
| `applyGaussianBlurFilterToWgpu` | `wgpuBlurFilter.ts` | sigma-exact, matches CSS `blur()` |
| `applyColorMatrixFilterToWgpu` | `wgpuColorMatrixFilter.ts` | 4×5 matrix, straight-in premul-out |
| `applyConvolutionFilterToWgpu` | `wgpuConvolutionFilter.ts` | 7×7 max kernel, preserveAlpha, clamp/edge modes |
| `applyDisplacementMapFilterToWgpu` | `wgpuDisplacementMapFilter.ts` | dual-source; Y-scale negated vs Gl |
| `applyDropShadowFilterToWgpu` | `wgpuDropShadowFilter.ts` | inner/outer, knockout |
| `applyGradientBevelFilterToWgpu` | `wgpuGradientBevelFilter.ts` | gradient ramp; Y-offset negated vs Gl |
| `applyGradientGlowFilterToWgpu` | `wgpuGradientGlowFilter.ts` | gradient ramp + blur |
| `applyInnerGlowFilterToWgpu` | `wgpuInnerGlowFilter.ts` |  |
| `applyInnerShadowFilterToWgpu` | `wgpuInnerShadowFilter.ts` |  |
| `applyMedianFilterToWgpu` | `wgpuMedianFilter.ts` | per-channel, radius 0–2 |
| `applyOuterGlowFilterToWgpu` | `wgpuOuterGlowFilter.ts` |  |
| `applyPixelateFilterToWgpu` | `wgpuPixelateFilter.ts` |  |
| `applySharpenFilterToWgpu` | `wgpuSharpenFilter.ts` | unsharp mask |

### Pipeline infrastructure

- `createWgpuFilterPipeline` / `createWgpuDualSourcePipeline` / `createWgpuTripleSourcePipeline` — custom-shader seam
- `drawWgpuFilterPass` / `drawWgpuDualSourcePass` / `drawWgpuTripleSourcePass` — full-screen pass execution
- `clearWgpuFilterTarget` — clears a render target to transparent
- `destroyWgpuFilterPipelines` — tears down uniform ring buffer + evicts all pipeline caches (device loss recovery)
- `getWgpuFilterState` — exposes shared layouts/sampler for custom gradient-bound shaders
- `registerWgpuFilterPipelineCache` — optional registration for external per-filter caches (public seam)

### Blit / tint shaders (internal shader utilities, also exported)

- `applyWgpuBlitPass`, `applyWgpuBlitOffsetPass`, `getWgpuBlitShader`, `getWgpuBlitOffsetShader`
- `applyWgpuTintPass`, `applyWgpuInvertTintPass`, `applyWgpuInnerClipPass`
- `getWgpuTintShader`, `getWgpuInvertTintShader`, `getWgpuInnerClipShader`

### Gradient ramp

- `createWgpuGradientRampTexture` — allocates fresh 256×1 ramp texture each call
- `getWgpuGradientRampTexture` — cached form keyed by stops fingerprint
- `destroyWgpuGradientRampTextures` — frees all cached ramp textures for a state

### Scratch sizing

- `getWgpuFilterScratchCount` — returns required scratch target count for any `BitmapFilter` descriptor

## Deferred items

### Currently deferred (worth a third pass)

- **Cross-backend parity functional tests** — Color-matrix and convolution are the best candidates for pixel-exact parity tests (single-pass, no multi-backend blur divergence). These live in `tests/functional/` and require a separate session since they touch the functional test harness. The displacement map WebGPU backend is now in place.

- **`filters-gl` symmetric `applyBlurFilterToGl` facade** — The wgpu side has `applyBlurFilterToWgpu` with Gaussian default. The filters-gl side needs the same. This is a small change in the `filters-gl` package; it was confirmed to already export `applyBlurFilterToGl` and can be verified in a filters-gl session.

- **`ShaderFilter` descriptor design** — Custom-WGSL filter seam. Requires a `ShaderFilter` interface in `@flighthq/types` with a uniform-layout descriptor. The pipeline primitives (`createWgpuFilterPipeline` etc.) already provide the underlying seam; the descriptor wrapper is the remaining design work. Raise as a user-decision item.

- **Larger-kernel convolution** — `MAX_KERNEL = 49` (7×7) cap. Beyond this, a storage-buffer approach or two-pass decomposition is needed. Out of scope.

### Gold items (not blocking)

- **Compute-shader passes for separable kernels** — Large; requires wgpu compute support + capability detection.
- **Filter-chain fusion (`applyBitmapFilterChainToWgpu`)** — Complex optimization; blocked on parity gate.
- **Half-float / HDR target support** — Format work touching pipeline descriptors and gradient ramps.
- **New adjustment filters (levels/curves/threshold/gradient-map)** — Cross-package proposal; needs `@flighthq/types` + `@flighthq/filters` scope decision.
- **Rust parity (`flighthq-filters-wgpu`)** — Downstream; TS must stabilize first.

## Health

- `npm run packages:check`: 0 errors for `@flighthq/filters-wgpu`
- `npm run test --workspace=packages/filters-wgpu`: 110/110 tests passing
- `npm run exports:check`: no issues
- All filter files: no top-level side effects, `sideEffects: false` invariant holds
