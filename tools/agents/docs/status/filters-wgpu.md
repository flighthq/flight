# @flighthq/filters-wgpu — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging `dist/*.js` (impl + verbatim comments) with `dist/*.d.ts` (types). The integration curation had pruned two whole modules and several functions from existing modules; the build output proved they compiled.

### Modules recovered (new files)

- `wgpuFilterScratch.ts` — `getWgpuFilterScratchCount(filter: Readonly<BitmapFilter>): number`. Reports the scratch-target count each `apply*FilterToWgpu` needs (0 for single-pass filters, 1 for BlurFilter, 2 for Sharpen, 3 for blur-derived effects, 0 for unknown kinds). Test reconstructed from `dist/wgpuFilterScratch.test.js`.
- `wgpuFilterPipelineCache.ts` — the centralized per-state pipeline cache module. Exports the 17 per-filter `WeakMap<WgpuRenderState, object>` caches (bevelComposite, blitOffset, blit, boxBlur, gaussianBlur, colorMatrix, convolution, displacementMap, gradientBevelEncode, gradientBevelApply, gradientGlowLookup, median, pixelate, sharpen, tint, invertTint, innerClip) plus `ALL_WGPU_FILTER_PIPELINE_CACHES`. `dist/wgpuFilterPipelineCache.test.js` was empty (0 bytes), so a small colocated test asserting the registry composition was written to satisfy the colocated-test convention. Not re-exported from the barrel — it is internal infrastructure, matching `dist/index.js`.

### Functions recovered (added into existing modules)

- `wgpuFilterPass.ts` — `destroyWgpuFilterPipelines(state)` (destroys filter infra + evicts every registered cache; idempotent) and `registerWgpuFilterPipelineCache(cache)` (registers a per-filter WeakMap for device-loss eviction). Added the `ALL_WGPU_FILTER_PIPELINE_CACHES` import and the `pipelineCacheRegistry` module variable. Tests added for both.
- `wgpuBlurFilter.ts` — `applyBlurFilterToWgpu(state, source, dest, temp, filter)`: the `BlurFilter`-descriptor entry point that delegates to the Gaussian path. Tests added.
- `wgpuGradientRamp.ts` — `destroyWgpuGradientRampTextures(state)`: destroys all cached ramp textures for a state, idempotent. Tests added.

### Barrel (`index.ts`)

Aligned to `dist/index.js`: added `applyBlurFilterToWgpu`, `getWgpuFilterScratchCount`, `destroyWgpuFilterPipelines`, `getWgpuFilterState`, `registerWgpuFilterPipelineCache`, `destroyWgpuGradientRampTextures`, and `getWgpuGradientRampTexture` (the last two and the filterPass trio were present in src but missing from the barrel before this recovery).

### Fossils skipped

None. Nothing in the lost set implemented a dropped/deprecated concept.

### Parked

None. All recovered modules' imported types (`WgpuRenderState`, `WgpuRenderTarget`, `BitmapFilter`, `BlurFilter`) are present in `@flighthq/types`.

### Known divergence (not addressed — out of recovery scope)

The recovered `destroyWgpuFilterPipelines` clears the centralized caches in `wgpuFilterPipelineCache.ts` (and any dynamically registered via `registerWgpuFilterPipelineCache`), but the current filter modules (`wgpuBlitShader`, `wgpuBevelFilter`, `wgpuBlurFilter`, `wgpuColorMatrixFilter`, `wgpuConvolutionFilter`, `wgpuDisplacementMapFilter`, `wgpuGradientBevelFilter`, `wgpuGradientGlowFilter`, `wgpuMedianFilter`, `wgpuPixelateFilter`, `wgpuSharpenFilter`, `wgpuTintShader`) still hold their own local module-level `WeakMap` pipeline caches rather than the centralized ones. In the dist build those modules were wired to the central caches; the pruned src reverted to local caches. Rewiring every filter module to the shared caches (or to call `registerWgpuFilterPipelineCache`) is a cross-file refactor beyond lost-source recovery and is left as a follow-up — `destroyWgpuFilterPipelines` is correct and self-consistent today, it just does not yet evict the filters' local caches.

### Test result

`npm run test --workspace=packages/filters-wgpu`: 21 files passed, 104 tests passed.
