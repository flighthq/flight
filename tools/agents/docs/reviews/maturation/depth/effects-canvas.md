# Maturation Roadmap: @flighthq/effects-canvas

**Current verdict**: partial — 48/100. Excellent infrastructure (pipeline, render-target pool, kind registry, compositing primitives, 11 real effects) but **33 of 44 effects are no-op passthroughs**, ~26 of which are achievable on Canvas 2D and stubbed only by omission of the ImageData path.

The single load-bearing error is architectural framing, not missing infrastructure: the package equates "no CSS `filter` string" with "impossible on Canvas 2D," ignoring `getImageData`/`putImageData`. The sibling `@flighthq/surface` and `@flighthq/filters-surface` packages already establish the per-pixel and convolution toolset in this repo; this package never reaches for it. The matching shader package `@flighthq/effects-gl` already implements all 44 kinds, so the parity target for "real on this backend" is defined and visible.

The work below is mostly **filling a known catalog**, not designing new surface. Effect kinds, descriptor types, and runner/registry shapes already exist in `@flighthq/types` and `@flighthq/effects`; the additions here are Canvas realizations plus a small number of new shared primitives and discoverability seams.

## Bronze

Minimum viable: stop lying in the catalog, add the ImageData primitive that unlocks the bulk of the omitted effects, and implement the pure per-pixel set (highest value per line of code, no neighbor sampling, fully unit-testable in jsdom).

- **`drawCanvasImageDataPass(dest, source, transform)`** in `canvasEffectCompositing.ts` — the missing per-pixel pass primitive: `getImageData` from `source`, run a `(rgba, index, data) => void` or whole-buffer transform, `putImageData` into `dest`, with the same transform/alpha/filter reset discipline as `drawCanvasEffectPass`. This is the one new primitive Bronze depends on. Where the math already exists, delegate to `@flighthq/surface` / `@flighthq/filters-surface` rather than re-deriving it.
- Implement the **pure per-pixel color-math effects** (replace passthrough bodies, keep the existing function/runner names):
  - `applyPosterizeEffectToCanvas` — per-channel quantization to N levels.
  - `applyChannelMixerEffectToCanvas` — 3×4 RGB(+offset) matrix per pixel.
  - `applyLiftGammaGainEffectToCanvas` — per-channel offset/pow/mul.
  - `applyWhiteBalanceEffectToCanvas` — temperature/tint channel scaling.
  - `applyLookupTableGradeEffectToCanvas` — 1D/3D LUT sample (nearest at Bronze, trilinear at Silver).
  - `applyDitherEffectToCanvas` — ordered Bayer-matrix dithering.
- **Correct the misleading comments**: rewrite every "no CSS equivalent → shader-only" passthrough comment. For now-implemented effects, describe the real recipe; for the ones still stubbed, change the rationale to the truthful "no Canvas-2D path" (and only for the genuinely impossible set).
- **Capability discovery — `isCanvasRenderEffectReal(kind): boolean`** (or a `CanvasRenderEffectSupport` enum: `'real' | 'approximate' | 'passthrough'`). A consumer must be able to learn at runtime that `posterize` is real and `ssao` is inert, instead of silently getting an unchanged frame. Back it with a small const map colocated with the registry.
- **Unit tests** for each newly-real effect asserting the buffer actually changes for a representative input (the current tests mostly assert "doesn't throw" against passthroughs and will keep passing even when the effect is hollow — tighten them).

## Silver

Competitive and solid: implement the convolution and multi-draw spatial/stylized families so the catalog matches what a respected Canvas-2D post-FX library offers, and add the cross-backend consistency and approximation honesty that "good library" implies.

- **Convolution effects** (neighbor sampling over ImageData, reuse `@flighthq/filters-surface` convolution where shapes align):
  - `applySharpenEffectToCanvas` — unsharp mask / Laplacian.
  - `applyOutlineEffectToCanvas` — Sobel edge detect.
  - `applyKuwaharaEffectToCanvas` — region-variance smoothing.
  - `applySketchEffectToCanvas` — edge + invert + blend.
  - `applyHalftoneEffectToCanvas` — dot-screen via thresholded cell sampling.
- **Multi-draw spatial blurs** (accumulate offset draws with `globalAlpha`, no per-pixel loop needed):
  - `applyDirectionalBlurEffectToCanvas`, `applyRadialBlurEffectToCanvas`, `applyMotionBlurEffectToCanvas` (screen-space variant).
  - **`drawCanvasAccumulationPass(dest, source, samples, perSampleTransform)`** — shared primitive for summed offset/scaled/rotated draws; the spatial blurs, god-rays, and motion effects all build on it.
- **Stylized / composite screen effects** (reuse the radial-gradient + additive-composite toolkit Bloom/Vignette already demonstrate):
  - `applyGlitchEffectToCanvas` — RGB split + horizontal slice offsets.
  - `applyChromaticAberrationEffectToCanvas` — per-channel offset draws.
  - `applyGodRaysEffectToCanvas`, `applyLensFlareEffectToCanvas`, `applyLensDirtEffectToCanvas` — radial/additive overlays.
  - `applyCrtEffectToCanvas` — compose scanlines + curvature/vignette + chroma offset.
  - `applyTiltShiftEffectToCanvas` — graduated CSS-blur draws under a gradient mask.
  - `applyScreenSpaceFogEffectToCanvas` — depth-free LDR approximation (uniform/gradient fog blend).
  - `applyDisplacementEffectToCanvas`, `applyLensDistortionEffectToCanvas` — ImageData remap (reuse `surfaceDisplacementMapFilter`).
- **Approximate tone/exposure** (mark as `'approximate'` in the support map, not passthrough):
  - `applyExposureEffectToCanvas` — LDR exposure as brightness/curve.
  - `applyToneMapEffectToCanvas` — LDR curve approximation (Reinhard/filmic shaped to 8-bit).
- **`registerAllCanvasRenderEffects(state)`** — opt-in convenience that registers every real/approximate runner in one call, mirroring whatever `effects-gl` exposes; keep it a separate import so it does not defeat tree-shaking for consumers that register a subset.
- **Cross-backend consistency check**: add a functional-test scene per effect family (via the `functional-test` skill) so `rust:skia ~ ts:canvas ~ ts:gl` can be compared in the parity matrix, and document tolerances where Canvas (CSS-filter rounding, 8-bit) legitimately diverges from GL.
- **Performance pass**: cache `getImageData`/`putImageData` buffers across frames in the pipeline (reuse pooled `ImageData` rather than reallocating per effect), and short-circuit no-op parameter cases (e.g. zero-amount blur) back to a cheap blit.

## Gold

Authoritative / AAA: full catalog honesty, the genuinely-impossible set documented and inert by design, exhaustive tests/docs, and 1:1 conformance with the Rust skia mirror.

- **Complete the support taxonomy** so every one of the 44 kinds reports `'real' | 'approximate' | 'passthrough'` with a one-line rationale, and a test asserts no kind is silently passthrough without being on the documented impossible list.
- **Document the genuinely-impossible set** (`BokehDepthOfFieldEffect`, `SsaoEffect`, `SsrEffect`, `TaaEffect`, `CameraMotionBlurEffect` velocity variant, `FxaaEffect`, `SmaaEffect`) as preserved-but-inert pipeline stages for cross-backend parity, each with a comment naming the missing input (depth buffer, velocity buffer, multi-frame history, or pre-rasterization AA) — not "shader-only."
  - **Surface a design decision**: if a Canvas depth/velocity G-buffer is ever wanted, that is a `render`-pipeline-level change, not an `effects-canvas` change. Raise it as a cross-package suggestion rather than acting on it here.
- **Quality upgrades to the approximate set**: trilinear `LookupTableGrade`, separable Gaussian for blur quality, configurable sample counts on accumulation passes, gamma-correct blending where it materially improves output, and a documented HDR-limitation note on exposure/tone-map (Canvas is 8-bit non-HDR by design — `crates/.../conformance` divergence map entry).
- **Exhaustive edge-case + error handling**: zero/negative/NaN parameters return a clean blit (sentinel behavior, no throw); zero-size render targets are no-ops; alias-safety verified for every pass (`source === dest` paths); `out`-aliasing tests per the project rule.
- **Full test + visual coverage**: per-effect unit test asserting correct pixel deltas against known inputs, committed screenshot baselines for every effect, and parity-matrix cells for all real/approximate effects.
- **Rust mirror `flighthq-effects-skia`** (or the established crate name): 1:1 port of the real/approximate recipes over tiny-skia per the Rust render layering, with `displayobject-skia` as the bit-deterministic conformance reference. Record each Canvas-vs-skia tolerance in the conformance divergence map. Note: per the render taxonomy there is no `effects-canvas` Rust crate (Canvas2D substrate is host-web only); the conformance partner for these recipes is the skia software path, and the impossible-on-canvas set maps to "available in skia/GPU, absent in canvas."
- **Docs**: a package-level capability table (kind → support tier → backend technique) so a consumer can pick the right backend per effect; reference it from the Package Map entry.

## Sequencing & effort

Recommended order (each builds on the previous; nearly all work is internal to this package):

1. **Bronze, low effort, high value.** Add `drawCanvasImageDataPass` first — it unblocks everything per-pixel. Then the six pure color-math effects (each is a short ImageData loop, several can delegate straight to `@flighthq/surface`/`@flighthq/filters-surface`). Correct the comments and add the `isCanvasRenderEffectReal`/support map in the same pass since you are touching every stub anyway. Tighten the unit tests to assert real change. This alone moves the package from "three-quarters hollow" to "majority real."
2. **Silver, moderate effort.** Add `drawCanvasAccumulationPass`, then the multi-draw spatial/stylized effects (cheap, reuse existing additive-composite technique), then the convolution set (heavier loops, lean on `filters-surface`), then the approximate exposure/tone-map. Add `registerAllCanvasRenderEffects` and the functional-test scenes near the end of this tier so parity can be measured once the effects are real. Performance/buffer-pooling pass closes Silver.
3. **Gold, larger and partly cross-package.** Taxonomy completion, edge-case/alias hardening, exhaustive tests/baselines, docs table, then the Rust skia mirror and conformance-map entries.

**Dependencies on other packages / types:**

- **No new `@flighthq/types` work expected** — effect descriptor types, `CanvasRenderEffectRunner`, registry, and the 44 `*Kind` strings already exist. The only candidate addition is a shared `RenderEffectSupport` tier type if it is wanted cross-backend (so `effects-gl`/`effects-wgpu`/skia report support uniformly); define that in `@flighthq/types` first if so. Confirm before adding.
- **Reuse, do not re-derive**: `@flighthq/surface` (`getSurfacePixel*`/`setSurfacePixel*`) and `@flighthq/filters-surface` (convolution, displacement-map, sharpen, pixelate) already implement most of the per-pixel/convolution math. Prefer delegating; only add a Canvas pass wrapper. This may add a dependency on `@flighthq/surface` — check the bundle-size impact with `npm run size` and keep it behind tree-shaking.
- **Parity target is `@flighthq/effects-gl`** — match its kind coverage and (where the backends should agree) its visual output. Use the parity matrix, not eyeballing.

**Cross-package / design-decision items to surface (do not act on autonomously):**

- Whether a uniform `RenderEffectSupport` tier belongs in `@flighthq/types` (affects all four effect backends).
- Whether `registerAllCanvas...` should have symmetric siblings in `effects-gl`/`effects-wgpu` for API symmetry.
- The depth/velocity G-buffer question for the genuinely-impossible set lives in `@flighthq/render`, not here — surface as a suggestion only.
- Confirm the Rust crate name/placement (`effects` recipes over skia vs a dedicated crate) against the conformance crate-existence rule before starting the port.
