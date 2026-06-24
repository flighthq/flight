---
package: '@flighthq/filters-surface'
crate: flighthq-filters-surface
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# filters-surface — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/filters-surface` is the **CPU (software) pixel backend** for the SDK's bitmap-filter descriptors. For each `@flighthq/filters` data descriptor it exposes a colocated `apply<Filter>ToSurface(out, [blurBuffer], source, filter)` adapter that turns the descriptor into actual pixels in a `Uint8ClampedArray`, by orchestrating the kernels in `@flighthq/surface`. It is the surface sibling of the GPU backend `@flighthq/filters-gl` and the string backends `filters-canvas`/`filters-css`: same descriptor set, different substrate.

Beyond the 1:1 per-descriptor adapters (blur, color-matrix, convolution, displacement-map, drop/inner shadow, outer/inner/gradient glow, bevel/gradient-bevel, median, sharpen, pixelate), the package now carries a compositing/bounds/list/scratch tier: role-aware compositing (`compositeFilterResultToSurface` with `knockout`/`hideObject`), per-kind bounds expansion (`getFilterSurfaceBounds`), an ordered filter-list dispatcher (`applyFilterListToSurface`), and a scratch-buffer pool (`acquireFilterSurfaceScratch`/`releaseFilterSurfaceScratch`).

Where it ends: it does **not** re-implement image processing — the heavy per-pixel work lives in `@flighthq/surface`; this package is the thin descriptor→kernel orchestration seam. It does not own the filter descriptors themselves (`@flighthq/filters`), the shared angle/distance→offset math (now `getShadowFilterOffset` in `@flighthq/filters`), or scene-graph integration — it is a leaf the render pipeline calls.

## North star (proposed)

_These are inferred from the design and the SDK-wide forks, not yet blessed. Edit freely._

1. **Thin orchestration, not re-implementation.** The package binds descriptors to `@flighthq/surface` kernels; the moment it starts doing its own per-pixel image math, the boundary is wrong. Heavy lifting belongs in `surface`; the value here is the faithful descriptor→pixels seam.
2. **One adapter per descriptor, mechanically.** Every `@flighthq/filters` descriptor has exactly one colocated `apply<Filter>ToSurface` with `out`-first argument order, documented aliasing contracts, `Readonly` inputs, and `quality`/`color+alpha`/`angle+distance` translated at the seam. The shape is uniform so a new filter has an obvious home.
3. **Explicit allocation and alias safety.** `acquire*`/`release*` brackets for the scratch pool, `create*` for always-allocating variants, `out`-param math that reads inputs into locals before writing. No hidden allocation in the hot path.
4. **Backend symmetry with `filters-gl`/`filters-canvas`.** This is one of several interchangeable backends over a shared descriptor set; its compositing roles, bounds expansion, and list semantics should agree with the other backends' answers rather than diverge per-substrate.
5. **Rust conformance.** `flighthq-filters-surface` is a 1:1 conformance target (it is also a value-typed Wasm-mixable leaf); the TS surface is authoritative and the Rust crate must follow it.

## Boundaries (proposed)

**In scope (proposed):**

- One CPU adapter per `@flighthq/filters` descriptor, into a `Uint8ClampedArray`/`SurfaceRegion`.
- Backend-side compositing (role ordering, knockout/hideObject), per-kind bounds expansion, ordered filter-list dispatch, and the scratch-buffer pool that serves them.

**Non-goals (proposed):**

- Re-implementing image-processing kernels — those live in `@flighthq/surface`.
- Owning the filter descriptors or their shared descriptor-level math (`@flighthq/filters`).
- GPU or string backends (`filters-gl`, `filters-canvas`, `filters-css`).
- Scene-graph or render-pipeline coordination — this is a leaf the caller drives.

## Decisions

None blessed yet.

## Open directions

Every candidate question carried forward from `review.md` (the charter is a stub, so these are the points a reviewer had to assume), plus the structural forks that touch this package:

1. **Closed switch vs. registry for filter-kind dispatch (fork B).** `getFilterCompositeRole`, `getFilterSurfaceBounds`, and `applyOneFilter` are closed `switch(kind)` unions. They run once-per-filter (not per-pixel), so the hot-loop exception that would justify a closed union is weak, and an unregistered kind currently produces a _quiet wrong answer_ (`getFilterCompositeRole` → `'outer'`, `getFilterSurfaceBounds` → unexpanded source bounds) rather than a sentinel. Should these become a per-kind registry so a custom/vendor filter can register its role, bounds, and adapter — i.e. is `filters-surface` a fixed built-in set, or extensible? This is a Boundary decision.
2. **Where does compositing-role / bounds metadata live?** `getFilterCompositeRole` and the bounds-expansion reach are backend-agnostic facts about a filter that `filters-gl`/`filters-canvas` will also want. Should this metadata live on the descriptor (in `@flighthq/filters` / `@flighthq/types`) instead of being re-derived per backend? Cross-package home question.
3. **Kind-literal duplication.** `surfaceFilterComposite.ts` and `surfaceFilterBounds.ts` switch on raw string literals (`case 'DropShadowFilter'`) while `surfaceFilterList.ts` switches on the imported `*Kind` constants. Should all three be unified onto the `*Kind` constants to remove the string↔const seam the kind-identity model exists to close? (Likely sweep-safe; recorded here because it pairs with question 1.)
4. **Ordered filter-list dispatch — ownership and bounds composition.** `applyFilterListToSurface` is two-copy and fixed-size: it assumes every filter outputs at source dimensions, so bounds-expanding filters (blur/shadow/glow) are clipped to the source region inside a list even though `getFilterSurfaceBounds` exists to size them. Should the list path be wired to the bounds path (an `applyExpandingFilterListToSurface` allocating an expanding destination), and a displacement-map-aware variant added? And does the coordinating dispatcher belong here or in a render/coordination package? (The `scratch` parameter's documented size contract is now stale — it is used only as a blur buffer.)
5. **Scratch-pool lifecycle.** `_pool` only grows — no cap, trim, or eviction — so a burst of large acquisitions permanently pins memory, and `release` silently no-ops a foreign/double-released buffer. Should the pool have a cap/trim/eviction policy, and should `release` of a foreign buffer be a hard programmer-error throw rather than a silent no-op?
6. **`knockout` on inner filters.** `compositeFilterResultToSurface` already implements the inner-role knockout branch, but `InnerShadowFilter`/`InnerGlowFilter` carry no `knockout` field in `@flighthq/types`, so the branch is unreachable. Adding it is a cross-package types decision.
7. **Rust conformance drift (fork D — runtime backend seam, and the Wasm-mixable-leaf question).** This session added ~9 new exports (the composite quartet, `getFilterSurfaceBounds`, `applyFilterListToSurface`, the scratch trio) with no Rust mirror; the alignment doc still reads "fully aligned." Whether the list/scratch/composite tier ports as-is or is reshaped for the arena/`&mut [u8]` Rust idiom is a port-side decision to settle, not assume.
8. **Package Map omission (admin-doc fix).** The codebase map's Package Map lists `@flighthq/filters` and `@flighthq/filters-gl` but has no `@flighthq/filters-surface` line. The map should gain an entry describing the CPU/surface backend and its new compositing/bounds/list/scratch tier.
