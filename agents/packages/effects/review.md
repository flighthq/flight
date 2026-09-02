---
package: '@flighthq/effects'
status: solid
score: 85
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# effects -- Review

## Verdict

**solid -- 85/100.** A broad, well-structured catalog of 54 substrate-agnostic effect descriptors plus deep, reference-grade recipe math. The descriptor layer satisfies Flight conventions cleanly: plain data, open `kind` contracts, `Readonly` parameters, `sideEffects: false`, no throws. The math layer is the standout -- Gaussian, ACES/Hable/AgX/Reinhard tone maps, Halton SSAO, thin-lens CoC, Sobel, W3C blend math, Kuwahara, god-rays, Bayer dither -- all named to their references, alias-safe, zero-alloc. What holds it short of authoritative: the defaults table drifts from its type definitions, `lerpRenderEffect` corrupts packed-color fields and has no external consumer, the ratified per-kind handler registration has not been built, and two continuous-pointwise ops remain here after the adjustments split.

## Present capabilities

**76 source files, 74 colocated test files, 382 test cases.** `sideEffects: false` honored. Zero `throw` statements (sentinel discipline clean). Two export lanes (`.` and `./contract`) correctly structured.

**Descriptor catalog (54 `create*Effect` factories).** One per kind, each a thin constructor over a `@flighthq/types` interface (`{ kind: 'X', ...options }`, `Readonly<Omit<X, 'kind'>>` options). Spans:

- Blurs: `BlurEffect` (separable Gaussian), `DirectionalBlurEffect`, `RadialBlurEffect`, `MotionBlurEffect`, `CameraMotionBlurEffect`, `BokehDepthOfFieldEffect`, `TiltShiftEffect`
- Bloom/HDR: `BloomEffect`, `AutoExposureEffect`, `GodRaysEffect`, `LensFlareEffect`, `LensDirtEffect`, `VolumetricLightEffect`, `ToneMapEffect`
- Screen-space 3D: `SsaoEffect`, `SsrEffect`, `ContactShadowsEffect`, `ScreenSpaceFogEffect`
- AA: `FxaaEffect`, `SmaaEffect`, `TaaEffect`
- Compositing: `BlendEffect`, `CompositeEffect`, `DropShadowEffect`, `InnerShadowEffect`, `InnerGlowEffect`, `OuterGlowEffect`, `BevelEffect`, `GradientBevelEffect`, `GradientGlowEffect`
- Lens: `BarrelDistortionEffect`, `LensDistortionEffect`, `ChromaticAberrationEffect`, `PanniniProjectionEffect`, `DisplacementEffect`, `BitmapDisplacementEffect`, `VignetteEffect`
- Stylize: `KuwaharaEffect`, `HalftoneEffect`, `DitherEffect`, `PosterizeEffect`, `PixelateEffect`, `CrtEffect`, `ScanlinesEffect`, `SketchEffect`, `OutlineEffect`, `GlitchEffect`, `FilmGrainEffect`, `FilmEmulationEffect`, `MedianEffect`, `SharpenEffect`, `ConvolutionEffect`
- Escape hatch: `CustomShaderEffect`
- Candidates for re-sort: `WhiteBalanceEffect`, `ToneMapEffect` (see Gaps)

**Recipe math modules (substrate-agnostic, zero-alloc):**

- `gaussianMath.ts` -- sigma-radius conversion, normalized 1D kernel, pass count (`computeGaussianRadiusFromSigma`, `computeGaussianSigmaFromRadius`, `computeSeparableBlurPassCount`, `createGaussianKernelWeights`)
- `gaussianKernel.ts` -- precomputed kernel weight tables (`computeGaussianKernelWeights`, `getGaussianKernelSize`)
- `linearSampledGaussian.ts` -- bilinear-tap-optimized Gaussian (`computeLinearSampledGaussian`, `getLinearSampledGaussianTapCount`)
- `boxBlurMath.ts` -- box-blur radius/pass (`computeBoxBlurRadius`, `computeBoxBlurPassRadius`)
- `blurDownsample.ts` -- mip-level resolution for downsample blur (`getBlurDownsampleLevel`, `getBlurResidualSigma`)
- `toneMapMath.ts` -- Reinhard, extended Reinhard, Narkowicz ACES, Hable Uncharted2, Lottes filmic (with `FilmicToneMapOptions`), Sobotka AgX (with `AgxToneMapOptions`), exposure scale, ACES I/O matrices
- `colorTemperatureMath.ts` -- Tanner-Helland Kelvin-to-RGB, white-balance multipliers
- `depthMath.ts` -- linear depth from nonlinear, thin-lens CoC, Halton SSAO sample kernel
- `godRaysMath.ts` -- Duda/Nunnally radial-blur accumulation, light center, sample weights, step size
- `kuwaharaMath.ts` -- anisotropic Papari/Petkov variant: Gaussian sector weights, sector offsets, pixel counts
- `edgeDetectMath.ts` -- Sobel 3x3, outline/sketch parameter derivation
- `stylizeMath.ts` -- CRT mask, halftone cell, scanline, Bayer ordered-dither matrix
- `blendModeMath.ts` -- W3C compositing spec: 9 separable modes, 4 non-separable HSL modes, dispatch
- `compositeOperatorMath.ts` -- Porter-Duff factor derivation
- `bloomEffect.ts` -- bloom threshold, intensity, blur radius

**Pipeline-support layer:**

- `renderEffectInputs.ts` -- `getRenderEffectInputs` (per-kind required buffers: HDR/Depth/Motion/Temporal), `getRenderEffectKinds` (53-kind catalog), `RENDER_EFFECT_KINDS` array
- `renderEffectDefaults.ts` -- `getRenderEffectDefaults`, `normalizeRenderEffect` (52-kind default table)
- `renderEffectValidation.ts` -- `validateRenderEffectList` (sentinel null on first unsatisfied input)
- `renderEffectInterpolation.ts` -- `canLerpRenderEffects`, `lerpRenderEffect` (runtime type introspection, snaps booleans/strings/arrays at t=0.5)
- `renderEffectPadding.ts` -- `computeRenderEffectPadding`, `explainRenderEffectPadding`, `registerRenderEffectPaddingResolver`, `getGaussianRenderEffectPadding`, `getDirectionalRenderEffectPadding` -- the state-scoped padding registry with registry-miss signal integration
- `renderEffectCaptureGeometry.ts` -- `computeRenderEffectCaptureGeometry` (substrate-independent capture bounds for 2D subtree effect chains)

**Padding resolvers registered per-kind (19 effects):** Blur, Bevel, BitmapDisplacement, Bloom, BokehDoF, ContactShadows, Convolution, DirectionalBlur, Displacement, DropShadow, Glitch, GradientBevel, GradientGlow, InnerGlow, InnerShadow, Median, OuterGlow, Outline, TiltShift. Each effect file exports `register*EffectPaddingResolver(state)` and a standalone `get*EffectPadding(effect)` for direct use.

## Gaps

1. **Defaults table drifts from type definitions.** `BloomEffect` defaults include `brightness`, `mipCount`, and `thresholdKnee` -- none of these are fields on `packages/types/src/BloomEffect.ts` (which has `threshold`, `intensity`, `radius`, `passes`). `SsrEffect` defaults include `maxSteps` and `thickness` -- absent from the type (which has `maxDistance`, `resolution`, `steps`). `MotionBlurEffect` defaults include `shutterAngle` and `target` -- absent from the type (which has `intensity`, `samples`). `getRenderEffectDefaults` and `normalizeRenderEffect` have no caller outside their own test -- the table was never wired into any pipeline, so the drift started wrong rather than accumulating.

2. **`lerpRenderEffect` corrupts packed-color fields and has no consumer.** The lerp introspects field types at runtime and treats every `number` as a scalar to lerp linearly. Packed-RGBA fields (`VignetteEffect.color`, `OutlineEffect.color`, `VolumetricLightEffect.lightColor`, etc.) are numbers, so animating between two colors lerps the integer -- channels bleed across byte boundaries producing garbage intermediate colors. There is no per-channel unpack/lerp/repack path and no field-role metadata to distinguish a color from a scalar. Furthermore, `lerpRenderEffect` has zero external consumers: only `packages/effects/src/` itself and its test import it; `tween` and `timeline` -- the packages it was built for -- never do.

3. **`CompositeEffect` missing from `RENDER_EFFECT_KINDS`.** The `createCompositeEffect` factory exists and is exported from `index.ts`, but `'CompositeEffect'` does not appear in the `RENDER_EFFECT_KINDS` array (`renderEffectInputs.ts`). This makes the catalog incomplete: `getRenderEffectKinds()` returns 53 kinds while 54 factories are exported.

4. **Per-kind handler registration not built.** The charter's Decision [2026-07-02] ratifies dissolving the three parallel hand-maintained tables (`RENDER_EFFECT_KINDS`, `RENDER_EFFECT_INPUTS`, `DEFAULTS`) into per-kind handler companions registered on pipeline state. This has not happened. The only registration system currently built is the padding resolver registry (`renderEffectPadding.ts`), which implements the pattern the charter describes. The defaults, inputs, and kinds tables remain central and manual.

5. **`RenderEffect` base type carries only `kind`.** The charter's Decision [2026-07-02] states backends must honor `enabled === false` (skip the pass) and `intensity` (dry-wet mix). However, `RenderEffect` at `packages/types/src/RenderEffect.ts` has no `enabled` or `intensity` field -- only `kind: Kind`. These are per-descriptor fields the backends read individually. The charter describes them as base-contract obligations, but the contract does not carry them.

6. **Two continuous-pointwise ops remain after the adjustments split.** The charter's "What it is" section (fork H ruling) states pointwise ops migrate to `@flighthq/adjustments`. `whiteBalanceEffect.ts` is exactly linear (its matrix builder already lives in `adjustments/src/colorMatrixMath.ts`), and `toneMapEffect.ts` is continuous pointwise and LUT-bakeable. Both are still in `effects`. Status.md flags this correctly; the migration is incomplete.

7. **`computeExposureScale` unit mismatch with runners.** `toneMapMath.ts:33` defines `computeExposureScale(exposure)` as EV stops (neutral at 0, returns `2^exposure`), tested accordingly. However, it has no consumer outside its test -- the backends take `exposure` as a raw linear multiplier (neutral at 1). The function survives because `1.0` looks neutral in both interpretations.

8. **`BloomEffect.passes` read by nothing.** Declared at `packages/types/src/BloomEffect.ts:8`, present in the defaults table, but no bloom runner in any backend reads `.passes`. An accepted-and-discarded field that typechecks and renders plausibly.

9. **No realization registry.** The ratified architecture calls for a `(kind, backend)` registry plus `explainEffectRealization` to provide backend coverage as queryable data. Neither name exists in the tree; backend coverage is only discoverable by grepping each backend package.

10. **No serialization/versioning.** No `serializeRenderEffect` / `deserializeRenderEffect`. The charter defers this to the SDK-wide serialization story (Decision [2026-07-02]).

## Charter contradictions

**One substantive contradiction, two tensions:**

- **Contradiction: base-contract `enabled`/`intensity` stated as decided but absent from the type.** Decision [2026-07-02] says "the base contract defines these fields" and "backends must honor" them. The actual `RenderEffect` type has only `kind`. The charter states a fact about the contract that is not true of the code.

- **Tension: per-kind handler registration decided but not built.** Decision [2026-07-02] ratifies dissolving central tables into per-kind handler companions. The padding resolver is the only registry actually implemented; the defaults, inputs, and kinds remain central tables. This is not a contradiction (the decision does not claim it is done), but the gap between the ratified architecture and the current code is substantial.

- **Tension: "52-kind catalog" count in charter is stale.** The charter's "What it is" says "52 effect kinds" and notes this "will drop as the pointwise kinds move." The pointwise ops have moved: the actual count is 54 factories (53 in `RENDER_EFFECT_KINDS` due to the missing `CompositeEffect`). The text acknowledges staleness but has not been updated.

## Contract & docs fit

**Lives up to the contract -- strongly.**

- `@flighthq/types`-first: every descriptor interface (`BlurEffect`, `BloomEffect`, etc.), `RenderEffectInput`, `CompositeOperator`, `AgxToneMapOptions`, `FilmicToneMapOptions` all defined in `@flighthq/types`. The package imports them, never redefines.
- Full unabbreviated names throughout: `computeGaussianRadiusFromSigma`, `computeRenderEffectCaptureGeometry`, `getDirectionalRenderEffectPadding`. `get*`/`compute*`/`create*`/`is*` verbs used correctly.
- Math functions write to `out` parameters, are explicitly documented as alias-safe, and are zero-allocation in hot paths.
- Sentinels not throws: zero `throw` statements in 76 source files. `getRenderEffectDefaults` returns `{}` for unknown kinds, `normalizeRenderEffect` returns `false`, `validateRenderEffectList` returns the failing input or `null`.
- `sideEffects: false`, no top-level execution, no module-scoped mutable state (scratch objects in `renderEffectCaptureGeometry.ts` are module-private and at file bottom per convention).
- Open base contract for `RenderEffect`: new effects extend it with a literal `kind` and register a runner. No central union to edit.
- Two export lanes correctly configured in `package.json` (`.` and `./contract`).

**Candidate contract/doc revisions (user's gate):**

- The Package Map in `AGENTS.md` lists effects in the Rendering group parenthetically: `image operations (materials + shading / adjustments / effects with effects-gl / -wgpu / -canvas)`. This is accurate but terse for a 54-effect, 382-test, 15-math-module package. Not missing, but undersized for the package's weight.

## Candidate open directions

Each is a question the charter does not fully answer that this review had to assume or flag:

1. **Should `whiteBalanceEffect` and `toneMapEffect` migrate to `adjustments`?** The fork H ruling says pointwise ops move. Both are continuous pointwise. `whiteBalanceEffect.ts` has no recipe math in this package (its math is already in `adjustments`); `toneMapEffect.ts` is a 5-line factory. But ToneMap requires `[HDR]` input, which is an effect pipeline concern. The charter should settle whether HDR-dependent pointwise ops stay here or move.

2. **Should the defaults table be maintained or dissolved?** It has no consumer outside its test and drifts from the type definitions. The per-kind handler registration decision (2026-07-02) implies dissolving it, but it has not been removed or migrated. The charter should state whether it is dead code to remove or a placeholder for the registration migration.

3. **What is the completion bar for padding resolvers?** 19 of 54 effects have padding resolvers. Many of the remaining 35 are full-screen effects (tone map, FXAA, film grain) that genuinely have zero footprint. But some spatial effects lack resolvers -- is the intent that every spatial effect must register one, or only effects with non-trivial footprints?

4. **`strength` semantics across effects.** The status.md notes that `strength` has a ratified meaning (post-operator coverage gain, clamped) but no shared primitive for backends to reach for. Several effects carry `strength` fields (Bevel, DropShadow, OuterGlow, InnerGlow, GradientGlow, GradientBevel, InnerShadow, Sketch). Is a shared `applyEffectStrength` helper in scope for `effects`, or does each backend implement it independently?
