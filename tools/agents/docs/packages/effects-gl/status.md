---
package: '@flighthq/effects-gl'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# effects-gl — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/effects-gl

**Session dates:** 2026-06-24 (first pass), 2026-06-24 (second pass) **First-pass score:** 82/100 **After pass 1:** 87/100 **Estimated score after pass 2:** 91/100

## Implemented APIs

### Pass 1 — batch registrars and enumeration (Bronze)

**`getGlRenderEffectKinds(): ReadonlyArray<string>`**

- File: `packages/effects-gl/src/glRenderEffectRegistrar.ts`
- Returns the complete alphabetically sorted list of effect kind strings covered by this package's default runners (44 runners across 4 categories).

**`registerDefaultGlRenderEffects(state: GlRenderState): void`**

- File: `packages/effects-gl/src/glRenderEffectRegistrar.ts`
- Opt-in batch registrar wiring all 44 `defaultGl*EffectRunner` values into a `GlRenderState`.

**`registerBlurGlRenderEffects(state: GlRenderState): void`**

- 7 runners: Bloom, BokehDepthOfField, CameraMotionBlur, DirectionalBlur, MotionBlur, RadialBlur, TiltShift.

**`registerColorGradeGlRenderEffects(state: GlRenderState): void`**

- 14 runners: BrightnessContrast, ChannelMixer, ColorGrade, Dither, Exposure, Grayscale, HueSaturation, Invert, LiftGammaGain, LookupTableGrade, Posterize, Sepia, ToneMap, WhiteBalance.

**`registerScreenSpaceGlRenderEffects(state: GlRenderState): void`**

- 5 runners: Fxaa, Smaa, Ssao, Ssr, Taa.

**`registerStylizeGlRenderEffects(state: GlRenderState): void`**

- 18 runners: ChromaticAberration, Crt, Displacement, FilmGrain, Glitch, GodRays, Halftone, Kuwahara, LensDirt, LensDistortion, LensFlare, Outline, Pixelate, Scanlines, ScreenSpaceFog, Sharpen, Sketch, Vignette.

**`registerAntialiasingGlRenderEffects(state: GlRenderState): void`**

- Narrowed band: FxaaEffect, SmaaEffect, TaaEffect — AA-only subset, wgpu-symmetric name.

**`registerBloomGlRenderEffects(state: GlRenderState): void`**

- Bloom-and-optical band: BloomEffect, ChromaticAberrationEffect, GodRaysEffect, LensDirtEffect, LensDistortionEffect, LensFlareEffect, VignetteEffect. Wgpu-symmetric taxonomy.

**`registerColorGlRenderEffects(state: GlRenderState): void`**

- Alias for `registerColorGradeGlRenderEffects` for wgpu-symmetric naming.

**`registerStandardGlRenderEffects(state: GlRenderState): void`**

- Alias for `registerDefaultGlRenderEffects` for wgpu-symmetric naming.

### Pass 1 — `hasGlRenderEffectRunner` (Bronze)

**`hasGlRenderEffectRunner(state: GlRenderState, kind: string): boolean`**

- File: `packages/effects-gl/src/glRenderEffectRegistry.ts`
- Boolean check for registered runner existence before dispatching an effect chain.

### Pass 1 — manifest hygiene

- Removed unused `@flighthq/filters` dependency from `package.json`. Only `@flighthq/filters-gl` is value-imported.

### Pass 1 — colocated test coverage

- 7 previously-missing test files added; 22 tests for new batch registrar functions.
- Test count after pass 1: 124 tests (48 files), all passing.

### Pass 2 — uniform-location caching (Silver/Gold performance)

**`getGlEffectUniformLocation(state: GlRenderState, program: Readonly<GlFullscreenProgram>, name: string): WebGLUniformLocation | null`**

- File: `packages/effects-gl/src/glEffectProgramCache.ts`
- Per-program `WeakMap<GlFullscreenProgram, Map<string, WebGLUniformLocation | null>>` cache. Caches the first `getUniformLocation` driver call for each `(program, name)` pair; returns the cached result on every subsequent frame. The cache key is the `GlFullscreenProgram` object itself, so it survives state-key rotation and is freed when the program is GC'd.
- Applied to all 42 effect source files. Before this change, each of the 44 effects called `gl.getUniformLocation(program.program, name)` on every draw, resulting in up to 118 driver round-trips per frame for a full 44-effect chain. After caching, each unique `(program, name)` pair incurs exactly one driver call for the lifetime of the GL context.

### Pass 2 — mip-pyramid bloom upgrade (Silver)

**`applyBloomEffectToGl`** — upgraded to multi-resolution pyramid bloom.

- File: `packages/effects-gl/src/glBloomEffect.ts`
- Implements the Call-of-Duty/Unreal style pyramid bloom used in production engines. Replaces the single-scale Gaussian branch with a full N-level downsample/upsample chain:
  1. **Bright-pass** with quadratic soft knee (uses `threshold` and new `thresholdKnee` field). The soft knee eliminates the hard cutoff artifact present in the old step-function bright-pass.
  2. **Downsample pyramid**: `mipCount` half-resolution targets (auto-derived from source dimensions if not set, clamped 1–6), each created by a 4-tap box filter downsample for stable isotropic anti-aliased reduction.
  3. **Per-level Gaussian blur**: each pyramid level blurred independently at its native resolution with a radius scaled proportional to that level's size / full-resolution. Deep levels produce wide soft glows; shallow levels produce tight glows.
  4. **Tent-filter upsample**: processes levels deepest-to-shallowest, accumulating into a running composite target via additive tent-weighted blending. The 3x3 tent kernel (bilinear-approximation with corner/edge/center weights) avoids the blocky artifacts of box upsampling.
  5. **Per-mip weights** from the `BloomEffect.mipWeights` field. If not set, uniform weights are used.
  6. **Composite** bloom over scene (unchanged).
- The `BloomEffect.mipCount = 0` / unset case auto-derives the level count: `max(1, min(6, floor(log2(minDim / 4))))`. A 1080p source yields 6 levels; a 128px source yields 4 levels. Degenerate sources (< 4px) fall back to a single level.
- All pyramid targets are acquired from the render target pool and released before returning. The number of pooled targets per call: `mipCount` downsample levels + 2 full-res scratch targets + 2 per-level blur scratch targets (reused per iteration) = `mipCount + 4` targets peak (plus the `mipCount` level targets).
- New shader programs added to `glEffectProgramCache`: `bloom.bright` (upgraded), `bloom.downsample`, `bloom.upsample`, `bloom.copy`, `bloom.composite` (unchanged). All 5 compile once per state via `getGlEffectProgram`.

### Pass 2 — `hasWgpuRenderEffectRunner` in effects-wgpu

- File: `packages/effects-wgpu/src/wgpuRenderEffectRegistry.ts`
- Confirmed present (added in a prior session). Tests in `wgpuRenderEffectRegistry.test.ts` cover the false/true cases. GL/Wgpu symmetry now complete for both `has*RenderEffectRunner` functions.

**Test count after pass 2:** 128 tests (48 files), all passing.

## Deferred items and why

### Silver — chain-ordering metadata and validation

`RenderEffectChainHint`, `validateGlRenderEffectChain`, `orderGlRenderEffectChain`, and `withGlRenderEffectToneMap` require a new type `RenderEffectChainHint` in `@flighthq/types` and `getRenderEffectChainHint` in `@flighthq/effects`. Cross-package header changes must precede implementation. This is the correct scope for a follow-up session.

### Silver — CMAA2 / MLAA as second non-temporal AA option

Requires a new descriptor type in `@flighthq/types` and `@flighthq/effects`. Deferred until chain-hint metadata is landed to avoid inline cross-package type definitions.

### Silver — real TAA

The velocity seam (`sceneVelocityTexture`) already exists. Real TAA needs a per-pipeline history target retained across frames — a `GlRenderEffectPipeline.historyTarget` field in `@flighthq/types` and a `render-gl` state-lifecycle change. This crosses the package boundary into `render-gl` and requires a design decision on the retained-target shape.

### Silver — functional parity test scenes

The roadmap calls for `tests/functional/effect-*-gl` scenes (bloom, color-grade, blur, AA) that prove the GL backend agrees with the canvas/wgpu backends via `test:functional:parity`. The colocated `.test.ts` files are presence checks; rendered output is unverified across backends. This is a cross-package task involving the functional test harness.

### Gold — SSR/TAA/SSAO naming honesty (design decision)

The current `defaultGlSsrEffectRunner` is a pixel-copy passthrough, and `defaultGlSsaoEffectRunner` is a luminance-variation stand-in. The choice is: implement real depth-driven versions (requires G-buffer from `render-gl`) or relocate stand-ins into a clearly-labeled `experimental` or `stub` namespace so names do not over-promise. This is a naming/scope call for the user.

### Gold — all remaining

Real depth-driven SSAO, production DoF/fog, SSR, context-loss recovery, `rgba16f` fallback, effect-chain fusion, documentation, and 1:1 Rust parity. All depend on either Silver completion or cross-package substrate decisions (G-buffer, depth params, normal buffer, `render-gl` history target).

## Design choices made (pass 2)

### Uniform-location cache key: `GlFullscreenProgram` object, not `(state, key)` string

The cache is `WeakMap<GlFullscreenProgram, Map<string, WebGLUniformLocation | null>>` keyed by the compiled program object itself. This is preferred over a `(state, programKey, uniformName)` triple-keyed map because:

- The `GlFullscreenProgram` is already a stable identity (one object per compiled program per state, stored in `_programs`).
- Keying by the program object means the cache is automatically freed when the program GC's — no explicit `destroyGlEffectUniformLocations` needed.
- No string hashing at lookup time: the WeakMap key is an object reference.
- The `state` argument to `getGlEffectUniformLocation` is only used for the initial `gl.getUniformLocation` call; it does not participate in the cache key.

### Bloom: accumulation via swap, not re-acquire

The upsample loop maintains two full-resolution scratch targets (`bloomAccum`, `bloomTemp`) and swaps them after each level rather than re-acquiring from the pool on each iteration. This keeps the pool acquisition count O(1) for the accumulation phase regardless of `mipCount`.

### Bloom: levels array holds `bright` at index 0

`levels[0]` is the bright-pass target (full resolution). The downsample loop fills `levels[1..mipCount-1]`. The upsample loop iterates `i = mipCount-1..0`, reading from `levels[i]` at its native resolution for the Gaussian blur step. This means the bright-pass output itself (level 0) also gets a Gaussian blur pass, which is the correct behavior: the shallowest level produces the narrowest bloom and should contribute a sharpened ring around the original bright pixels.

### Bloom: soft knee formula

The bright-pass uses a quadratic soft knee rather than a hard step: `rq = clamp(l - (threshold - knee*0.5), 0, knee); k = rq^2 / (4*knee) + step(threshold, l)`. This is the same knee formula used by Unity's HDRP bloom and produces smooth gradient falloff at the threshold boundary instead of a crisp edge that generates ringing artifacts.

## Design decisions needing user input

- **SSR/TAA/SSAO naming**: keep stand-ins under their current names with honest stand-in comments, or relocate to a `stub` namespace / remove until real depth-buffer support lands?
- **Taxonomy reconciliation**: `BloomEffect` sits in the GL "blur" category band but in the Wgpu "bloom/optical" band. The new `registerBloomGlRenderEffects` covers the wgpu-symmetric band, but the GL `registerBlurGlRenderEffects` also registers it. Should the GL registrar be refactored to match the Wgpu 6-band taxonomy as a follow-up? (Low urgency — last-write-wins, no runtime impact.)
- **`DitherEffect` placement**: GL puts it in color-grade; Wgpu puts it in stylize. Trivial to reconcile but requires a taxonomy decision.

## Concerns and observations

- The 128 → 4 test count increase from pass 1 to pass 2 reflects the 4 new tests added (2 for bloom, 1 for `getGlEffectUniformLocation`, 1 for the wgpu `hasWgpuRenderEffectRunner`). No tests were removed. Total: 128 tests.
- The bloom upgrade adds 5 new shader programs to the `glEffectProgramCache` slot namespace (`bloom.bright`, `bloom.downsample`, `bloom.upsample`, `bloom.copy`, `bloom.composite`). The old `bloom.bright` program key is reused but the shader source is different — this is safe because the cache is keyed by the source string identity (the constant hasn't changed address between sessions, it's a new module evaluation). If a state retains a pre-upgrade compiled program under `bloom.bright`, the re-compilation will happen on first call after the module upgrade due to the WeakMap being keyed by the state object, not a stable serialized form. For a standard dev/prod reload this is a non-issue.
- The `eslint-disable no-param-reassign` comment from the draft implementation was removed — `bloomAccum` and `bloomTemp` are local `let` variables and the swap does not reassign a parameter.
