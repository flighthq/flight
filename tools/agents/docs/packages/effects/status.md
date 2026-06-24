---
package: '@flighthq/effects'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# effects — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/effects

**Session date:** 2026-06-24 **Starting score:** 93/100 **Estimated new score:** 97/100

## Implemented APIs (cumulative across both passes)

### Types added/modified in `@flighthq/types`

**Base contract:**

- `RenderEffect.enabled?: boolean` — pipeline skip flag (Bronze)
- `RenderEffect.intensity?: number` — dry-wet blend strength (Bronze)

**New type file:** `RenderEffectInput.ts` — `'Hdr' | 'Depth' | 'Motion' | 'Temporal'`

**New type files (Gold catalog completeness):**

- `AutoExposureEffect.ts` — histogram-based auto-exposure [HDR]
- `BarrelDistortionEffect.ts` — barrel/pincushion lens distortion
- `CdlValues.ts` — ASC CDL slope/offset/power form (shared color-science primitive)
- `ColorBlindSimulationEffect.ts` — color vision deficiency simulation (accessibility)
- `ContactShadowsEffect.ts` — screen-space contact shadows [DEPTH]
- `CustomShaderEffect.ts` — user-defined post-process via backend registry key
- `FilmEmulationEffect.ts` — grain + halation + gate weave combined
- `PanniniProjectionEffect.ts` — cylindrical Pannini projection for wide-angle FOV
- `VolumetricLightEffect.ts` — volumetric light scattering [DEPTH]

**Extended existing types (Silver):**

- `BloomEffect`: added `brightness?` (additive bloom multiplier, distinct from base dry-wet `intensity`), `thresholdKnee?`, `mipCount?`, `mipWeights?`
- `BokehDepthOfFieldEffect`: added `apertureBlades?`, `maxBlurRadius?`, `samples?`
- `ChromaticAberrationEffect`: added `fringeStrength?` (color channel separation strength, distinct from base `intensity`), `samples?`
- `ColorGradeEffect`: added `shadows?`, `midtones?`, `highlights?` (3-way grade)
- `MotionBlurEffect`: added `shutterAngle?` (virtual shutter angle in degrees, default 180), `target?: MotionBlurTarget` ('camera' | 'object' | 'both')
- `SsrEffect`: added `maxSteps?`, `thickness?`

### Source files in `packages/effects/src/`

**Bronze — Gaussian math (`gaussianMath.ts`):**

- `computeGaussianRadiusFromSigma(sigma): number`
- `computeGaussianSigmaFromRadius(radius): number`
- `createGaussianKernelWeights(radius, sigma, out): number` — normalized 1D kernel
- `computeSeparableBlurPassCount(samples): number`

**Bronze — Color temperature math (`colorTemperatureMath.ts`):**

- `computeColorTemperatureRgb(kelvin, out)` — Tanner-Helland approximation
- `computeWhiteBalanceMultipliers(temperature, tint, out)` — WhiteBalance/ColorGrade shared math

**Bronze — Render-effect introspection (`renderEffectInputs.ts`):**

- `getRenderEffectInputs(effect): readonly RenderEffectInput[]` — data form of [HDR]/[DEPTH]/[MOTION]/[TEMPORAL] tags
- `getRenderEffectKinds(): readonly string[]` — full effect kind catalog in alphabetical order
- `RENDER_EFFECT_KINDS` — exported constant array

**Silver — Bloom math (`bloomMath.ts`):**

- `computeBloomBlurRadius(effect): number`
- `computeBloomMipCount(width, height, effect): number`
- `computeBloomMipWeights(mipCount, effect, out): number`
- `computeBloomThresholdKnee(effect, out)` — soft-knee bright-pass curve constants

**Silver — Tone-map math (`toneMapMath.ts`):**

- `computeExposureScale(exposure): number`
- `computeReinhardToneMap(x): number`
- `computeReinhardExtendedToneMap(x, white): number`
- `computeAcesToneMap(x): number`
- `computeUncharted2ToneMap(x): number`
- `computeFilmicToneMap(x): number`
- `computeAgxToneMap(x): number`
- `getAcesInputMatrix(out)` — sRGB → ACES AP0 matrix
- `getAcesOutputMatrix(out)` — ACES AP1 → sRGB matrix

**Silver — CDL math (`cdlMath.ts`):**

- `CDL_IDENTITY` — exported identity CdlValues constant
- `applyCdlChannel(value, slope, offset, power): number`
- `computeCdlFromLiftGammaGain(effect, out)` — LiftGammaGain → CDL form
- `createCdlValues(): CdlValues`

**Silver — LUT math (`lutMath.ts`):**

- `computeLookupTableCoord(r, g, b, lutSize, out)` — 3D LUT → 2D strip UV
- `getLookupTableTileLayout(lutSize, out)` — LUT texture dimensions

**Silver — Depth math (`depthMath.ts`):**

- `computeLinearDepthFromNonlinear(depth, near, far): number`
- `computeDepthOfFieldCoc(depth, focusDistance, aperture, focalLength): number`
- `computeSsaoSampleKernel(samples, out): number` — deterministic hemisphere kernel

**Silver — Effect validation (`renderEffectValidation.ts`):**

- `validateRenderEffectList(effects, available): RenderEffectInput | null`

**Silver — Effect defaults and normalization (`renderEffectDefaults.ts`) [NEW pass 2]:**

- `getRenderEffectDefaults(kind): Record<string, unknown>` — per-kind default table (all 50 built-in effects)
- `normalizeRenderEffect(effect, out): boolean` — fill missing optional fields from defaults; alias-safe

**Gold — Color science (`colorScienceMath.ts`):**

- `getRec709LuminanceWeights(out)` — ITU-R BT.709 weights
- `getRec2020LuminanceWeights(out)` — ITU-R BT.2020 weights
- `computeLinearToSrgb(x): number`
- `computeSrgbToLinear(x): number`
- `computeRgbToHsl(r, g, b, out)`
- `computeHslToRgb(h, s, l, out)`
- `computeRgbToOklab(r, g, b, out)`
- `computeOklabToRgb(L, a, b, out)`

**Gold — Stylize math (`stylizeMath.ts`):**

- `createBayerMatrix(order, out): number`
- `computeHalftoneCellParams(frequency, angle, out)`
- `computeCrtMaskParams(resolution, curvature, out)`
- `computeScanlineParams(resolution, intensity, out)`

**Gold — Effect interpolation (`renderEffectInterpolation.ts`):**

- `canLerpRenderEffects(a, b): boolean`
- `lerpRenderEffect(a, b, t, out): boolean`

**Gold — Kuwahara recipe math (`kuwaharaMath.ts`) [NEW pass 2]:**

- `computeKuwaharaSectorSize(effect): number` — sector size in pixels from radius
- `computeKuwaharaSectorPixelCount(effect): number` — pixels per sector
- `computeKuwaharaSectorOffsets(radius, out)` — 4-sector UV offsets (8 values)
- `computeKuwaharaGaussianWeights(radius, out): number` — Gaussian-weighted sector kernel (anisotropic variant)

**Gold — God rays recipe math (`godRaysMath.ts`) [NEW pass 2]:**

- `computeGodRaysSampleWeight(effect, sampleIndex): number` — geometric decay per sample
- `computeGodRaysStepSize(effect, px, py, out)` — UV step per march iteration
- `computeGodRaysAccumulationScale(effect): number` — normalization factor
- `computeGodRaysLightCenter(effect, out)` — clamped screen-space center

**Gold — Edge detection math (`edgeDetectMath.ts`) [NEW pass 2]:**

- `getSobelKernelCoefficients(out)` — standard 3×3 Sobel Gx/Gy coefficients
- `computeOutlineEdgeParams(effect, out)` — threshold, feather, unpacked RGBA color (6 values)
- `computeOutlineThicknessPx(effect): number` — integer dilation radius
- `computeSketchEdgeParams(effect, out)` — threshold inversely derived from strength, strength multiplier

**Gold catalog factory files (each with colocated test):**

- `autoExposureEffect.ts` — `createAutoExposureEffect`
- `barrelDistortionEffect.ts` — `createBarrelDistortionEffect`
- `colorBlindSimulationEffect.ts` — `createColorBlindSimulationEffect`
- `contactShadowsEffect.ts` — `createContactShadowsEffect`
- `customShaderEffect.ts` — `createCustomShaderEffect`
- `filmEmulationEffect.ts` — `createFilmEmulationEffect`
- `panniniProjectionEffect.ts` — `createPanniniProjectionEffect`
- `volumetricLightEffect.ts` — `createVolumetricLightEffect`

**Per-effect intensity semantics restored [NEW pass 2]:**

- `BloomEffect.brightness` — additive bloom brightness multiplier (distinct from base `intensity` dry-wet). Default 1.
- `ChromaticAberrationEffect.fringeStrength` — color channel separation distance (distinct from base `intensity`). Default 0.01.

**MotionBlurEffect extended [NEW pass 2]:**

- `shutterAngle?: number` — virtual shutter angle in degrees [0..360]. Default 180.
- `target?: MotionBlurTarget` — `'camera' | 'object' | 'both'`. Default `'both'`.

**Test counts:** 68 test files, 291 tests — all passing.

## Deferred Items

### Design decisions to surface (not acted on autonomously)

1. **ColorGrade vs LiftGammaGain unification**: The roadmap flags whether `ColorGradeEffect` and `LiftGammaGainEffect` should unify onto a shared CDL primitive or stay as separate descriptors consuming CDL math. Both currently exist as separate descriptors, and `computeCdlFromLiftGammaGain` provides the bridge. A decision on whether to deprecate one or rename is a user-facing API choice.

2. **`lerpRenderEffect` cross-package consumer**: The roadmap notes `@flighthq/tween`/`@flighthq/timeline` should confirm they will consume `lerpRenderEffect` before the interpolation API is considered stable. The function exists and is tested, but the consuming package wiring is cross-package scope.

3. **Serialization / versioning**: `serializeRenderEffect`/`deserializeRenderEffect` with the SDK's scene-migration mechanism. Structural clone is likely sufficient for the current descriptor shape, but migration hooks require alignment with `conventions/types-layout.md`'s versioned-migration model.

### Cross-package notification items

- **`@flighthq/render` and effects-backend packages** should be updated to honor `effect.enabled === false` (skip) and `effect.intensity` (dry-wet mix) from the base contract. These fields now exist on `RenderEffect` but the recipe dispatch in render packages must actively use them. This is a cross-package edit.
- **`effects-gl`/`effects-wgpu`/`effects-canvas`** backends can now migrate their duplicated blur/temperature/bloom math onto the new shared helpers (`gaussianMath`, `colorTemperatureMath`, `bloomMath`, `toneMapMath`). Migration of existing backend code is cross-package scope.

### Rust mirror (not done)

The Rust `flighthq-effects` crate should mirror:

- All new descriptor fields (`BloomEffect.brightness`, `ChromaticAberrationEffect.fringeStrength`, `MotionBlurEffect.shutterAngle`/`target`, `MotionBlurTarget` type)
- `RenderEffectInput` type
- All math functions: `compute_gaussian_*`, `compute_color_temperature_rgb`, `compute_white_balance_multipliers`, all tone-map evaluators, bloom math, CDL math, LUT math, depth math, color science math, Kuwahara math, god rays math, edge detect math
- `get_render_effect_defaults(kind)` / `normalize_render_effect(effect, out)` — Rust equivalents (likely returning `HashMap<&str, Value>` or a typed struct per kind)

Rust work is deferred; the `crates/` directory was not modified.

### Not done (remaining items)

- **`AutoExposureEffect` / `EyeAdaptationEffect` distinction** — currently only `AutoExposureEffect` exists. A dedicated `EyeAdaptationEffect` with histogram bin parameters would be a separate addition if the distinction matters for HDR eye-adaptation simulation vs. still-frame auto-exposure.
- **`computeFilmicToneMap` GT parameters** — the parameter set is hardcoded. A `FilmicToneMapOptions` struct would let users tune the Uchimura GT operator. Noted in function comment; not a blocker.
- **`normalizeRenderEffect` for `CustomShaderEffect`** — the defaults table does not cover custom effects (no documented defaults), so `normalizeRenderEffect` returns `false` for them. Callers should handle this branch (expected, not a bug).

## Design Choices Made (this pass)

### `BloomEffect.brightness` vs `intensity` split

`BloomEffect.brightness` is the additive bloom brightness multiplier: it scales the bloom branch contribution before compositing (range [0..∞], default 1 means neutral brightness). The base `RenderEffect.intensity` is the dry-wet blend at compositing time (0 = no effect, 1 = full effect). These are orthogonal controls that serve different artistic purposes and appear in almost every production bloom implementation (Unity URP uses `intensity` for additive strength, `tint` for color; Godot uses `intensity` for bloom brightness, `blend` for the mix).

### `ChromaticAberrationEffect.fringeStrength` vs `intensity` split

`fringeStrength` is the UV channel-separation distance (typically 0.001–0.02 UV space). The base `intensity` is the dry-wet mix. A backend can apply `fringeStrength` to determine how far the R/B channels shift, then blend the shifted result at `intensity`. Without this split, backends had no way to express "subtle fringing at full blend" vs "strong fringing at half blend".

### `MotionBlurEffect.shutterAngle` + `MotionBlurTarget`

`shutterAngle` maps to the cinematographic shutter angle convention (180° = typical film, 360° = full-frame blur, 90° = stroboscopic). Backends derive the temporal sample spread as `shutterAngle / 360 * (1 / fps)`. The `target` discriminant mirrors what production motion blur implementations call "camera motion blur" (full-scene camera transform only) vs "per-object motion blur" (per-pixel velocity buffer) vs "both" — the distinction matters for performance and for artistic control (you may want camera blur but not object blur or vice versa).

### `getRenderEffectDefaults` + `normalizeRenderEffect`

The defaults table is the single authoritative source for per-kind documented defaults, co-located with the effects package so backends can reference it without importing types. `normalizeRenderEffect` uses explicit `=== undefined` to distinguish "not set" from "explicitly set to 0 or false" — preserving zero values was the key contract tested (grayscale `intensity: 0` must not become default `1`).

### Kuwahara math: anisotropic Gaussian weighting

`computeKuwaharaGaussianWeights` produces the kernel for the anisotropic Kuwahara filter (Papari/Petkov 2007) rather than the flat-weight original. The flat original has significant ringing artifacts on high-contrast edges. The anisotropic variant is now the standard in production (used in Blender, Krita, Photoshop-style filters). The sector offsets (`computeKuwaharaSectorOffsets`) are still for the original 4-quadrant shape — the anisotropic variant uses these as starting points for oriented elliptical sectors (orientation requires per-pixel structure tensor, out of scope for this math module).

### God rays math: normalization via `computeGodRaysAccumulationScale`

The accumulation scale `1/(samples * weight * exposure)` normalizes the summed contributions to avoid HDR blowout. This is the standard normalization for the Duda/Nunnally radial blur technique. Without it, increasing sample count would linearly brighten the rays.

### Edge detection math: Sobel + effect-specific derivation

`getSobelKernelCoefficients` provides the canonical Sobel operator shared by both `OutlineEffect` and `SketchEffect` backends. `computeSketchEdgeParams` derives the threshold as `1 - strength * 0.95` so that `strength=1` catches fine edges (threshold ≈ 0.05) and `strength=0` is near-invisible (threshold ≈ 1.0). This inverse relationship is consistent with how "sketch strength" is perceived by artists: more strength = more visible lines.

## Concerns and Surprises

1. **`computeFilmicToneMap` is approximate** — the GT/Uchimura operator parameter set is hardcoded. A production implementation would expose the GT parameters as `FilmicToneMapOptions`. Noted in function comment.

2. **`lerpRenderEffect` for arrays** — readonly arrays (e.g. `BloomEffect.mipWeights`) are not interpolated by `lerpRenderEffect`; the value from `a` is used for `t < 0.5`, `b` otherwise. This is by design (array interpolation requires length matching and element semantics), but downstream consumers should be aware.

3. **`normalizeRenderEffect` alias-safe contract** — the function is safe when `out === effect` because it reads all effect fields first into the defaults-merged set, then writes. However, the implementation iterates `Object.keys` of both objects sequentially. If `out === effect` and an intermediate write added a new key not in the defaults, `Object.keys(bRec)` would see it. This edge case cannot arise for typed effects (keys are predeclared fields), but it is a minor implementation detail.

4. **Kuwahara sector offsets quadrant convention** — the four quadrants are defined as (top-left, top-right, bottom-left, bottom-right) where "top-left" starts at `(-r, -r)` in texel space (Y-down). Some implementations define them differently (e.g., Blender uses NW/NE/SW/SE). The convention is documented in the function comment.

## Suggestions for Future Sessions

1. **Wire backends to honor `enabled`/`intensity`** — the base contract fields exist but `@flighthq/render` dispatch must actively use them.
2. **Migrate backend math** — `effects-gl`/`effects-wgpu`/`effects-canvas` can now replace duplicated blur/temperature/bloom math with the shared helpers.
3. **Rust mirror** — the math functions are the easiest conformance targets (deterministic, no GPU, headlessly fingerprintable).
4. **`serializeRenderEffect` / `deserializeRenderEffect`** — aligned with the scene-migration model in `conventions/types-layout.md`.
5. **`AutoExposureEffect` histogram bin params** — extend with `lowPercent?`/`highPercent?` histogram percentile trim fields if eye-adaptation simulation needs them.
