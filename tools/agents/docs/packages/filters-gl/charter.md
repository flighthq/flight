---
package: '@flighthq/filters-gl'
crate: flighthq-filters-gl
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# filters-gl — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

The WebGL 2 shader backend for the SDK's bitmap-filter effects — the GPU implementation layer that turns the plain `@flighthq/filters` data descriptors (blur, glow, bevel, drop shadow, color matrix, convolution, displacement, median, pixelate, sharpen, and the gradient/inner variants) into multi-pass fragment-shader render passes over `render-gl`'s `GlRenderTarget`s.

The package is a collection of **leaf shaders**, one `apply*FilterToGl` per filter descriptor, plus the shared compositing primitives those higher-order effects build from (`applyGlBlitPass` / `applyGlBlitOffsetPass`, `applyGlTintPass` / `applyGlInvertTintPass`, `createGlGradientRampTexture`) and a per-state program cache (`glFilterProgramCache.ts` + `clearGlFilterProgramCache`). It is deliberately **not** a chain applier: there is no `applyFiltersToGl(state, BitmapFilter[])` kind-dispatcher, because a `switch(kind)` would retain every shader and tax the bundle of every consumer.

Where it ends and a neighbor begins:

- `@flighthq/filters` owns the **descriptors** (the plain data and the `create*Filter` constructors); `filters-gl` only consumes them, taking `Readonly<Omit<XFilter,'kind'>>` with the dispatch tag already resolved.
- `@flighthq/render-gl` owns the **GL plumbing** — render state, targets, fullscreen programs, deterministic teardown (`gl.deleteProgram`); `filters-gl` composes that plumbing into filter passes.
- The sibling backends `filters-canvas` / `filters-css` / `filters-surface` cover the same descriptor set on their substrates; `filters-gl` is the WebGL 2 member of that family, with `filters-wgpu` as its GPU sibling.
- **Orchestration and scratch-target allocation belong to the caller.** `filters-gl` allocates nothing; the caller passes scratch targets and consults the `get*FilterGlScratchCount` helpers to size them.

## North star (proposed)

_Proposed durable principles inferred from the design and the SDK forks. Confirm or revise before blessing._

- **One leaf shader per descriptor, no chain dispatcher.** The package exposes exactly one `apply*FilterToGl` per `@flighthq/filters` descriptor and never a `switch(kind)` chain applier — so a consumer importing one filter pays for one shader, honoring the bundle invariant. Orchestration is the caller's, by design.
- **Caller owns memory; the package allocates nothing.** Filters write into caller-supplied scratch targets; the scratch requirement is _queryable_ (`get*FilterGlScratchCount`), not prose-documented. Allocation and side-effect boundaries are explicit, and `"sideEffects": false` is honored (no module-top-level GL state; all programs cached in per-`GlRenderState` `WeakMap`s).
- **A faithful, idiomatic implementation of someone else's descriptors.** The descriptor set is owned by `@flighthq/filters`; this package's job is 1:1 fidelity to it on WebGL 2 — same coverage, same color convention (sRGB-passthrough, premultiplied `ONE / ONE_MINUS_SRC_ALPHA`), same semantics — not to invent new effects.
- **Globally self-identifying names with a clean backend infix.** The `…ToGl` / `Gl…` infix cleanly separates this backend from its canvas/surface/wgpu siblings while keeping full, unabbreviated type words.
- **Teardown vocabulary means what it says.** `dispose`/`destroy`/`clear` semantics are stated honestly: a name must not promise determinism the implementation does not provide (see Open directions on `clearGlFilterProgramCache`).

## Boundaries (proposed)

_Proposed in-scope / non-goals, drawn from the review and the neighbor packages. Confirm before blessing._

In scope:

- A `apply*FilterToGl` leaf shader for every `@flighthq/filters` descriptor, the shared blit/tint/gradient-ramp compositing primitives, the per-state program cache, and the `get*FilterGlScratchCount` scratch-sizing helpers.
- Typed, exported kernel caps as the single source of truth (`GL_CONVOLUTION_MAX_KERNEL_SIZE`, `GL_MEDIAN_MAX_RADIUS`).
- Single root `.` export, colocated `*.test.ts` per source file, `"sideEffects": false`.

Non-goals (explicit):

- **No chain applier / kind dispatcher** (`applyFiltersToGl`). If ever wanted, it belongs in `render-gl` or a `filters-gl-chain` neighbor — never here.
- **No descriptor ownership.** Constructors and the descriptor data model stay in `@flighthq/filters`.
- **No in-package pixel conformance.** jsdom's mock WebGL cannot read pixels back; cross-backend parity is proven elsewhere (see Open directions on where the harness lives), not by self-test.
- **No new color-space modes.** Passes are fixed sRGB-passthrough premultiplied, consistent with the SDK-wide color decision; a linear-light option is out of scope unless the SDK color decision changes.

## Decisions

None blessed yet.

## Open directions

Every candidate question below needs you to settle it before it becomes a Decision. Items 1–6 are the review's candidate open directions; items 7–8 are SDK-wide structural forks that touch this package.

1. **`clearGlFilterProgramCache` semantics: dispose vs destroy.** Today it only `cache.delete(state)`s, releasing each cached `WebGLProgram` _to GC_ — yet both the function doc and the Package Map call it "deterministic GPU-resource release." Should it stay a GC-release `dispose`-style clear (redoc/rename to match), or iterate and `gl.deleteProgram` each cached program (a true, deterministic `destroy*`)? `render-gl` already frees programs deterministically elsewhere, so the destroy path exists; this is a North-star question about whether `filters-gl` owns deterministic teardown of the programs it compiles. Until settled, the doc wording overstates the guarantee.
2. **Scratch-helper completeness as an invariant.** Is "every `apply*FilterToGl` has a matching `get*FilterGlScratchCount`" a _blessed contract_ — in which case blur needs a `getBlurFilterGlScratchCount` (or an explicit documented exception, since blur takes a single `temp` rather than a `scratch[]`) — or is the family incidental and the blur gap acceptable?
3. **Where the conformance/parity harness lives.** The package structurally cannot self-prove pixel fidelity (jsdom can't read GL back). Should the charter state that cross-backend parity is owned by `tests/functional/filter-*-parity` and is a gating requirement — making the absence here intentional rather than a hole? (No such functional parity test exists yet per the deferred list.)
4. **Kernel-cap ceiling and the larger-kernel path.** Is convolution ≤ 7×7 / median ≤ radius-2 the _permanent_ GPU ceiling (larger kernels explicitly delegated to the surface/CPU backend), or a placeholder pending an `isConvolutionMatrixSeparable` helper in `@flighthq/filters` (cross-package) plus GPU instruction-limit validation (hardware)? This is the one genuinely deferred _feature_.
5. **Boundary with `filters-wgpu`.** The status doc repeatedly flags WGPU lockstep. Are the two GPU backends contractually kept in feature-parity (knockout, scratch family, typed caps, shared inner-clip), or allowed to diverge? A Decision here governs how every future change is mirrored.
6. **Color-space stance as a recorded Boundary.** All passes are fixed sRGB-passthrough premultiplied (consistent with the SDK color decision). Worth recording explicitly as a Boundary so a future agent does not "add" a linear-light option — confirm this is a hard non-goal.
7. **Fork B — closed union vs. open registry.** The SDK default is registry-by-default for maximal tree-shaking, and this package already embodies it (no `switch(kind)` chain applier; per-filter leaf functions). Confirm the no-dispatcher stance is the blessed expression of fork B for this package, and that any future chain dispatcher must dispatch _without_ retaining unused shaders (or live in a neighbor).
8. **Fork D — runtime backend seam vs. Wasm `-rs` mixing.** `filters-gl` is a GPU backend behind `render-gl` (the runtime-backend axis). It is _not_ a value-typed mixable leaf — its seam carries `GlRenderState` GPU identity, so it is all-or-nothing, unlike `surface`/`filters` descriptors. Confirm the charter records that `filters-gl` is not a Wasm-mixable candidate, so a future agent does not target it for a `-rs` drop-in.
