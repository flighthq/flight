---
package: '@flighthq/filters-gl'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/filters-gl.md
  - source
  - changes.patch
---

# Review: @flighthq/filters-gl

Evidence is the incoming bundle `incoming/builder-67dc46d64/head/packages/filters-gl/` plus `changes.patch`; findings are cited `67dc46d64:<path>`. The prior depth review (`reviews/depth/filters-gl.md`, solid/84) is absorbed and superseded here. The charter is a seed-stub (North star / Boundaries / Decisions / Open directions all `TODO`), so this is judged against the codebase-map AAA standard and each charter silence is flagged as a candidate Open direction at the end.

## Verdict

solid — **90/100**. A deep, idiomatic WebGL 2 leaf-shader set that covers the entire `@flighthq/filters` descriptor set 1:1, with strong allocation discipline, per-state program caching, and now a complete scratch-count helper family. The two passes recorded in the status doc verifiably landed and closed three of the four depth-review gaps (knockout, typed kernel caps, scratch-sizing helpers). It is held below "authoritative" by one real correctness-of-claim issue (`clearGlFilterProgramCache` does not actually free GPU programs despite being documented as "deterministic GPU-resource release"), the structurally-unavoidable absence of in-package pixel conformance (jsdom can't read back GL), and a handful of small symmetry gaps.

## Status-doc verification (AS-CLAIMED → verified)

Every load-bearing claim in `status.md` checks out against the diff:

- **Drop-shadow knockout** — `67dc46d64:packages/filters-gl/src/glDropShadowFilter.ts`: the `if (filter.knockout) return;` early-out is gone; knockout now routes through `applyGlInvertTintPass` and suppresses the source blit (`if (!hideObject && !knockout)`), with `hideObject`/`knockout` combined independently. Matches the bevel/glow convention. ✓
- **Scratch-count family complete** — `glScratchCount.ts` exports all 13 helpers; multi-pass return 3, sharpen returns 2, and the five single-pass filters (color-matrix, convolution, displacement, median, pixelate) return 0. Every `apply*FilterToGl` now has a matching `get*FilterGlScratchCount` except blur (see Gaps). ✓
- **Shared inner-clip shader** — `glFilterProgramCache.ts` owns `INNER_CLIP_FRAGMENT_SRC` + a single `innerClipCache`; both `glInnerGlowFilter.ts` and `glInnerShadowFilter.ts` import and reuse it, so one program compiles per state. `ALL_CACHES` has 17 entries. ✓
- **Typed kernel caps** — `GL_CONVOLUTION_MAX_KERNEL_SIZE = 7` and `GL_MEDIAN_MAX_RADIUS = 2` are exported and used internally as the single source of truth (private `MAX_KERNEL`/`MAX_SAMPLES` derive from them). ✓
- **`applyBlurFilterToGl` descriptor-in wrapper** — present, `Readonly<Omit<BlurFilter,'kind'>>`, dispatching to `applyBoxBlurFilterToGl`; the box/Gaussian primitives remain. ✓
- **Test count 123** — confirmed by counting `it(`/`test(` blocks across `*.test.ts`. ✓
- **Package Map entry** — `tools/agents/docs/index.md` in the head tree carries a full `@flighthq/filters-gl` line documenting the leaf-shader-not-chain-applier boundary, the bounded kernels, and the out-of-scope chain dispatcher. ✓

The status doc is reliable; treat its deferred-items list as accurate.

## Present capabilities

- **Full descriptor coverage.** One `apply*FilterToGl` per `@flighthq/filters` `create*Filter`: bevel, blur (box + Gaussian + descriptor wrapper), color-matrix, convolution, displacement-map, drop-shadow, gradient-bevel, gradient-glow, inner-glow, inner-shadow, median, outer-glow, pixelate, sharpen.
- **Shared compositing primitives.** `glBlitShader` (`applyGlBlitPass`/`applyGlBlitOffsetPass`), `glTintShader` (`applyGlTintPass`/`applyGlInvertTintPass`), and `createGlGradientRampTexture` are the reusable building blocks the higher-order shadow/glow/bevel effects compose from.
- **Allocation + side-effect discipline.** All GPU programs cached in per-state `WeakMap<GlRenderState, GlFullscreenProgram>` maps centralized in `glFilterProgramCache.ts`; no module-top-level GL state, honoring `"sideEffects": false`. Filters allocate nothing — callers pass scratch targets. Shaders are `#version 300 es`, premultiplied `ONE / ONE_MINUS_SRC_ALPHA`, with zero-radius short-circuits and tail blits.
- **Scratch-requirement helpers.** `glScratchCount.ts` makes the per-filter ping-pong target count queryable instead of prose-documented — including the corrected sharpen=2 — so callers no longer read source to size arrays.
- **Typed, queryable kernel caps.** Convolution and median limits are exported constants used as the one authoritative value, replacing the depth review's doc-only caps.
- **Cache eviction seam.** `clearGlFilterProgramCache(state)` drops every per-filter cache entry for a state in one call (see the Contract & docs fit caveat about what it does _not_ do).
- **Test depth.** 123 colocated tests including 1×1 targets, zero/degenerate inputs, axis-only blurs, the exact-7×7 kernel boundary, zero-sum kernel divisor fallback, matrix-too-short throw, negative-radius clamp, block-size-over-target, bevel `full`, and a cache prime→clear→recompile contract test.

## Gaps vs an authoritative GPU image-filter backend

- **`clearGlFilterProgramCache` does not free GPU resources** (the one real defect). The function and the Package Map describe it as "deterministic GPU-resource release," but its body only calls `cache.delete(state)` for each cache (`67dc46d64:packages/filters-gl/src/glFilterProgramCache.ts:90`). `GlFullscreenProgram.program` is a real `WebGLProgram` (`67dc46d64:packages/types/src/GlFullscreenProgram.ts:6`), a non-GC GPU resource; dropping the WeakMap reference only makes it _eligible for GC_, at which point the `WebGLProgram` is reclaimed by the browser — it never calls `gl.deleteProgram`. By the SDK's own teardown vocabulary this is `dispose` semantics (detach-and-release-to-GC), **not** `destroy` semantics (free-a-resource-now). The doc/name claim of _deterministic_ release overstates it. `render-gl` itself frees programs deterministically elsewhere (`glShader.ts` calls `gl.deleteProgram`; `destroyGlRenderState` is tested to call it), so the deterministic path exists — this package just does not use it. Either the documentation should be corrected to "release cached programs to GC," or the function should iterate and `gl.deleteProgram` each cached program (making it genuinely deterministic and arguably a `destroy*`).
- **No `getBlurFilterGlScratchCount`.** The new `applyBlurFilterToGl` wrapper completes the descriptor-in _signature_ symmetry, but the scratch-count family has no blur entry, so the "every `apply*FilterToGl` has a matching `get*FilterGlScratchCount`" invariant the status doc claims is not literally complete. Blur takes a single `temp` rather than a `scratch[]`, which is exactly the shape mismatch worth a helper (or an explicit documented exception).
- **No in-package conformance/parity.** Correctness against the surface/canvas backends is not demonstrable here — jsdom's mock WebGL cannot read pixels back. This is architectural, not a defect of the package, but it means the package alone cannot prove cross-backend fidelity; that lives in `tests/functional/*-parity` (not yet written for filters per the deferred list).
- **Bounded kernels.** Convolution ≤ 7×7 and median ≤ radius 2 are now typed and honest, but a maximal library would offer a larger separable/tiled path. The status correctly defers this behind a `isConvolutionMatrixSeparable` helper landing in `@flighthq/filters` first (cross-package) and GPU instruction-limit validation (hardware), so it is parked, not missing-by-neglect.
- **No chain applier / kind dispatcher.** No `applyFiltersToGl(state, BitmapFilter[])`. This is a deliberate tree-shaking decision (a `switch(kind)` would retain every shader) and is now documented in the Package Map as out-of-scope-here. Defensible, but it does mean a consumer owns orchestration and scratch allocation end-to-end.

## Charter contradictions

None — the charter's North star, Boundaries, and Decisions are all unfilled `TODO`s, so there is no stated principle for the code to contradict. The package is internally consistent with the codebase-map design constraints (free functions, full unabbreviated names, explicit allocation, sentinels, single root export). The only doc/code tension is the `clearGlFilterProgramCache` release-semantics claim above, which is a Package-Map/source-comment issue, not a charter ruling.

## Contract & docs fit

**Lives up to the contract:**

- `@flighthq/types`-first types — `GlFullscreenProgram`, `GlRenderState`, `GlRenderTarget`, and the `*Filter` descriptors are all consumed from `@flighthq/types`/`@flighthq/render-gl`; the package defines no cross-package types inline.
- Full, globally self-identifying names: `apply<Filter>FilterToGl`, `get<Filter>FilterGlScratchCount`, `getGl<Shader>Shader`, `createGlGradientRampTexture`, `clearGlFilterProgramCache`. The `…ToGl` / `Gl…` infix cleanly separates this backend from the canvas/surface siblings.
- Filter signatures take `Readonly<Omit<XFilter,'kind'>>`, dropping the already-resolved dispatch tag.
- Single root `.` export, `"sideEffects": false`, colocated `*.test.ts` for every source file, `index.test.ts` present.
- Throws are reserved for programmer error (convolution: non-positive dims, over-cap kernel, matrix-too-short) — API misuse, not expected failure — matching the sentinel-vs-throw rule.
- Rust mirror exists (`crates/flighthq-filters-gl` is present in the bundle), satisfying the crate-mirror expectation; the status doc enumerates the divergence-map updates a Rust session owes (new zero-scratch helpers, `clearGlFilterProgramCache` ↔ `clear_gl_filter_program_cache`, `applyBlurFilterToGl`, shared-vs-per-filter inner-clip structure).

**Candidate doc revisions (user's gate, not the reviewer's):**

- The Package Map line and the source doc-comment for `clearGlFilterProgramCache` should be corrected from "deterministic GPU-resource release" to reflect that it releases cached programs _to GC_ (or the function should be changed to actually `gl.deleteProgram`). The current wording promises determinism the implementation does not provide.
- The status doc's "every `apply*FilterToGl` has a matching `get*FilterGlScratchCount`" framing should note the blur exception (no `getBlurFilterGlScratchCount`).

The Package Map is otherwise now in good shape for this package — the richer entry in the head tree (leaf-shaders-not-chain-applier, typed kernel caps, scratch helpers, out-of-scope dispatcher) matches the realized source and supersedes the depth review's "worth an explicit note" request.

## Candidate open directions (charter is a stub — these need the user to settle)

1. **`clearGlFilterProgramCache` semantics: dispose vs destroy.** Should this package release cached programs to GC (current behavior, rename/redoc as a `dispose`-style clear) or deterministically `gl.deleteProgram` each cached program (a true `destroy*`)? This is a real North-star question about whether `filters-gl` owns deterministic teardown of the programs it compiles.
2. **Scratch-helper completeness as an invariant.** Is "every applier has a scratch-count helper" a blessed contract (then blur needs one, or an explicit exception), or is it incidental?
3. **Where the conformance harness lives.** The package cannot self-prove pixel fidelity; the charter should state that cross-backend parity is owned by `tests/functional/filter-*-parity` and is a gating requirement, so the absence here is intentional rather than a hole.
4. **Kernel-cap ceiling and the larger-kernel path.** Is 7×7 / radius-2 the permanent GPU ceiling (with larger kernels explicitly delegated to surface/CPU), or a placeholder pending the separability helper and hardware validation? This is the one genuinely deferred _feature_.
5. **Boundary with `filters-wgpu`.** The status repeatedly flags WGPU lockstep. The charter should say whether the two GPU backends are contractually kept in feature-parity (knockout, scratch family, typed caps, shared inner-clip) or allowed to diverge.
6. **Color-space stance.** All passes are fixed sRGB-passthrough premultiplied (consistent with the SDK color decision). Worth recording as a Boundary so a future agent does not "add" a linear-light option.
