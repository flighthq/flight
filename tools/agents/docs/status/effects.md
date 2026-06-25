# @flighthq/effects — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging gitignored `dist/*.js` (impl + comments) with `dist/*.d.ts` (types) and reconstructing `dist/*.test.js` (the validated "camera pattern"). Compared every `dist` module's exported functions against `src/`; 23 modules had no `src/` counterpart. All existing `src/` files were complete (no per-function gaps). None of the 23 implement a deliberately-dropped concept, so the recover/park split was driven entirely by whether the required `@flighthq/types` type was present (hard boundary: cannot edit `@flighthq/types`).

### Recovered (13 modules, src + colocated test, added to `index.ts`)

Substrate-agnostic recipe math, all alias-safe / out-param / zero-alloc:

- `colorScienceMath` — HSL/Oklab/sRGB-linear conversions + Rec.709/Rec.2020 luminance weights (no type deps).
- `colorTemperatureMath` — Kelvin→RGB (Tanner-Helland) + white-balance multipliers (no type deps).
- `depthMath` — DoF circle-of-confusion, linear-depth, SSAO hemisphere kernel (no type deps; private `halton`).
- `edgeDetectMath` — Sobel outline/sketch edge params (`OutlineEffect`, `SketchEffect`).
- `gaussianMath` — sigma↔radius, separable pass count, 1D Gaussian kernel (no type deps).
- `godRaysMath` — accumulation scale, light center, per-sample weight, step size (`GodRaysEffect`).
- `kuwaharaMath` — Gaussian sector weights, sector offsets/size/pixel-count (`KuwaharaEffect`).
- `lutMath` — 3D-LUT strip UV coord + tile layout (no type deps).
- `renderEffectDefaults` — per-kind default table; `getRenderEffectDefaults`, `normalizeRenderEffect` (`RenderEffect`; string-keyed table, no per-effect type deps).
- `renderEffectInterpolation` — `canLerpRenderEffects`, `lerpRenderEffect` for tween/timeline (`RenderEffect`).
- `stylizeMath` — CRT mask, halftone cell, scanline params, Bayer matrix (no type deps).
- `toneMapMath` — ACES/AgX/filmic/Reinhard/Uncharted2 operators + ACES matrices (no type deps).

Note: `renderEffectDefaults`'s default table carries string-keyed entries for effect kinds whose types do not yet exist (AutoExposure, BarrelDistortion, etc.) and for fields not yet on existing types (Bloom `thresholdKnee`/`mipCount`). This compiles because the table is `Record<string, Record<string, unknown>>` — kinds/fields are data, not type references — and matches the dist behavior the tests assert.

### Skipped as fossil

None. No recovery candidate implemented a deliberately-dropped/deprecated concept (no DisplayObject cacheAsBitmap/scrollRect/opaqueBackground, Loader, Stage setters, Bitmap, or Video work was present in `effects/dist`).

### Parked (11 modules — each needs a type/field absent from `@flighthq/types`)

Hard boundary forbids editing `@flighthq/types`; each module reads a type (or type fields) that is not present, so recovering it would not type-check without a types-package change:

- `autoExposureEffect` — needs `AutoExposureEffect`.
- `barrelDistortionEffect` — needs `BarrelDistortionEffect`.
- `bloomMath` — needs `BloomEffect.mipCount` / `mipWeights` / `thresholdKnee` (current `BloomEffect` lacks them) AND would re-export `computeBloomBlurRadius`, which already lives in `bloomEffect.ts` (duplicate export collision).
- `cdlMath` — needs `CdlValues` (`LiftGammaGainEffect` exists, `CdlValues` does not).
- `colorBlindSimulationEffect` — needs `ColorBlindSimulationEffect`.
- `contactShadowsEffect` — needs `ContactShadowsEffect`.
- `customShaderEffect` — needs `CustomShaderEffect`.
- `filmEmulationEffect` — needs `FilmEmulationEffect`.
- `panniniProjectionEffect` — needs `PanniniProjectionEffect`.
- `renderEffectInputs` — needs `RenderEffectInput`.
- `renderEffectValidation` — needs `RenderEffectInput` (and imports parked `renderEffectInputs`).
- `volumetricLightEffect` — needs `VolumetricLightEffect`.

(The companion `*Effect` constructor modules for these kinds — e.g. `autoExposureEffect`, `volumetricLightEffect` — are also absent from `src/` and parked for the same reason; their `create*` factories depend on the missing interface.)

When those types are added to `@flighthq/types`, these 12 modules can be recovered from `dist` with the same merge procedure.

### Test result

`npm run test --workspace=packages/effects`: 56 files / 230 tests passed (was 43 files; +13 recovered modules each with a colocated test). No other-package failures encountered.

## 2026-06-25 — builder R2-4 second-pass recovery

The parallel types pass restored the effect interfaces parked in the first pass. With those types now present in `@flighthq/types`, ten of the twelve parked modules are recoverable. Two remain parked on field-level / mutability gaps in their types (not missing imports — editing `@flighthq/types` is out of scope for this pass).

### Recovered

Each merged from `dist/*.js` (impl + comments verbatim) with `dist/*.d.ts` (param/return types), plus its colocated test from `dist/*.test.js`, and added to `src/index.ts` (alphabetized):

- `autoExposureEffect` — `createAutoExposureEffect`.
- `barrelDistortionEffect` — `createBarrelDistortionEffect`.
- `colorBlindSimulationEffect` — `createColorBlindSimulationEffect`.
- `contactShadowsEffect` — `createContactShadowsEffect`.
- `customShaderEffect` — `createCustomShaderEffect` (required, non-defaulted `options`).
- `filmEmulationEffect` — `createFilmEmulationEffect`.
- `panniniProjectionEffect` — `createPanniniProjectionEffect`.
- `volumetricLightEffect` — `createVolumetricLightEffect`.
- `renderEffectInputs` — `getRenderEffectInputs`, `getRenderEffectKinds`, `RENDER_EFFECT_KINDS` (with the module-private `RENDER_EFFECT_INPUTS` per-kind table moved to the bottom of the file after the exported functions, per source style).
- `renderEffectValidation` — `validateRenderEffectList` (sentinel-style `RenderEffectInput | null`).

### Skipped (fossil)

None this pass. All twelve previously-parked modules are genuine effect/pipeline source; the dropped-concept list (DisplayObject cacheAsBitmap/scrollRect, OpenFL Loader, Stage setters, Bitmap pixelSnapping, lifecycle signals, traversal wrappers) does not touch the effects package.

### Parked

- `bloomMath` — its three multi-mip functions (`computeBloomMipCount`, `computeBloomMipWeights`, `computeBloomThresholdKnee`) read `BloomEffect.mipCount` / `mipWeights` / `thresholdKnee`, none of which exist on the current `BloomEffect` interface, and its `computeBloomBlurRadius` would duplicate the export already living in `bloomEffect.ts`. Recover once those fields are added to `BloomEffect` (and the duplicate radius helper resolved).
- `cdlMath` — `computeCdlFromLiftGammaGain` and `createCdlValues` write into the tuple elements of a `CdlValues` out-parameter (`out.slope[0] = …`, `cdl.slope[0] = 2` in the test), but the current `CdlValues` declares `slope`/`offset`/`power` as `readonly [number, number, number]`. The out-param contract needs a mutable `CdlValues`; recover once the tuples are non-readonly.

### Test result

`npm run test --workspace=packages/effects`: 66 files / 263 tests passed (was 56 files / 230; +10 recovered modules each with a colocated test). No other-package failures encountered.
