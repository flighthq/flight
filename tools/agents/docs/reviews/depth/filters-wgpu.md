# Depth Review: @flighthq/filters-wgpu

**Domain:** WebGPU (WGSL) shader backend for the SDK's bitmap-filter effects — the GPU executor that turns the plain `@flighthq/filters` data descriptors into multi-pass WGSL render passes over `WgpuRenderTarget`s.

**Verdict:** solid — **84/100**

This is a backend implementation package, not a standalone "filter library" in the abstract: the canonical filter _vocabulary_ (which effects exist, what parameters each takes) is owned by the data package `@flighthq/filters`; `filters-wgpu` is one of several interchangeable executors (`filters-gl`, `filters-canvas`, `filters-css`, `filters-surface`). Judged against the right bar — "does this implement the full canonical filter set with real, correct GPU passes, plus the pipeline plumbing a WebGPU filter backend needs" — it is near-complete and clearly the most feature-complete of the GPU/raster backends, matching `filters-gl` one-for-one and exceeding the Canvas/CSS backends.

## Present capabilities

Implements an `apply*FilterToWgpu` for all 14 filter descriptors defined by `@flighthq/filters`:

- Blur: `applyBoxBlurFilterToWgpu` (separable, multi-pass box, radius via `computeBoxBlurPassRadius`) and `applyGaussianBlurFilterToWgpu` (faithful separable Gaussian, sigma-based, radius ⌈3σ⌉) — both correct, documented, ping-pong scratch driven.
- Shadow/glow family: `applyDropShadowFilterToWgpu`, `applyOuterGlowFilterToWgpu`, `applyInnerGlowFilterToWgpu`, `applyInnerShadowFilterToWgpu`.
- Bevel family: `applyBevelFilterToWgpu`, `applyGradientBevelFilterToWgpu`, `applyGradientGlowFilterToWgpu` (gradient family backed by `createWgpuGradientRampTexture`).
- Color/kernel: `applyColorMatrixFilterToWgpu` (full 4×5 matrix), `applyConvolutionFilterToWgpu` (arbitrary kernel, divisor/bias), `applySharpenFilterToWgpu`, `applyMedianFilterToWgpu`, `applyPixelateFilterToWgpu`.
- Displacement: `applyDisplacementMapFilterToWgpu` (separate map target input).

Supporting pipeline infrastructure (the part a thin backend would omit and this one does not):

- `createWgpuFilterPipeline` / `createWgpuDualSourcePipeline` / `createWgpuTripleSourcePipeline` and matching `drawWgpu{Filter,DualSource,TripleSource}Pass` — a real 1/2/3-input fullscreen-pass abstraction with `premul`/`replace` blend selection and a `setUniforms(f32, i32)` callback.
- `clearWgpuFilterTarget`, blit helpers (`applyWgpuBlitPass`, `applyWgpuBlitOffsetPass`, `getWgpuBlitShader`, `getWgpuBlitOffsetShader`), tint/clip helpers (`applyWgpuTintPass`, `applyWgpuInvertTintPass`, `applyWgpuInnerClipPass`, plus their `getWgpu*Shader` accessors).
- Per-`WgpuRenderState` pipeline caching via `WeakMap`, so shader modules compile once.

Quality signals: WGSL is hand-written and algorithmically correct (separable convolution, exp-weighted Gaussian, bevel as directional gradient of blurred alpha matching the CPU `bevelSurface` reference, premultiplied composite, alias-safe ping-pong). Every exported function has a colocated `*.test.ts`. Side-effect-free, single root entry, `sideEffects: false`. Allocation is explicit (caller supplies `scratch`/`temp` targets; the filters "allocate nothing").

## Gaps vs an authoritative filter-backend library

- **Convolution preserveAlpha / clamp edge modes:** verify the convolution pass honors `preserveAlpha` and edge `clamp` semantics from the descriptor; OpenFL `ConvolutionFilter` exposes both and they are easy to drop on a GPU port. (Present-vs-omitted not fully confirmable from signatures alone — flag for a parameter-coverage pass.)
- **No `register*` integration seam:** unlike renderers, filters here are bare `apply*` free functions with no kind-keyed registration. This is consistent with `filters-gl` and the project's "explicit per-backend function, not a runtime-applied `BitmapFilter`" philosophy, so it is **missing-by-design**, not omission. Worth a one-line confirmation that the render pipeline's filter dispatch wiring lives elsewhere (render-wgpu) rather than here.
- **Single combined blur entry:** `filters` defines one `BlurFilter`; the backend correctly splits box vs Gaussian, but there is no single `applyBlurFilterToWgpu` dispatcher that picks based on `quality`/descriptor — callers must choose. Minor ergonomic gap relative to a "give me the filter, I'll execute it" facade; likely intentional given the explicit-allocation style.
- **No shader-filter / custom-WGSL passthrough:** an authoritative GPU filter backend often exposes a generic "run this user fragment shader as a filter pass" path. The pipeline primitives (`createWgpuFilterPipeline` + `drawWgpuFilterPass`) effectively _are_ that seam and are exported, so the capability exists even if not branded as a public custom-filter API.
- **Gradient-map / curves / levels / threshold-style adjustment filters** are absent across the whole `filters` family (not just wgpu), so this is a data-package scope question, not a backend depth gap.

## Naming / API-shape notes

- Naming is exemplary and on-pattern: `apply<Filter>FilterToWgpu` reads as a sentence, the backend suffix (`ToWgpu`) and the `Wgpu` prefix on infrastructure (`createWgpuFilterPipeline`, `WgpuRenderTarget`) make every symbol self-identifying and globally unique. Matches `filters-gl`'s `...ToGl` exactly, which is the right symmetry.
- `out`/scratch convention is explicit and documented per function (e.g. bevel documents that `scratch` must hold three same-size targets). Good fit for the C/C++ portability goal.
- `Readonly<Omit<XFilter, 'kind'>>` parameter shape is consistent across all 14 — the descriptor's `kind` is stripped because dispatch already happened. Clean and uniform.
- Blend mode is a string literal union `'premul' | 'replace'` — appropriate; no over-engineering.

## Recommendation

Treat as **solid / near-authoritative for its role**. It is a faithful, correct, full-coverage WebGPU executor of the canonical filter set with genuine pipeline infrastructure — well beyond a stub. To close the remaining 16 points, do a parameter-coverage pass (confirm convolution `preserveAlpha`/edge modes and any per-filter knockout/quality params are honored to match the surface/GL references), and add a short note (in code or docs) clarifying that the absence of a `register*` seam and a single `applyBlurFilterToWgpu` dispatcher is deliberate, with the render-side dispatch wiring pointed to. No structural work needed; the depth is real and the design is on-pattern.
