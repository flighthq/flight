---
package: '@flighthq/effects-canvas'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/effects-canvas

## Verdict

**solid — 82/100.** Genuine Canvas 2D post-process implementations for 18 effect kinds, backed by
a clean opt-in pipeline, pooled scratch canvases, a per-state runner registry, and shared compositing
primitives. Every realized effect has a matching runner/registrar pair; unregistered kinds hit a
pipeline-level identity copy with no fake passthrough runners — exactly what the charter demands.
Held back from higher by: stale registration test coverage (the two registration tests cover only 8-9
of 18 kinds), no guard module for the silent identity-copy path, a `strength` discontinuity shared
with the GL/WGPU siblings, an orphan type in `@flighthq/types`, export ordering violations in both
lane files, and a duplicate private helper.

## Present capabilities

### Infrastructure

- **Pipeline** — `createCanvasRenderEffectPipeline`, `beginCanvasRenderEffectPipeline`,
  `endCanvasRenderEffectPipeline`, `destroyCanvasRenderEffectPipeline`
  (`canvasRenderEffectPipeline.ts`). Scene renders into an offscreen `CanvasRenderTarget`; end runs
  the operation list through the per-state registry, ping-ponging pooled scratch canvases. Supports
  interleaved `Adjustment` runs: consecutive matrix-tier adjustments fuse into one 4x5 color matrix;
  runs containing any LUT-tier member bake into one `ColorLut`. Unregistered kinds hit an identity
  copy (`canvasRenderEffectPipeline.ts:151`) rather than registering fake passthrough runners.
  `presentCanvasRenderEffectResult` blits the final result with correct clear-before-draw.
- **Render-target pool** — `createCanvasRenderTargetPool`, `acquireCanvasRenderTarget`,
  `releaseCanvasRenderTarget`. Paired acquire/release brackets, size-aware resize-or-allocate,
  correct ownership.
- **Registry** — `registerCanvasRenderEffect`, `getCanvasRenderEffectRunner`,
  `hasCanvasRenderEffectRunner` (`canvasRenderEffectRegistry.ts`). Per-state registration via
  `@flighthq/registry`'s `withRegistryTableEntry`. Opt-in, last-write-wins, no monolithic switch.
- **Compositing primitives** — `drawCanvasEffectPass` (filter + composite-op blit with full state
  reset), `drawCanvasAccumulationPass` (multi-draw integration for spatial effects),
  `drawCanvasImageDataPass` (getImageData/putImageData per-pixel transform),
  `passthroughCanvasEffectPass` (`canvasEffectCompositing.ts`).
- **Source-mode compositing** — `clearCanvasTarget`, `compositeCanvasImage`,
  `compositeCanvasSourceMode`, `drawCanvasTintedAlphaMask`, `drawCanvasInvertedTintedAlphaMask`
  (`canvasSourceModeCompositing.ts`). Shared by the glow/shadow/bevel family. The inverted mask
  is built via a full-target fill knocked out by the source — no getImageData round trip.
- **Gradient ramp** — `buildCanvasGradientRamp`, `applyCanvasGradientRampLookup`
  (`canvasGradientRamp.ts`). 256-entry RGBA lookup table built from colors/alphas/ratios; the
  lookup is per-pixel by alpha, not spatial — correctly documented as not a CSS gradient.
- **Color passes** — `applyColorMatrixPassToCanvas`, `applyColorMatrixToImageDataBytes`
  (`canvasColorMatrixPass.ts`), `applyColorLutPassToCanvas` (`canvasColorLutPass.ts`). The matrix
  pass kernel is separately exported for testability without canvas context.
- **CSS fast paths** — `computeDropShadowEffectCss`, `computeOuterGlowEffectCss`
  (`canvasEffectDropShadowCss.ts`). Drop shadow and outer glow use `drop-shadow()` CSS filter when
  sourceMode is `'draw'` and blur is isotropic; non-isotropic or hide/knockout falls through to the
  full compositing path.
- **RenderTexture bridge** — `applyCanvasRenderEffectsToRenderTexture`
  (`canvasRenderTextureEffect.ts`). Per-node effect application against `RenderTexture` leases;
  ping-pongs dest/scratch so the final operation writes to dest.

### Effect catalog (18 runner/registrar pairs)

Each kind has a `defaultCanvas<Kind>EffectRunner`, `registerCanvas<Kind>Effect`, and an
`apply<Kind>EffectToCanvas` function. The apply functions accept explicit source/dest/pool
parameters; the runner wraps the apply for pipeline dispatch.

| Kind | Technique | File |
|------|-----------|------|
| Bevel | Offset blurred silhouette knockout + highlight/shadow tint + bevelType clip | `canvasBevelEffect.ts` |
| Blend | globalCompositeOperation over registered backdrop | `canvasBlendEffect.ts` |
| Bloom | Luminance-gate bright pass (ImageData) + CSS blur + additive composite (ImageData) | `canvasBloomEffect.ts` |
| Blur | CSS `blur()` filter, isotropic (blurX/blurY averaged) | `canvasBlurEffect.ts` |
| Composite | Porter-Duff via globalCompositeOperation over registered backdrop | `canvasCompositeEffect.ts` |
| DropShadow | CSS `drop-shadow()` fast path or full tint+blur+offset+sourceMode | `canvasDropShadowEffect.ts` |
| FilmGrain | Tiled deterministic noise patch + `overlay` composite | `canvasFilmGrainEffect.ts` |
| GradientBevel | Bevel band + gradient ramp lookup (signed, midpoint-biased) | `canvasGradientBevelEffect.ts` |
| GradientGlow | Blurred silhouette + gradient ramp lookup by alpha | `canvasGradientGlowEffect.ts` |
| InnerGlow | Inverted-silhouette tint + blur + destination-in clip + sourceMode | `canvasInnerGlowEffect.ts` |
| InnerShadow | Inverted-silhouette tint + blur + offset + destination-in clip | `canvasInnerShadowEffect.ts` |
| LensDistortion | Per-pixel radial polynomial UV remap with bilinear sampling (ImageData) | `canvasLensDistortionEffect.ts` |
| OuterGlow | CSS `drop-shadow()` fast path or full tint+blur+sourceMode | `canvasOuterGlowEffect.ts` |
| Pixelate | Downscale + nearest-neighbor upscale | `canvasPixelateEffect.ts` |
| Posterize | Per-channel `floor(v * levels) / (levels - 1)` in float domain (ImageData) | `canvasPosterizeEffect.ts` |
| Scanlines | Horizontal darkening bands via `multiply` composite | `canvasScanlinesEffect.ts` |
| TiltShift | 7-tap vertical blur with smoothstep-ramped radius (ImageData) | `canvasTiltShiftEffect.ts` |
| Vignette | Radial gradient in unit-square space via `multiply`, smoothstep-sampled stops | `canvasVignetteEffect.ts` |

### Tests

Every source file has a colocated `*.test.ts` (30 source files, 30 test files — `contract.ts` and
`index.ts` are barrel files without dedicated tests, which is standard). Total: ~2,880 test lines
across 30 files. Per-effect tests verify algorithm math and does-not-throw under jsdom (which
cannot execute canvas draw commands); visual correctness relies on functional baselines.
`canvasEffectTestSupport.ts` provides test-only `createCanvasRenderState` and
`createCanvasRenderTarget` wrappers.

## Gaps

1. **Registration test coverage stale.** `canvasEffectRegistration.test.ts` covers only 9 of 18
   kinds (Blend, Bloom, Blur, DropShadow, FilmGrain, OuterGlow, Pixelate, Scanlines, Vignette).
   `canvasRealizedEffectRegistration.test.ts` covers only 8 of 18 (same minus Blend). The 9 newer
   kinds (Bevel, Composite, GradientBevel, GradientGlow, InnerGlow, InnerShadow, LensDistortion,
   Posterize, TiltShift) are absent from both registration test matrices.

2. **No guard module.** `effects-gl` has `enableGlRenderEffectGuards.ts`; this package has no
   `enableCanvasRenderEffectGuards`. The silent identity-copy path for unregistered kinds
   (`canvasRenderEffectPipeline.ts:151`) has no shakeable diagnostic. Per the diagnostics
   convention, this silent sentinel needs an `explain*` query or a guard-layer warning.

3. **`strength` discontinuity across the glow/shadow family.** `canvasOuterGlowEffect.ts:76-77`,
   `canvasDropShadowEffect.ts:80-81`, `canvasInnerGlowEffect.ts:78`, `canvasInnerShadowEffect.ts:75`:
   `Math.min(1, strength)` for the tint alpha and `Math.max(1, Math.floor(strength))` for the
   pass count. Values in (1, 2) behave identically to 1.0 — the function is flat, then jumps at
   integer boundaries. The status correctly flags this. The same pattern exists in GL/WGPU siblings,
   so the fix is cross-backend.

4. **`CanvasRenderEffectSupport` is an orphan type.** Defined in
   `packages/types/src/CanvasRenderEffectSupport.ts`, exported from both `types` lanes, consumed by
   no module in any package. The charter's Open direction 1 asks whether to retire it or build a
   query; no work has landed either way.

5. **`BloomEffect.passes` is declared but universally ignored.** The field is declared at
   `packages/types/src/BloomEffect.ts:8` (`passes?: number`); no backend reads it. This is a
   cross-package types question, not a within-package gap — but it affects the user-facing contract
   of the bloom recipe.

6. **Duplicate private `cssRgbaFromColor` helper.** The identical function exists independently in
   both `canvasEffectDropShadowCss.ts:31-36` and `canvasSourceModeCompositing.ts:96-102`. Same
   signature, same body. One shared internal helper would eliminate the duplication.

7. **29 GL-realized kinds absent.** Of the 47 kinds `effects-gl` implements, 29 have no Canvas
   runner. Of these, ~8-10 are genuinely impossible on Canvas 2D (need depth buffers, velocity
   buffers, GPU AA, or shader facilities: BokehDepthOfField, CameraMotionBlur, ContactShadows,
   CustomShader, FXAA, ScreenSpaceFog, SMAA, SSAO). The remaining ~19-21 (ChromaticAberration,
   Convolution, CRT, DirectionalBlur, Displacement, BitmapDisplacement, Dither, Glitch, GodRays,
   Halftone, Kuwahara, LensDirt, LensFlare, Median, MotionBlur, Outline, RadialBlur, Sharpen,
   Sketch, ToneMap, WhiteBalance) are plausibly Canvas-implementable via ImageData or accumulation
   passes. The charter says "only implementations Canvas 2D can honestly execute" and
   "landing a stub to preserve taxonomy symmetry is explicitly out of doctrine," so each new
   addition requires a tested genuine implementation.

8. **Status stale by 3 effects.** The status (2026-08-08) reports 15 runner/registrar pairs; the
   source carries 18. LensDistortion, TiltShift, and Posterize landed after the status was written.

## Charter contradictions

The charter is mature and specific. Against its stated principles:

- **"Realized or absent, never fake"** — **COMPLIANT.** No passthrough runners exist. Unregistered
  kinds hit the pipeline identity copy, which is the charter's intended design.
- **"Exact inverse capability"** — **COMPLIANT.** Each of the 18 kinds has exactly one runner and
  one registrar; the registrar fronts the named runner. No orphan runners or registrars.
- **"Opt-in and tree-shakable"** — **COMPLIANT.** Registration is per-kind and per-state. No
  register-all aggregate, no category registrars, no import-time registration.
- **"Curated export lanes"** — **MINOR VIOLATION.** The index.ts named export list has alphabetical
  ordering violations: `defaultCanvasLensDistortionEffectRunner`, `defaultCanvasTiltShiftEffectRunner`,
  and `defaultCanvasPosterizeEffectRunner` appear after `defaultCanvasPixelateEffectRunner` rather
  than in their alphabetical positions. The same three are misordered in the `registerCanvas*`
  block. contract.ts has analogous re-export ordering violations (`canvasColorMatrixPass` before
  `canvasBevelEffect`, `canvasTiltShiftEffect` between `canvasLensDistortionEffect` and
  `canvasInnerShadowEffect`, `canvasColorLutPass` at the end). These are likely artifacts of the
  three effects being appended without re-sorting. `npm run order` would flag this.
- **"Explicit ownership"** — **COMPLIANT.** Every `acquireCanvasRenderTarget` is matched by a
  `releaseCanvasRenderTarget` within the same function scope. The bevel effect acquires 6 scratch
  targets and releases all 6.

## Contract & docs fit

**Package lives up to the contract:**

- Types live in `@flighthq/types`: `CanvasRenderEffectRunner`, `CanvasRenderState`,
  `CanvasRenderTarget`, `CanvasRenderTargetPool`, `CanvasRenderEffectPipeline`, and all effect
  descriptor interfaces. No types defined inline in this package.
- Two export lanes: `.` (index.ts, named exports) and `./contract` (contract.ts, `export *`).
  No other subpaths.
- `sideEffects: false` declared. No top-level registration, no module-scope mutable state.
- `crate: null` — correct per charter Decision 2026-07-02 (browser-API-bound).
- Function names are fully self-identifying: `applyBloomEffectToCanvas`,
  `registerCanvasDropShadowEffect`, `acquireCanvasRenderTarget`.
- Sentinels not throws: `getCanvasRenderEffectRunner` returns `null` for unknown kinds;
  `computeDropShadowEffectCss` returns `null` when the CSS fast path is unavailable.
- Exception: `applyCanvasRenderEffectsToRenderTexture` throws on aliased source/dest/scratch.
  This is a precondition violation (programmer error), so it is correct per convention.

**Candidate revisions (user's gate):**

1. **Package Map** — the effects family is now correctly listed in AGENTS.md under Rendering:
   `effects with effects-gl / -wgpu / -canvas`. No revision needed.
2. **Previous review and assessment are thoroughly stale** — both from 2026-07-31, describing a
   44-kind support map, category registrars, `registerAllCanvasRenderEffects`, and
   `CANVAS_RENDER_EFFECT_SUPPORT` — none of which exist in the current tree. This review
   supersedes that one entirely.

## Candidate open directions

Questions the charter does not answer that the review had to assume past. These feed the charter's
Open directions section for the user to settle:

1. **Which of the ~19-21 Canvas-feasible GL kinds should be implemented next?** The charter
   gates new kinds on "a tested implementation," so the work is mechanical — but the priority among
   DirectionalBlur, Outline, ChromaticAberration, Sharpen, etc. is a product decision the charter
   does not make. The existing three open directions (orphan type, stub doctrine, approximate-tier
   fidelity) remain unsettled and may constrain this.
2. **Should the `strength` model change?** The cross-backend strength discontinuity
   (flat in (1, 2), jump at integers) is a shared recipe design question. The status references an
   unratified `effect-recipe-model.md` that proposes a post-operator coverage-gain pass. The charter
   does not speak to strength semantics beyond "realized or absent."
3. **Guard module parity.** `effects-gl` has `enableGlRenderEffectGuards`; the charter's
   diagnostics posture (inversion rule: core exposes seams, guard modules emit warnings) implies
   `enableCanvasRenderEffectGuards` should exist. The charter is silent on whether Canvas needs
   its own guard module or whether the pipeline's identity-copy path is self-documenting enough.
