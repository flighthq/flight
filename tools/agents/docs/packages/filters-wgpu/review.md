---
package: '@flighthq/filters-wgpu'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/filters-wgpu.md
  - source
  - changes.patch
---

# Review: @flighthq/filters-wgpu

## Verdict

**solid — 90/100.** A faithful, full-coverage WebGPU (WGSL) executor of the canonical `@flighthq/filters` descriptor set, matching `filters-gl` one-for-one and exceeding the Canvas/CSS backends. This pass cleanly resolved the two prior depth gaps (convolution parameter coverage; pipeline-cache/side-effect hygiene) and added a real device-loss recovery path. What holds it back from authoritative is downstream-of-this-package work: no renderer actually consumes these `apply*FilterToWgpu` functions yet, and there are no cross-backend pixel-parity functional tests gating correctness. The package is near-complete _for its role_; the remaining points live in wiring and verification, not in missing filters.

## Present capabilities

Source: `incoming/builder-67dc46d64/head/packages/filters-wgpu/`.

One `apply*FilterToWgpu` per canonical filter descriptor — verified present and exported from `index.ts`: bevel, blur (`applyBlurFilterToWgpu` facade + `applyBoxBlurFilterToWgpu`

- `applyGaussianBlurFilterToWgpu`), colorMatrix, convolution, displacementMap, dropShadow, gradientBevel, gradientGlow, innerGlow, innerShadow, median, outerGlow, pixelate, sharpen. Each has a colocated `*.test.ts`.

Pipeline infrastructure (the part a thin backend would omit): `createWgpuFilterPipeline` / `createWgpuDualSourcePipeline` / `createWgpuTripleSourcePipeline` and matching `drawWgpu{Filter,DualSource,TripleSource}Pass` — a real 1/2/3-input fullscreen-pass abstraction with `premul`/`replace` blend selection and a `setUniforms(f32, i32)` callback. `clearWgpuFilterTarget`, blit helpers (`applyWgpuBlitPass`/`applyWgpuBlitOffsetPass` + `getWgpu*Shader`), tint/clip helpers (`applyWgpuTintPass`/`applyWgpuInvertTintPass`/ `applyWgpuInnerClipPass` + accessors), and the gradient-ramp texture family (`createWgpuGradientRampTexture`, `getWgpuGradientRampTexture`, `destroyWgpuGradientRampTextures`). `getWgpuFilterScratchCount` reports the scratch-target count a caller must allocate.

Changes verified against `changes.patch` (status doc claims confirmed):

- **Pipeline-cache centralization is real and complete.** `wgpuFilterPipelineCache.ts` (new) declares all 17 per-filter pipeline `WeakMap`s as `const` exports plus `ALL_WGPU_FILTER_PIPELINE_CACHES`. I confirmed the per-filter files (bevel, blit, blur, …) now _import_ their cache from this file and deleted their local `WeakMap` declarations — e.g. `wgpuBevelFilter.ts` drops `bevelCompositePipelines` for the imported `bevelCompositeCache`. The motivation in the status doc checks out: const `VariableStatement`s replace 17 module-load `registerWgpuFilterPipelineCache(...)` `CallExpression`s that `packages:check` flagged as side effects.
- **`destroyWgpuFilterPipelines` now evicts all caches.** It destroys the uniform buffer, deletes the filter state, then iterates _both_ `ALL_WGPU_FILTER_PIPELINE_CACHES` (static) and the dynamic `pipelineCacheRegistry` (still fed by the retained public `registerWgpuFilterPipelineCache`). Documented as idempotent device-loss recovery; the reasoning is sound. Three new `wgpuFilterPass.test.ts` cases cover eviction and the register seam (17 `it(` blocks total in that file).
- **Convolution parameter coverage is complete** — the prior depth's flagged gap is closed. `wgpuConvolutionFilter.ts` honors `preserveAlpha` (straight-RGB reconstruction against original alpha), `clamp` edge mode vs. `edgeColor` fill, `bias`, `divisor` (with `getAutoDiv` matrix-sum fallback), up to a 7×7 (`MAX_KERNEL = 49`) kernel.
- **Displacement-map WebGPU parity backend added** — `tests/functional/filter-displacement-map-parity/src/render.webgpu.ts` is present in the patch (dual-source pass, Y-flip convention), closing the one parity test that lacked a wgpu backend.

Quality signals hold from the prior depth review: hand-written WGSL is algorithmically correct (separable Gaussian, exp weights, premultiplied composite, alias-safe ping-pong), allocation is explicit (caller supplies `scratch`/`temp`), the package is side-effect-free, single root entry, `sideEffects: false`, and naming is exemplary and symmetric with `filters-gl` (`apply<Filter>FilterToWgpu`, `Wgpu`-prefixed infrastructure).

## Gaps

- **Not consumed by any renderer (cross-package).** No `apply*FilterToWgpu` is referenced anywhere outside this package — `render-wgpu` and `render` contain no filter-dispatch wiring, and there is no `applyBitmapFilterToWgpu`/`dispatchBitmapFilterToWgpu` anywhere in `packages/`. The `index.ts` note says descriptor→backend dispatch "belongs in the render pipeline (`render-wgpu`)," but that wiring does not yet exist. This is the same for `filters-gl` (no `FilterToGl` consumer in `render-webgl` either), so it is a **shared filter-backend-family integration gap**, not a filters-wgpu defect — but it means the package's correctness is currently only unit-asserted, never exercised end-to-end by a real render.
- **No cross-backend pixel-parity tests yet.** The unit tests are "does not throw" / shape assertions (jsdom-mocked WGSL — the shaders never actually execute). The status doc itself flags color-matrix and convolution as the best single-pass parity candidates; these remain deferred. Until a parity gate runs, "matches the surface/GL reference" is asserted by reading the WGSL, not measured.
- **Gradient-ramp textures are outside the device-loss eviction sweep.** `rampCaches` (in `wgpuGradientRamp.ts`) is a separate `WeakMap` not in `ALL_WGPU_FILTER_PIPELINE_CACHES`; `destroyWgpuFilterPipelines` does not evict it. Reclamation is via the separate `destroyWgpuGradientRampTextures`. After a device loss a caller must remember to call _both_ or a stale ramp `GPUTexture` survives. Defensible as a separable concern, but the asymmetry is a recovery-completeness footgun worth a note.
- **Convolution capped at 7×7**, larger kernels `throw` and point at the surface path. Acceptable as a uniform-buffer limit; a storage-buffer or two-pass decomposition is the future path (status lists it Gold/out-of-scope).
- **Domain extras absent across the whole `filters` family** (levels/curves/threshold/ gradient-map adjustment filters) — a `@flighthq/types` + `@flighthq/filters` scope question, not a backend depth gap.

## Charter contradictions

None. The charter is a stub (only "What it is" is seeded; North star, Boundaries, Decisions, Open directions are all `TODO`), so there is no stated principle, boundary, or decision for the code to contradict. Everything below the verdict is therefore measured against the codebase-map AAA standard, and each assumption is surfaced as a candidate Open direction.

## Contract & docs fit

Lives up to the contract well:

- **Full unabbreviated names, backend-suffix symmetry.** `apply<Filter>FilterToWgpu` exactly mirrors `filters-gl`'s `...ToGl`; infrastructure carries the `Wgpu` prefix. Every symbol is globally self-identifying.
- **Types come from `@flighthq/types`.** `BlurFilter`, `ConvolutionFilter`, `DisplacementMapFilter`, `WgpuRenderState`, `WgpuRenderTarget`, etc. are all imported, not defined inline. `import type` is on its own lines.
- **Explicit allocation / `out`-style scratch.** Filters allocate nothing; the caller supplies `scratch[]`/`temp`. `getWgpuFilterScratchCount` is the allocation oracle.
- **Sentinels, not throws, for expected cases** — but with a deliberate exception: `applyConvolutionFilterToWgpu` `throw`s on non-positive or oversized matrix dimensions. These are precondition/programmer-error violations (API misuse), which the SDK rule explicitly permits throwing for. Consistent.
- **Side-effect-free, single root `.` export, `sideEffects: false`.** Status claims `packages:check` is clean for the package; the diff supports it (the 17 top-level `CallExpression`s are gone). `wgpuFilterPipelineCache.ts` and `wgpuTestHelper.ts` are the only files without a colocated `*.test.ts`; both export no functions (only `const` WeakMaps / test fixtures) and neither is in `index.ts`, so `exports:check` is satisfied — consistent with the status doc's "no issues" claim.
- **Teardown verbs** are used correctly: `destroyWgpuFilterPipelines` / `destroyWgpuGradientRampTextures` free non-GC GPU resources (the `destroy*` verb), not `dispose*`. On-pattern.
- **Rust mirror** (`flighthq-filters-wgpu`) is declared in the charter front matter; the status correctly parks it as downstream until TS stabilizes.

Structural-forks fit (`structural-forks.md`):

- **Fork B (closed union vs. open registry) — a contract-fit drift to flag.** The per-filter `apply*` functions are an _open_ family (no central kind-switch; `index.ts` deliberately refuses a `dispatchBitmapFilterToWgpu` facade, citing co-location of dispatch with the render loop — a defensible, well-argued stance). But `getWgpuFilterScratchCount` re-introduces a **closed `switch(filter.kind)`** over every built-in filter kind. It returns `0` for unknown kinds (sentinel, defensive — good), yet a user introducing a custom filter kind cannot declare its scratch budget through it. This is the fork-B pattern: a closed taxonomy that the rest of the package avoids. It is _not_ a hot per-pixel loop (called once per filter application), so there is no bundle/perf tax of the kind fork B usually worries about — the cost is purely extensibility. Worth surfacing as a candidate Open direction (scratch-count as a property the descriptor or a registry carries, rather than a switch), not an automatic fix.
- **Fork D (Wasm mixing).** `filters` as data descriptors are named in fork D as a mixable-leaf candidate, but `filters-wgpu` itself is a GPU-backend seam (a runtime backend, fork D axis 1), not a value-in/value-out leaf — it is correctly all-or-nothing with a device, not a `-rs` mixing candidate. No drift.

Candidate doc revisions:

- The Package Map in `tools/agents/docs/index.md` lists `@flighthq/filters` and its backends only obliquely ("explicit Canvas/CSS and multi-pass WebGL backends"); it does not enumerate `filters-wgpu` / `filters-gl` / `filters-surface` as first-class backend packages. As the filter-backend family has clearly become a real `<subject>-<backend>` set, a Package Map line naming the backend packages would match the shape the work has taken. Flag as a candidate revision (user's gate).

## Candidate open directions

The charter is a stub; these are the questions a reviewer had to assume past, surfaced for the user to settle into the charter:

1. **North star / boundary: is `filters-wgpu` _only_ an executor?** The code treats the filter vocabulary as owned by `@flighthq/filters` and this package as a pure backend. Confirming that as a Boundary (and that adding a _new filter type_ is out of scope here — it starts in `filters`/`types`) would lock the package's identity.
2. **Where does descriptor→backend dispatch live, and when is it wired?** The `index.ts` note asserts it belongs in `render-wgpu`, but no such wiring exists in any renderer yet. Is the filter family expected to stay unconsumed until a coordinated render-side dispatch pass, or should a thin `applyBitmapFilterToWgpu` dispatcher live here after all? A Decision here would resolve the integration gap above.
3. **Is a cross-backend pixel-parity gate a charter-level requirement?** The whole correctness story currently rests on reading WGSL. Declaring parity tests as the acceptance bar (and which filters must pass pixel-exact vs. tolerance) would turn the deferred items into a blessed roadmap rather than worker discretion.
4. **Scratch-count extensibility (fork B).** Should custom filter kinds be able to declare a scratch budget — i.e. should `getWgpuFilterScratchCount` become registry-backed or read a descriptor property — or is the closed switch acceptable because custom filters are expected to drive the pipeline primitives directly?
5. **Device-loss recovery completeness.** Should `destroyWgpuFilterPipelines` also evict the gradient-ramp textures (one teardown call for all GPU resources held against a state), or is the two-call split (`destroyWgpuFilterPipelines` + `destroyWgpuGradientRampTextures`) the intended boundary?
