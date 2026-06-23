---
id: filters-wgpu
title: '@flighthq/filters-wgpu'
type: depth
target: filters-wgpu
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/filters-wgpu.md
  - tools/agents/docs/reviews/depth/filters-wgpu.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 84/100; a faithful, full-coverage WebGPU executor of the canonical 14-filter set with genuine 1/2/3-input pipeline infrastructure, near-authoritative for its role as one of several interchangeable filter backends (`filters-gl`/`filters-canvas`/`filters-css`/`filters-surface`).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum to call this genuinely complete and trustworthy for its role. Most of these are small, high-confidence closures of the depth-review gaps.

- **Confirm-and-test convolution parameter coverage.** The current `wgpuConvolutionFilter.ts` already honors `preserveAlpha`, `clamp`, `bias`, `divisor` (with auto-divisor fallback), and `color` edge fill — the depth review flagged this as unverified. Lock it in with explicit unit tests per parameter (preserveAlpha on/off, clamp vs edge-color, negative bias, zero-sum auto-divisor) and a pixel oracle, so the behavior is a guarantee, not an incidental.
- **`applyBlurFilterToWgpu` single dispatcher.** Add one facade that takes `Readonly<Omit<BlurFilter, 'kind'>>` plus the scratch contract and internally selects box vs Gaussian, matching the "give me the filter, I'll execute it" ergonomics callers get for every other filter. Box-vs-Gaussian selection is a backend policy (the `BlurFilter` type carries no `quality`); decide and document the rule (e.g. Gaussian as the faithful default, box as the multi-pass cheap path), and mirror the exact same dispatcher in `filters-gl`.
- **Document/point to the dispatch seam.** There is currently no central filter dispatcher in `render-wgpu` — callers invoke `apply*FilterToWgpu` directly. Add a one-line header note in `index.ts` (and the package README/docs entry) confirming the absence of a `register*` seam is by design and stating where descriptor→backend selection is expected to live. Surface to the user whether a `dispatchBitmapFilterToWgpu(state, src, dest, scratch, filter)` kind-switch belongs here (see Sequencing).
- **Scratch-target arity contract as a named type.** Several functions take `scratch: WgpuRenderTarget[]` with per-function size requirements documented only in prose (bevel needs three same-size targets). Introduce a small documented helper/type (e.g. `getWgpuFilterScratchCount(filter): number`) so callers can size scratch correctly without reading each function's doc comment. Define the count contract once.
- **Misuse vs sentinel audit.** Convolution `throw`s on bad matrix dimensions (correct — programmer error). Sweep the remaining `apply*` functions to confirm zero/degenerate parameters (radius 0, empty gradient stops, 1×1 kernel) take a clean no-op/blit path rather than producing garbage, and add the aliasing test (`out === source`) the project requires for out-style functions.

### Silver

Competitive and solid — matches a well-regarded GPU filter backend and covers professional edge cases and cross-backend consistency.

- **Custom-WGSL filter seam, branded.** The pipeline primitives (`createWgpuFilterPipeline` + `drawWgpuFilterPass`, plus dual/triple variants) already _are_ a custom-shader path. Promote it to a first-class, documented API: a `ShaderFilter` descriptor in `@flighthq/types` (WGSL/GLSL source + named uniform layout + input count) and `applyShaderFilterToWgpu(state, sources, dest, filter)` that compiles-and-caches user fragment shaders. This is the WebGPU analogue of OpenFL's `ShaderFilter`/`Shader` and the single biggest capability gap relative to an authoritative GPU filter library. Pair with `applyShaderFilterToGl`.
- **Larger-kernel convolution path.** Current cap is 7×7 (`MAX_KERNEL = 49`) with a `throw` above it. Add a separable/tiled or storage-buffer-backed path (or a documented two-pass decomposition for separable kernels) so professional sharpen/emboss/custom kernels beyond 7×7 work on GPU instead of forcing the surface fallback. At minimum, change the hard `throw` into a documented capability boundary with a clear fallback signal.
- **Quality/downsample tiers for the blur-derived family.** Add an optional `quality`/downsample factor to the blur, glow, bevel, and shadow paths (render the blur at half/quarter resolution, upsample) — the standard professional trick for large-radius blurs at interactive cost. Keep it a backend option that maps to the same visual target as the surface/GL references.
- **Linear-sampling Gaussian optimization.** The current Gaussian loops one `textureSampleLevel` per tap; the canonical GPU optimization halves taps by exploiting bilinear sampling (weighted dual-texel offsets). Implement it behind the same `applyGaussianBlurFilterToWgpu` signature so callers see no change but cost drops ~2x for large sigma.
- **Premultiplied-alpha correctness sweep + cross-backend parity gate.** Audit every pass for consistent premultiplied vs straight-alpha handling (convolution does a straight-RGB round-trip for `preserveAlpha`; blurs sample premultiplied). Add functional-test scenes (per filter) wired through `test:parity` so `filters-wgpu`, `filters-gl`, and `filters-surface` are pixel-compared and disagreements fail CI — this is the concrete mechanism for "cross-backend consistency."
- **Pipeline cache lifecycle.** Pipelines are cached per `WgpuRenderState` in module-level `WeakMap`s. Add an explicit `destroyWgpuFilterPipelines(state)` (and per-pipeline `destroyWgpuFilterPipeline`) so callers can deterministically free `GPUShaderModule`/`GPURenderPipeline` resources on state teardown (`destroy*` per the GPU-resource verb rule), rather than relying solely on GC of the `WeakMap`.
- **Gradient ramp resource ownership.** `createWgpuGradientRampTexture` returns a `GPUTexture` the caller must track; add a matching `destroyWgpuGradientRampTexture` and document the acquire/destroy bracket, plus internal caching keyed on (colors, alphas, ratios) so repeated gradient-bevel/glow frames don't re-upload identical ramps.

### Gold

Authoritative / AAA — the canonical WebGPU bitmap-filter executor, with nothing a domain expert finds missing.

- **Compute-shader passes for separable kernels.** Re-implement blur/convolution as WGSL compute shaders with workgroup-shared-memory line caching (the textbook high-performance separable-blur on GPU), selected automatically over the fragment path when the device/limits support it. Keep the fragment path as the fallback for parity and reduced-capability adapters.
- **Filter-chain fusion / batched application.** `applyBitmapFilterChainToWgpu(state, source, dest, scratch, filters[])` that runs an ordered list with internal ping-pong, minimizing intermediate target allocations and (where safe) fusing adjacent passes (e.g. tint+blit, color-matrix+color-matrix multiply-compose) into single passes. This is the real-world hot path (display objects carry filter _lists_) and the place GPU backends earn their performance reputation.
- **Half-float / HDR target support.** Support `rgba16float` filter targets end-to-end (blur weight accumulation, color-matrix, glow) for high-dynamic-range and banding-free large blurs, with the format threaded through the pipeline descriptors and the gradient ramp.
- **Exhaustive descriptor coverage + new adjustment filters (cross-package).** Once `@flighthq/types`/`@flighthq/filters` add the levels/curves/threshold/gradient-map adjustment family the depth review noted as absent across _all_ backends, implement `applyLevelsFilterToWgpu`, `applyCurvesFilterToWgpu`, `applyThresholdFilterToWgpu`, `applyGradientMapFilterToWgpu` (the last reusing `createWgpuGradientRampTexture`). These are LUT/color passes that map naturally to a single fullscreen WGSL pass. (Gold for this package is gated on the data-package decision — see Sequencing.)
- **Full error/limits handling.** Graceful, sentinel-returning behavior when device limits are exceeded (max texture dimension, max uniform buffer size for large matrices, unsupported formats): return `false`/`null` and let callers fall back to `filters-surface`, never silently produce wrong pixels or throw on a recoverable capability gap.
- **Comprehensive test + bench suite.** Per-filter pixel-oracle unit tests, the cross-backend parity gate (Silver) extended to `test:regression` fingerprints, aliasing tests for every out-style function, and a micro-benchmark harness reporting pass cost per filter at representative sizes/radii so performance regressions are caught.
- **1:1 Rust-port parity (`flighthq-filters-wgpu`).** No Rust filter crate exists yet. Per the Rust map, GPU filters live over `render-wgpu`/wgpu with WGSL shared verbatim where possible. Build `flighthq-filters-wgpu` mirroring every `apply*_filter_to_wgpu` free function, sharing WGSL source strings, and conforming against the TS backend and the `displayobject-skia`/`filters-surface` deterministic reference via the parity matrix. Record any intentional TS↔Rust divergence in the conformance map.

## Sequencing & effort

Recommended order, dependencies, and items to surface before acting.

1. **Bronze first, in place, no new deps (small).** Convolution parameter tests, `applyBlurFilterToWgpu` facade, scratch-arity helper, sentinel/aliasing audit, and the dispatch-seam doc note are all internal to this package (plus mirrored facade in `filters-gl`). No `@flighthq/types` changes. Do these as one pass; run `npm run check` + the package's vitest.
2. **Custom-shader seam (Silver, medium) — needs `@flighthq/types` first.** Define `ShaderFilter` in the header layer before implementing `applyShaderFilterToWgpu`/`...ToGl`. This is a cross-backend, cross-package addition: surface the descriptor shape (uniform-layout representation, GLSL-vs-WGSL source handling) as a design decision to the user before building, since it sets the public custom-filter contract for the whole SDK.
3. **Cross-backend parity gate (Silver, medium).** Build functional-test scenes per filter and wire `test:parity`/`test:regression`. This is the single highest-leverage correctness investment and a prerequisite for trusting the compute/fusion/HDR rewrites in Gold without regressing visuals. Touches `tests/functional` and the render test harness, not this package's source.
4. **GPU performance work (Silver→Gold, large).** Linear-sampling Gaussian → quality/downsample tiers → larger-kernel convolution → compute passes → chain fusion → HDR. Order by ratio of value to risk; gate each behind the parity suite from step 3. Pipeline/gradient `destroy*` lifecycle (Silver) should land before HDR/format work since it touches the same descriptors.
5. **New adjustment filters (Gold) — blocked on a data-package decision.** Levels/curves/threshold/gradient-map are absent across _all_ filter backends. This is a `@flighthq/types` + `@flighthq/filters` scope question, not a `filters-wgpu` gap. Surface it to the user as a cross-package proposal; only after the descriptors exist should this package (and every sibling backend) implement them in lockstep.
6. **Rust parity (Gold, large, separate worktree).** `flighthq-filters-wgpu` is downstream of the TS package being stable — port after Bronze/Silver settle, sharing WGSL strings and conforming via the parity matrix against the deterministic `displayobject-skia`/`filters-surface` reference.

**Cross-package / design-decision items to raise explicitly:** (a) the `ShaderFilter` descriptor shape and where shader source/uniform layout live in `@flighthq/types`; (b) whether a kind-switch `dispatchBitmapFilterToWgpu` facade belongs in this package or in `render-wgpu`; (c) the levels/curves/threshold/gradient-map filter family as a `filters`/`types` addition affecting all backends; (d) the box-vs-Gaussian default policy for the unified `applyBlurFilterToWgpu`, which must match `filters-gl` and the surface/CSS references.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/filters-wgpu` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
