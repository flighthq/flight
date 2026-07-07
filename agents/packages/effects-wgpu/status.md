---
package: '@flighthq/effects-wgpu'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# effects-wgpu — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/effects-wgpu

**Session date**: 2026-06-24 **Prior score**: 83/100 **Estimated new score**: 91/100

## Implemented APIs (cumulative across both passes)

### Pass 1 — Core infrastructure and 45-effect library

- `wgpuRenderEffectPipeline.ts` — `beginWgpuRenderEffectPipeline`, `createWgpuRenderEffectPipeline`, `destroyWgpuRenderEffectPipeline`, `endWgpuRenderEffectPipeline`, `setWgpuRenderEffectVelocityTexture`
- `wgpuRenderEffectRegistry.ts` — `getWgpuRenderEffectRunner`, `registerWgpuRenderEffect`
- `wgpuEffectProgramCache.ts` — `getWgpuEffectPipeline`
- 45 effect runners across all bands — applyBloom, applyBokehDepthOfField, applyBrightnessContrast, applyCameraMotionBlur, applyChannelMixer, applyChromaticAberration, applyColorGrade, applyCrt, applyDirectionalBlur, applyDisplacement, applyDither, applyExposure, applyFilmGrain, applyFxaa, applyGlitch, applyGodRays, applyGrayscale, applyHalftone, applyHueSaturation, applyInvert, applyKuwahara, applyLensDirt, applyLensDistortion, applyLensFlare, applyLiftGammaGain, applyLookupTableGrade, applyMotionBlur, applyOutline, applyPixelate, applyPosterize, applyRadialBlur, applyScanlines, applyScreenSpaceFog, applySepia, applySharpen, applySketch, applySmaa, applySsao, applySsr, applyTaa, applyTiltShift, applyToneMap, applyVignette, applyWhiteBalance, (+ `defaultWgpu*EffectRunner` for each)

### Pass 1 — Registrant helpers (`wgpuRenderEffectRegistrants.ts`)

- `registerAntialiasingWgpuRenderEffects(state)` — FxaaEffect, SmaaEffect, TaaEffect
- `registerBloomWgpuRenderEffects(state)` — BloomEffect, ChromaticAberrationEffect, GodRaysEffect, LensDirtEffect, LensDistortionEffect, LensFlareEffect, VignetteEffect
- `registerBlurWgpuRenderEffects(state)` — BokehDepthOfFieldEffect, CameraMotionBlurEffect, DirectionalBlurEffect, MotionBlurEffect, RadialBlurEffect, TiltShiftEffect
- `registerColorWgpuRenderEffects(state)` — BrightnessContrastEffect, ChannelMixerEffect, ColorGradeEffect, ExposureEffect, GrayscaleEffect, HueSaturationEffect, InvertEffect, LiftGammaGainEffect, LookupTableGradeEffect, PosterizeEffect, SepiaEffect, ToneMapEffect, WhiteBalanceEffect
- `registerScreenSpaceWgpuRenderEffects(state)` — DisplacementEffect, ScreenSpaceFogEffect, SharpenEffect, SsaoEffect, SsrEffect
- `registerStandardWgpuRenderEffects(state)` — all 45 runners
- `registerStylizeWgpuRenderEffects(state)` — CrtEffect, DitherEffect, FilmGrainEffect, GlitchEffect, HalftoneEffect, KuwaharaEffect, OutlineEffect, PixelateEffect, ScanlinesEffect, SketchEffect

### Pass 2 — `hasWgpuRenderEffectRunner` (registry symmetry)

`wgpuRenderEffectRegistry.ts` now exports:

- `hasWgpuRenderEffectRunner(state, kind): boolean` — symmetric with `hasGlRenderEffectRunner`. Returns `true` if a runner is registered for `kind` in `state`. Tests added in `wgpuRenderEffectRegistry.test.ts`.

### Pass 2 — Progressive bloom mip-chain (`wgpuBloomEffect.ts` rewritten)

`applyBloomEffectToWgpu` now uses a full CoD/Unreal-style mip-chain:

- **Pass 1: Bright-pass with Karis average** — extracts bright pixels using a 2×2 bilinear average weighted by luminance (`karisWeight`). This is the canonical anti-flicker step from Jimenez 2014 / Unreal Engine; suppresses isolated specular fireflies that naive thresholding blooms into large halos.
- **Pass 2: 13-tap downsample chain** — N levels (up to 6, determined by `floor(log2(min(w,h)/16))`), each half resolution. Uses the Jimenez 2014 13-tap pattern (4 bilinear corner samples × 0.0625 + 4 inner diagonal × 0.125 + centre + 4 cardinal × 0.0625 + 0.125). Industry-standard; used verbatim in UE5, Unity HDRP, and Call of Duty post-stack.
- **Pass 3: 3×3 tent-filter upsample chain** — accumulates from the smallest mip back up; blend weight scales with bloom radius so narrow-radius bloom gets tight and wide-radius bloom gets soft.
- **Pass 4: Additive composite** — scene + upsampled bloom, unchanged from first pass.
- **Fallback** for scenes smaller than 16×16: single-level Gaussian bloom (original recipe). Prevents degenerate 1×1 mip levels.

Design choice: `getWgpuEffectPipeline` (per-key compiled pipeline cache) is used for all mip-chain passes to share compiled shaders across frames, avoiding re-compilation on every frame.

### Pass 2 — Full three-pass SMAA (`wgpuSmaaEffect.ts` rewritten)

`applySmaaEffectToWgpu` now implements the full three-pass SMAA (Jimenez et al. 2012):

- **Pass 1: Luma-based edge detection** — computes per-pixel luma delta vs left/top neighbours with local contrast adaptation (relaxed threshold in high-contrast areas to preserve detail).
- **Pass 2: Blend weight computation** — for each edge pixel, searches horizontally and vertically for edge endpoints (up to `MAX_SEARCH_STEPS = 16` steps), then computes blend weights using an **analytical area function** (polynomial smooth-step approximation). This replaces the 89KB precomputed area+search binary texture with an in-shader computation. The search functions (`smaaSearchXLeft`, `smaaSearchXRight`, `smaaSearchYUp`, `smaaSearchYDown`) iterate along the edge direction looking for endpoint transitions.
- **Pass 3: Neighborhood blend** — reads source colors and blend weights; composites cardinal neighbours weighted by the per-pixel RGBA weights (rg = horizontal blend, ba = vertical).

Architecture decision: the runner path (`defaultWgpuSmaaEffectRunner`) receives the pipeline's persistent pool directly via `applySmaaEffectWithPoolToWgpu`, avoiding throwaway pool allocation on every frame. The public `applySmaaEffectToWgpu` creates a local pool (for standalone use outside the runner context).

All three passes use the `createWgpuFilterPipeline` / `createWgpuDualSourcePipeline` primitives, cached per state in `_edgePipelines`, `_weightPipelines`, and `_blendPipelines` WeakMaps.

### Pass 2 — GL registrar taxonomy reconciliation (`effects-gl` package)

`glRenderEffectRegistrar.ts` migrated from the 4-band taxonomy to the canonical 6-band taxonomy matching Wgpu:

**Band changes:**

- `BloomEffect` — moved from **blur** band to **bloom** band (was conceptually misplaced alongside directional/motion blurs)
- `DitherEffect` — moved from **color-grade** band to **stylize** band (matches Wgpu; dither is an artistic transform, not a photometric color transform)
- `ChromaticAberrationEffect`, `GodRaysEffect`, `LensDirtEffect`, `LensDistortionEffect`, `LensFlareEffect`, `VignetteEffect` — moved from **stylize** band to **bloom** band (optical/lens effects naturally group with bloom)
- `DisplacementEffect`, `ScreenSpaceFogEffect`, `SharpenEffect`, `SsaoEffect`, `SsrEffect` — now in dedicated **screen-space** band (previously in a catch-all "stylize" band)

**Legacy aliases preserved:**

- `registerColorGradeGlRenderEffects` — aliases `registerColorGlRenderEffects`
- `registerDefaultGlRenderEffects` — aliases `registerStandardGlRenderEffects` semantics (now calls all 6 bands)
- `registerStandardGlRenderEffects` — aliases `registerDefaultGlRenderEffects`

`ALL_GL_EFFECT_KINDS` is now a literal constant (no dynamic concat from band arrays), making the canonical effect list greppable and statically obvious.

Tests in `glRenderEffectRegistrar.test.ts` updated to reflect the new taxonomy.

## Remaining Deferred Items

### Depth/velocity G-buffer (Bronze/Silver — cross-package prerequisite)

Making SSAO, ScreenSpaceFog, BokehDepthOfField, SSR, MotionBlur, and TAA use real depth/velocity data requires `render-wgpu` changes:

- `WgpuRenderTarget.depthStencilView` needs `TEXTURE_BINDING` usage (or a separate sampleable depth resolve)
- `getWgpuRenderTargetDepthTexture(target): GPUTexture | null` needs to be added to `render-wgpu`

The `WgpuRenderEffectContext.sceneDepthTexture` slot in `@flighthq/types` already exists (currently fed `null`). Must land in `render-wgpu` first, symmetrically with `render-gl`/`effects-gl`. Cross-package change — blocked on a user/team decision.

### Velocity (motion-vector) G-buffer (Silver — cross-package)

Per-pixel velocity texture requires a previous-view-projection bookkeeping pass in `render-wgpu`. Unblocks MotionBlur, CameraMotionBlur, TAA history. Should be designed after depth lands.

### TAA history buffer (Silver — `@flighthq/types` change)

Real TAA needs `historyTarget: WgpuRenderTarget | null` on `WgpuRenderEffectPipeline`. Must be added to both GL and Wgpu pipeline types for symmetry. `destroyWgpuRenderEffectPipeline` would need to free the history target. First effect with cross-frame retained state — design deliberation warranted.

### Rust crate mirror / functional test scenes (Gold)

The `flighthq-effects-wgpu` Rust crate and associated functional test scenes are Gold scope. The WGSL shader bodies are plain string constants and can be extracted as a shared step when shaders stabilize. Full port should begin after depth/velocity/TAA paths are settled so the pipeline shape is stable.

### Compute-shader paths / half-res HDR (Gold)

Bloom downsample, SSAO, and gaussian blur as WGSL compute passes; half-resolution effect buffers with bilateral upsample; making `rgba16float` the default HDR band. Gold scope. Requires stable runner API.

### Effect-chain validation (Gold)

`validateWgpuRenderEffectChain(effects): RenderEffectChainIssue[] | null` — flags ordering hazards, HDR/depth/velocity mismatches. Gold scope, sentinel-returning (no throws).

## Design Choices Made

### Progressive bloom: mip-chain vs multi-tap Gaussian

Chose mip-chain (CoD/Unreal style) over a larger-radius multi-tap Gaussian for two reasons:

1. **Quality**: the mip-chain produces physically correct, spatially-varying bloom spread (wider at bright peaks, narrower at dim edges) rather than uniform Gaussian softness
2. **Performance**: each mip level is 1/4 the pixels of the previous; total work is O(4/3 × base) rather than O(n²) for a large Gaussian

The fallback to single-level Gaussian below 16×16 prevents degenerate behavior at minimal cost.

### SMAA: analytical area function vs embedded texture

The standard SMAA paper uses precomputed area (160×560, ~89KB uncompressed) and search (66×33, ~2KB) textures. For an in-package implementation, chose the **analytical area function** approach:

- Avoids binary texture embedding entirely
- Polynomial smooth-step approximation is visually indistinguishable at typical display resolutions
- Simpler cold-start (no GPU texture upload for LUTs on first use)
- Smaller bundle footprint

Trade-off: the analytical function is a polynomial fit, not the exact precomputed values. For applications that need exact SMAA conformance (e.g. precise render regression testing), a future `applySmaaWithLutToWgpu` variant could embed the binary textures. The current implementation is labeled as "analytical" in the file header to make this explicit.

### GL taxonomy migration: clean break vs dual-band

Chose a **clean break** — effects moved to their canonical band, legacy names kept as aliases where callers might rely on them. The alternative (keeping effects in both old and new bands for backward compatibility) would have created confusion about which band "owns" an effect at runtime. Since this is pre-release with no external consumers, the clean break is preferable.

## Suggestions for Future Sessions

1. **Land the depth attachment in `render-wgpu`** — single keystone unblocking six placeholder effects. Should be coordinated with `render-gl`/`effects-gl`.
2. **`rgba16float` HDR target** — make the effect pipeline default to HDR format for the bloom/tonemap path; the pool and pipeline plumbing already support `format: 'rgba16float'`.
3. **Effect-chain validation** — `validateWgpuRenderEffectChain` as a Gold task once the full set of depth/velocity/TAA deps are settled.
4. **Rust crate** — extract WGSL shaders to a shared constants file first (preparatory step), then port the pipeline structure to `flighthq-effects-wgpu`.
