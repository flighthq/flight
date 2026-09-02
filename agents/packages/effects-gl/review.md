---
package: '@flighthq/effects-gl'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# effects-gl -- Review

Survey of `packages/effects-gl/` as of 2026-09-02. Judged against `charter.md` (last direction 2026-07-31) and the codebase-map contract where the charter is silent.

## Verdict

`solid` -- 82/100. A broad, structurally sound WebGL 2 post-process backend: 47 per-kind runner/registrar pairs across a six-band taxonomy, a clean open registry, an MSAA-aware HDR-capable ping-pong pipeline with adjustment fusion, a per-context program cache, a per-program uniform-location cache, and a complete diagnostics layer. The architecture is exemplary -- one runner per effect, no switches, full tree-shakability, explicit GPU lifecycle. It falls short of `authoritative` on three axes: the uniform-location cache exists but is adopted by only 5 of 47 effect modules (the other 42 still make per-frame driver round-trips); two screen-space effects (SSAO, SMAA) register under their canonical names but implement materially simpler algorithms; and the `strength` parameter is applied before the spatial operator in the tint/glow family, producing non-independent alpha/strength control and a non-monotonic outer-glow curve.

## Present capabilities

Grounded in `packages/effects-gl/src/` (59 source files, ~10,900 lines; 57 test files, ~5,500 lines).

### Registry and pipeline

- **Open effect registry** (`glRenderEffectRegistry.ts`): `registerGlRenderEffect`, `getGlRenderEffectRunner`, `hasGlRenderEffectRunner`, `isGlRenderEffectResolvable`. Per-state, Map-keyed, supports resolver predicates for effects whose identity degrades (CustomShaderEffect, BitmapDisplacementEffect). No switch, no monolithic import. Charter North star #1 satisfied.

- **Post-process pipeline** (`glRenderEffectPipeline.ts`): `createGlRenderEffectPipeline` / `beginGlRenderEffectPipeline` / `endGlRenderEffectPipeline` / `destroyGlRenderEffectPipeline`. MSAA-aware scene target, configurable format (rgba8/rgba16f), configurable depth, pooled ping-pong scratch targets, LUT cache, velocity texture seam. Adjustment fusion: consecutive pointwise color adjustments are fused into one color-matrix or one color-LUT pass (`glColorMatrixPass.ts`, `glColorLutPass.ts`) preserving stack order. Color-space-aware present: linear content gets a single `drawGlLinearToSrgbPass`; sRGB content gets a plain blit. Charter North star #3 (explicit GPU lifecycle) satisfied -- create/destroy, acquire/release balanced.

- **Render-texture application** (`glRenderTextureEffect.ts`): `applyGlRenderEffectsToRenderTexture` / `explainGlRenderEffectApplication` -- the per-node target-to-target path, separate from the pipeline. Returns `false` on no source or no registered runners; the explain function produces a typed `GlRenderEffectApplicationExplanation` covering six statuses.

- **Program cache** (`glEffectProgramCache.ts`): `getGlEffectProgram` keyed by a stable string per GL context (WeakMap on `GlContext`). `getGlEffectUniformLocation` caches per-program uniform locations to avoid driver string-hash round-trips.

### Per-kind runners (47 registered kinds)

Each effect matches the pattern: `apply<Name>EffectToGl` (the direct-call function), `defaultGl<Name>EffectRunner` (the registry-shaped adapter), and `registerGl<Name>Effect` (the one-call registrar). Kinds grouped by band:

**Antialiasing** (2): FXAA (single-pass luma-edge), SMAA (single-pass edge-aware blur -- stand-in, see Gaps).

**Bloom / optical** (5): Bloom (bright-pass + separable Gaussian + additive composite), Lens Dirt, Lens Flare, God Rays, Lens Distortion.

**Blur** (7): Blur (separable Gaussian), Directional Blur, Radial Blur, Motion Blur (velocity-aware), Camera Motion Blur, Tilt Shift, Bokeh Depth of Field (disc blur with optional depth-driven CoC).

**Color / tone** (7): Tone Map (Reinhard/ACES operators), White Balance, Composite (blend-mode composition), Blend (backdrop-aware), Posterize, Dither, Custom Shader.

**Screen-space / atmospheric** (3): SSAO (luminance-variation stand-in, see Gaps), Screen Space Fog (depth-aware distance fog), Contact Shadows.

**Stylize** (10+): Bevel, Drop Shadow, Inner Glow, Inner Shadow, Outer Glow, Gradient Bevel, Gradient Glow, Outline, Sketch, CRT, Film Grain, Glitch, Halftone, Scanlines, Pixelate, Chromatic Aberration, Sharpen, Convolution, Kuwahara, Median, Vignette, Bitmap Displacement, Displacement.

**Shared helpers**: `glEffectBoxBlur.ts` (iterative box blur for the glow/shadow family), `glEffectBlitShader.ts` (blit, blit-offset, erase passes), `glEffectTintShader.ts` (tint, invert-tint passes), `glEffectGradientRamp.ts` (gradient-ramp generation for gradient bevel/glow), `glShaderTestHelper.ts` (test utility).

### Blur primitives

Two reusable blur primitives: `applyGaussianBlurToGl` (separable Gaussian, sigma-based, radius = ceil(3*sigma)) used by Bloom and the plain Blur effect, and `applyGlEffectBoxBlur` (iterative box blur) used by the glow/shadow/bevel family. Both also have `*RenderTextures` variants for the per-node path. The Gaussian blur and its test helper use `getGlEffectUniformLocation` correctly.

### Diagnostics layer

`enableGlRenderEffectGuards.ts`: `enableGlRenderEffectGuards` / `disableGlRenderEffectGuards` installs three guards -- pipeline-skip (warns on unregistered kinds silently dropped by the pipeline), render-texture application (typed explanation of partial registration / source-unavailable / stale-destination / unresolved-effects), and custom-shader-source re-registration (warns when different source is registered under the same shaderKey but the compiled program is cached). All messages flow through `logOnce` from `@flighthq/log`; core stays message-free. This fully satisfies the codebase-map diagnostics convention (inversion rule, seams not messages).

### Testing

Every source file has a colocated `.test.ts` (except `contract.ts` and `index.ts`, which are re-exports only). Tests verify function existence, registration wiring, runner shape, and (for complex multi-pass effects like bloom/glow/bevel) exercise the shader-expression math. jsdom cannot reach rendered pixels, so tests are structurally wiring/closure checks by necessity; pixel verification belongs to the functional-test layer.

### Contract compliance

- **Two export lanes**: `.` (`index.ts`) curates the public API; `./contract` (`contract.ts`) re-exports everything for intra-SDK consumption. Both are declared in `package.json` exports map.
- **`sideEffects: false`**: declared in `package.json`. No top-level registration calls.
- **Types in `@flighthq/types`**: all imported types (`GlRenderEffectRunner`, `GlRenderState`, `GlRenderTarget`, `BloomEffect`, etc.) come from `@flighthq/types/contract`. No inline exported type definitions.
- **Intra-SDK imports via `/contract`**: all dependencies (`@flighthq/render-gl/contract`, `@flighthq/effects/contract`, `@flighthq/adjustments/contract`, `@flighthq/color/contract`, `@flighthq/registry/contract`, `@flighthq/log/contract`) use the contract lane.
- **Full unabbreviated names**: function names include the full type name (`applyBloomEffectToGl`, `registerGlBevelEffect`).
- **No `@flighthq/sdk` imports**.
- **Explicit allocation**: `create*`/`destroy*` for owned targets, `acquire*`/`release*` brackets for pooled targets.

## Gaps

### Uniform-location cache adoption (in-package, high-impact)

The `getGlEffectUniformLocation` cache in `glEffectProgramCache.ts` exists and works, but only 5 of 47 effect modules use it (`glBlurEffect.ts`, `glBlendEffect.ts`, `glCompositeEffect.ts`, `glBitmapDisplacementEffect.ts`, `glCustomShaderEffect.ts`). The remaining 42 call `gl.getUniformLocation(p.program, ...)` directly inside their per-draw `setUniforms` closure, incurring a GL driver round-trip per uniform per frame. This is the single largest sweep-safe in-package improvement: a mechanical substitution of `gl.getUniformLocation(p.program, name)` with `getGlEffectUniformLocation(state, p, name)` in each file.

### SSAO is a luminance-variation approximation, not depth-driven AO

`applySsaoEffectToGl` (`glSsaoEffect.ts`) darkens by local luminance variation in a 4-tap neighborhood scaled by intensity. The comment is honest ("stand-in darkens fragments by local luminance variation"), but the algorithm ignores the depth data that the pipeline now feeds (`ctx.sceneDepthTexture` is available since `beginGlRenderEffectPipeline` passes a real `sceneDepthTexture` at line 169 of `glRenderEffectPipeline.ts`). The pipeline blocker documented in the status is stale -- the depth seam landed. The effect itself is the remaining gap.

### SMAA is a single-pass edge blur, not multi-pass morphological AA

`applySmaaEffectToGl` (`glSmaaEffect.ts`) detects edges by luma threshold and averages a 5-tap cross neighborhood. The comment says "single-pass approximation." Real SMAA is a three-pass algorithm (edge detection, blend-weight computation against area/search lookup textures, neighborhood blending). The stand-in is functionally an edge-softening blur, not morphological antialiasing.

### `strength` applied before the spatial operator

`glEffectTintShader.ts:17` computes `min(1.0, a * u_alpha * u_strength)`, folding strength inside the clamp before the blur. This means alpha and strength are not independently controllable. `INVERT_TINT_FRAGMENT_SRC` (`:31`) applies the same folding to the inverted alpha before blur, diverging from a blur-then-invert pipeline on antialiased borders. `glOuterGlowEffect.ts:42-43` splits strength into `min(1,s)` pre-blur plus `floor(s)` repeated composite blits, which is neither continuous nor monotonic. `glBevelEffect.ts:95` passes strength to the bevel shader as `u_intensity` (a post-operator gain), which is the correct placement -- but the uniform name `u_intensity` diverges from the descriptor field `strength`. This is documented in `status.md` as a known issue; the missing primitive is a post-operator coverage-gain pass.

### `BloomEffect.passes` is declared in `@flighthq/types` but consumed by no backend

`BloomEffect.passes` is defined at `packages/types/src/BloomEffect.ts:8` as an optional blur-quality field. No runner in `effects-gl`, `effects-wgpu`, or `effects-canvas` reads it. The bloom runner uses a single separable Gaussian pass whose radius derives from `computeBloomBlurRadius(effect)`. The field is dead.

### No chain validation or ordering

`RenderEffectChainHint`, `validateGlRenderEffectChain`, and `orderGlRenderEffectChain` do not exist. The pipeline silently skips unregistered kinds (with a guard diagnostic), but cannot detect ordering hazards (e.g., bloom after tone map clips highlights) or HDR/depth requirement mismatches. This is noted in the charter as Open direction #4 (cross-package ownership question).

### Two GL-only effects with no WGPU counterpart

`BokehDepthOfFieldEffect` and `CustomShaderEffect` have GL runners but no `effects-wgpu` counterpart. A chain using either silently degrades to identity on WGPU, with no warning unless guards are enabled.

### No functional test scenes

No `tests/functional/` scenes exist for `effects-gl`. Pixel-level correctness across effects and cross-backend parity (GL vs Canvas vs WGPU) are unverified. The colocated unit tests verify wiring and registration only. This is noted in the charter as Open direction #3.

### Bloom math divergence resolved but partially

The previous review's highest-severity finding -- inline bloom mip-count/soft-knee math that disagreed with `@flighthq/effects` shared helpers -- has been partially resolved. `glBloomEffect.ts` now imports and uses `computeBloomThreshold`, `computeBloomIntensity`, and `computeBloomBlurRadius` from `@flighthq/effects/contract`. However, the bloom shader itself is a simple hard-threshold bright-pass (`step(u_threshold, l)`) rather than a soft-knee that the `computeBloomThresholdKnee` helper was designed to feed. Whether the hard-threshold recipe is the intended final shape or should adopt the soft-knee helper is an open question. The `computeBloomMipCount`/`computeBloomMipWeights` helpers are unused -- the GL bloom is not a mip-pyramid but a single-level bright+blur+composite recipe.

### Charter says 46 kinds; source has 47

The charter Decision says "GL has 46 realized built-ins." The source now registers 47 distinct kinds (the 45 in the main grep plus CustomShaderEffect and BitmapDisplacementEffect). The charter count is stale by one.

## Charter contradictions

- **North star #2 ("the backend differs, the intent does not")** is mostly satisfied. The bloom effect now consumes the shared `@flighthq/effects` helpers for threshold, intensity, and blur radius. However, the GL bloom recipe (single-level bright+blur+composite with a hard threshold) does not use the mip-pyramid or soft-knee helpers, so GL bloom output will differ from any backend that adopts the multi-level soft-knee recipe. The charter's Open direction #2 covers this.

- **North star #4 ("names tell the truth about what runs")** is satisfied for TAA/SSR (deleted), but the SSAO and SMAA stand-ins still register under canonical names while implementing materially different algorithms. `applySsaoEffectToGl` is a luminance-variation darkener, not ambient occlusion; `applySmaaEffectToGl` is a 5-tap edge-blur, not morphological antialiasing. Both have honest source comments, but the kind strings `SsaoEffect` and `SmaaEffect` carry the expectation of the canonical algorithms. The charter's Open direction #1 covers this.

- **Decision "46 realized built-ins"** is stale; the current count is 47.

## Contract & docs fit

### Package against contract

- Export lanes, sideEffects, types-in-types, naming, allocation, and diagnostics are all conformant.
- The `Readonly<T>` convention is inconsistently applied across effect function signatures. Most per-kind `apply*` functions correctly mark `source` and `effect` as `Readonly`, but some shared helpers (e.g., `applyGlEffectTintPass` takes `source: GlRenderTarget` without `Readonly`) do not.
- Module-scoped state (`_skipGuards`, `_guards`, `_sourceGuards`, `_programs`, `_uniformLocations`, `tintShaders`, `invertTintShaders`, `blitOffsetShaders`, `blitShaders`, `eraseShaders`) is all WeakMap-keyed on either `GlRenderState` or `GlContext`, which aligns with the explicit-dependency model (no set-and-forget singletons, state scoped to context lifetime). These are at the bottom of files per style convention.

### Admin docs against reality

- The charter's Decision count (46) should be updated to 47.
- The previous review carried correction notes referencing superseded implementation details (batch/category registrars, builder bundle references). This review replaces those with current-source observations.

## Candidate open directions

Questions the charter does not answer that this review had to assume:

1. **Hard-threshold vs soft-knee bloom.** The GL bloom uses `step(threshold, luma)` as a hard bright-pass cutoff. The `@flighthq/effects` package provides a `computeBloomThresholdKnee` helper for a soft-knee curve. Which is the intended final recipe? If soft-knee, the bright-pass shader and its uniform interface need updating.

2. **SSAO should consume the depth seam.** The pipeline now provides `sceneDepthTexture`, but the SSAO runner does not use it. Is the current luminance-variation approximation acceptable as a shipped realization, or is real depth-driven SSAO (using the available depth) a within-package improvement now that the pipeline blocker is resolved?

3. **`Readonly<T>` consistency on shared helpers.** Several internal helper functions (`applyGlEffectTintPass`, `applyGlEffectBlitPass`, `applyGlEffectBlitOffsetPass`, `applyGlEffectErasePass`) take their `source` and `dest` parameters without `Readonly`, unlike the per-kind `apply*` functions. This is an internal-only inconsistency but diverges from the codebase-map convention.
