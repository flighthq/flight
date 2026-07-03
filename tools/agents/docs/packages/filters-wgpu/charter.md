---
package: '@flighthq/filters-wgpu'
crate: flighthq-filters-wgpu
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# filters-wgpu — Charter

## What it is

The WebGPU (WGSL) shader backend for the SDK's bitmap-filter effects — the GPU executor that turns the plain `@flighthq/filters` data descriptors into multi-pass WGSL render passes over `WgpuRenderTarget`s. It is one cell in the `<subject>-<backend>` filter family (`filters-surface` / `filters-gl` / `filters-css` / `filters-canvas` / `filters-wgpu`): it owns _how a filter runs on WebGPU_, not _what filters exist_ (that vocabulary lives in `@flighthq/filters` and `@flighthq/types`). Its exported surface is one `apply<Filter>FilterToWgpu` per canonical descriptor plus the fullscreen-pass pipeline primitives (`createWgpuFilterPipeline` / dual / triple + `drawWgpu*Pass`), the gradient-ramp texture family, and `getWgpuFilterScratchCount` as the caller's allocation oracle. It ends where the render loop begins: descriptor→backend dispatch is deliberately _not_ here.

## North star (proposed)

_Inferred from the design and the SDK-wide forks — edit to your own framing._

- **A pure executor, not a vocabulary.** The filter taxonomy is owned upstream by `@flighthq/filters` / `@flighthq/types`; this package only _runs_ descriptors on WebGPU. A new filter type starts upstream, never here.
- **One-for-one backend symmetry.** Every canonical filter has exactly one `apply<Filter>FilterToWgpu`, mirroring `filters-gl`'s `...ToGl` name-for-name, so the filter family reads as a single matrix across backends. Backend infrastructure carries the `Wgpu` prefix and is globally self-identifying.
- **Explicit allocation, caller-owned scratch.** Filters allocate nothing; the caller supplies `scratch[]`/`temp`, and `getWgpuFilterScratchCount` is the published budget. WGSL is alias-safe (ping-pong) and the package is import-side-effect-free.
- **Deterministic GPU-resource teardown.** GPU resources held against a state are freed with `destroy*` (not `dispose*`), and device-loss recovery is a first-class, idempotent path — caches evict and pipelines rebuild rather than leak.
- **Correctness is measured, not asserted by reading WGSL.** The bar is cross-backend pixel agreement with the software/GL reference, not unit "does-not-throw" shape checks alone. _(Proposed — see Open directions 3.)_

## Boundaries (proposed)

In scope:

- A WGSL executor for every canonical `@flighthq/filters` descriptor, at parity with `filters-gl`.
- The public custom-shader seam: the 1/2/3-input fullscreen-pass pipeline primitives, blit/tint/clip helpers, gradient-ramp textures, and the scratch-count oracle.
- WebGPU-specific resource lifecycle: pipeline caches, uniform buffers, gradient-ramp `GPUTexture`s, and their device-loss eviction/teardown.

Non-goals (proposed):

- **Defining or extending the filter vocabulary** — new filter kinds, levels/curves/threshold/gradient-map adjustment filters, etc. begin in `@flighthq/filters` + `@flighthq/types`, not here.
- **Descriptor→backend dispatch** — the `dispatchBitmapFilterToWgpu` kind-switch belongs in `render-wgpu` so the dispatch table stays co-located with the render loop. _(Proposed — see Open directions 2.)_
- **Wasm `-rs` mixing.** As a GPU runtime backend bound to a device (fork D, axis 1), this is all-or-nothing, not a value-in/value-out mixable leaf like `surface`.
- Canvas2D/CSS/software execution — owned by the sibling backend cells.

## Decisions

None blessed yet.

## Open directions

Every candidate question carried forward from `review.md`, plus the structural forks that touch this package. These are for the user to settle, not for an agent to assume past.

1. **Is `filters-wgpu` _only_ an executor?** Confirm as a Boundary that the filter vocabulary is owned by `@flighthq/filters` and that adding a new filter _type_ is out of scope here (it starts in `filters`/`types`). This would lock the package's identity.
2. **Where does descriptor→backend dispatch live, and when is it wired?** `index.ts` asserts dispatch belongs in `render-wgpu`, but no renderer consumes any `apply*FilterToWgpu` yet (same shared integration gap as `filters-gl`). Is the family expected to stay unconsumed until a coordinated render-side dispatch pass, or should a thin `applyBitmapFilterToWgpu` dispatcher live here after all? A Decision here resolves the integration gap.
3. **Is a cross-backend pixel-parity gate a charter-level requirement?** Correctness currently rests on reading WGSL (jsdom-mocked, shaders never execute). Declaring parity tests as the acceptance bar — and which filters must pass pixel-exact vs. tolerance (color-matrix and convolution are flagged as the best single-pass candidates) — would turn the deferred items into a blessed roadmap rather than worker discretion.
4. **Scratch-count extensibility (fork B — closed union vs. open registry).** `getWgpuFilterScratchCount` is a closed `switch(filter.kind)` over built-in kinds (returning `0` for unknown, defensively) inside an otherwise _open_ `apply*` family. A custom filter kind cannot declare its scratch budget through it. It is not a hot per-pixel loop, so the cost is purely extensibility, not bundle/perf. Should scratch-count become registry-backed / a descriptor property, or is the closed switch acceptable because custom filters are expected to drive the pipeline primitives directly?
5. **Device-loss recovery completeness.** Gradient-ramp textures (`rampCaches`) are outside `ALL_WGPU_FILTER_PIPELINE_CACHES`; `destroyWgpuFilterPipelines` does not evict them — a caller must also call `destroyWgpuGradientRampTextures` or a stale ramp `GPUTexture` survives. Should one teardown call free all GPU resources held against a state, or is the two-call split the intended boundary?
6. **Convolution kernel ceiling.** Convolution is capped at 7×7 (`MAX_KERNEL = 49`); larger kernels `throw` and point at the surface path (a uniform-buffer limit). Is a storage-buffer or two-pass decomposition a charter-level future path, or is the cap a blessed boundary with the surface fallback as the answer?
7. **Doc-shape revision (user's gate).** The Package Map in `tools/agents/docs/index.md` names the filter backends only obliquely ("Canvas/CSS and multi-pass WebGL backends") rather than enumerating `filters-wgpu` / `filters-gl` / `filters-surface` as first-class `<subject>-<backend>` packages. Should the map gain explicit backend-package lines to match the shape the work has taken?
