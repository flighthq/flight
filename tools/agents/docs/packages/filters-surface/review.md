---
package: '@flighthq/filters-surface'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/filters-surface.md
  - reviews/alignment/ts-rust/filters-surface.md
  - source
---

# filters-surface — Review

## Verdict

`solid` — 88/100. The CPU pixel backend now has a 1:1 adapter for every `@flighthq/filters` descriptor **plus** the missing tier the prior depth review flagged: inner-shadow offset fidelity, a `knockout`/`hideObject`-aware compositing layer, per-kind bounds expansion, an ordered filter-list dispatcher, and a scratch-buffer pool. Both concrete gaps the 78/100 depth review named are closed. What holds it short of authoritative is structural, not coverage: three closed `switch(kind)` dispatchers (one of them duplicating raw kind-string literals instead of the `*Kind` constants), an unbounded scratch pool, a two-copy list path, and a Rust crate that has not followed the new tier.

## Present capabilities

**Per-descriptor adapters (14, unchanged shape).** Every `@flighthq/filters` descriptor has a colocated `apply<Filter>ToSurface(out, [blurBuffer], source, filter)` adapter exported from the root barrel: blur, color-matrix, convolution, displacement-map, drop/inner shadow, outer/inner/gradient glow, bevel/gradient-bevel, median, sharpen, pixelate. The binding hygiene the depth review praised holds — `quality`→passes via `computeBoxBlurRadius`, `color+alpha` packed into `0xRRGGBBAA` at the seam, documented aliasing contracts per function, `Readonly<SurfaceRegion>` inputs, `out`-first argument order.

**Inner-shadow offset fidelity (Bronze, the depth review's one concrete defect — now fixed).** `applyInnerShadowFilterToSurface` (`surfaceInnerShadowFilter.ts`) now honors `angle`/`distance` via `getShadowFilterOffset`. The zero-offset path still calls the `innerShadowSurface` kernel; the non-zero path (`applyOffsetInnerShadow`) shifts the inverted-alpha field by `(dx, dy)`, blurs it ping-ponging through the scratch buffer, then tints and clips by the **original** (unshifted) source alpha so the effect stays inside the shape boundary. Out-of-bounds reads return exterior alpha, matching the kernel. This mirrors the bevel approach and is well-commented on coordinate-space and clipping.

**Compositing tier (Silver — the depth review's second gap).** `surfaceFilterComposite.ts` resolves the "composite mask then source, omit on knockout/hideObject" prose that was repeated across ~7 doc comments into one authoritative layer: `FilterCompositeRole` (`'inner' | 'outer' | 'outer-offset'`), `getFilterCompositeRole`, `compositeFilterResultToSurface` (role-aware layer ordering with `knockout`/`hideObject` via `in`-guarded field access), `compositeDropShadowFilterResultToSurface` (offset-aware variant that places the mask at `(dx,dy)` then the source on top), and `computeFilterSurfaceOffset` (allocating convenience wrapper over `getShadowFilterOffset`). Tested across non-knockout / knockout / hideObject / inner-vs-outer ordering.

**Shared offset math relocated.** `getShadowFilterOffset` moved out of `filters-css` into `@flighthq/filters` (`shadowFilterOffset.ts`, exported from its barrel) with the standard `getShadowFilterOffset(filter, out)` out-param shape; `filters-surface`, `filters-css` (bevel, inner shadow, drop shadow) all consume it. This kills a cross-package duplication and is the correct home (the filter descriptor's angle/distance→offset is descriptor math, not backend math).

**Bounds expansion (Silver).** `getFilterSurfaceBounds(filter, sourceBounds, out)` (`surfaceFilterBounds.ts`) dispatches all 13 non-displacement kinds (plus displacement) and writes the expanded output region: blur/glow expand by `ceil(blur)*3`, drop-shadow by blur-pad ∪ offset, bevel/gradient-bevel by blur-pad, median by radius, convolution by kernel half-size, displacement by `|scale|/2`; inner/color/pixelate preserve source bounds. Alias-safe (all inputs read into locals before `out` is written) and tested for it.

**Scratch pool + list dispatch (Silver/Gold).** `surfaceFilterScratch.ts` provides the `acquireFilterSurfaceScratch`/`releaseFilterSurfaceScratch` pool bracket, an always-allocating `createFilterSurfaceScratch`, and `getFilterSurfaceScratchByteLength`. `surfaceFilterList.ts` provides `applyFilterListToSurface(out, scratch, source, filters)` — an ordered dispatch that ping-pongs between two `createSurface` buffers, copying source in and result out. DisplacementMap is documented-and-skipped (it needs a `map` surface the descriptor cannot carry); unknown kinds copy through. Empty list copies source unchanged. All branches tested.

**Hygiene.** `sideEffects: false`, single `.` export, deps limited to `filters`/`surface`/`types`, one colocated `*.test.ts` per source file (23 source modules, 23 test files), barrel alphabetized.

## Gaps

- **Two closed `switch(kind)` dispatchers that are not hot loops.** `getFilterCompositeRole` and `getFilterSurfaceBounds` each switch over filter kind once per filter (not per pixel), yet are hard-coded closed unions. Per structural fork B the default is a registry; the hot-loop exception that would justify a closed union does not apply to a once-per-filter role/bounds lookup. A new filter kind silently falls into the `default` branch — `getFilterCompositeRole` returns `'outer'` and `getFilterSurfaceBounds` returns unexpanded source bounds — which is a quiet wrong answer, not a sentinel. (`applyOneFilter` in the list dispatcher is the one switch with a defensible hot-ish per-filter cost, and even it copies-through on unknown kinds.)
- **Kind-literal duplication.** `surfaceFilterComposite.ts` and `surfaceFilterBounds.ts` switch on raw string literals (`case 'DropShadowFilter'`), while `surfaceFilterList.ts` switches on the imported `*Kind` constants (`case DropShadowFilterKind`). The codebase kind-identity model makes the `*Kind` constant the single canonical identity; hand-writing the literal value re-introduces the string↔const seam the model exists to remove. Two files disagree with the third in the same package.
- **Unbounded scratch pool.** `_pool` in `surfaceFilterScratch.ts` only ever grows — there is no eviction, max-size, or trim. A burst of large acquisitions permanently pins that memory. `release` also silently no-ops a foreign/double-released buffer (documented as "programmer error" but not signalled), so a leak from a missed `release` is invisible.
- **List dispatcher is two-copy and fixed-size (acknowledged in status).** `applyFilterListToSurface` copies the source into `surfA` and the final surface into `out`, and assumes every filter outputs at source dimensions — so bounds-expanding filters (blur/shadow/glow) are clipped to the source region inside a list, even though `getFilterSurfaceBounds` exists to size them. The list path and the bounds path are not yet wired together. The `scratch` parameter is now only used as a blur buffer, not as a ping-pong surface; its documented size contract is stale.
- **Inner filters cannot express `knockout`.** `compositeFilterResultToSurface` handles the `'inner'` role's knockout via `'knockout' in filter`, but neither `InnerShadowFilter` nor `InnerGlowFilter` carries a `knockout` field in `@flighthq/types`, so the branch is unreachable for them. This is a cross-package types decision (status flags it as deferred).
- **Rust crate has not followed the new tier (conformance drift — see Contract & docs fit).**

## Charter contradictions

None. The charter's "What it is" (CPU pixel backend mapping `@flighthq/filters` descriptors to `@flighthq/surface` kernels) is exactly what the package does, and its North star / Boundaries / Decisions are all `TODO`, so there is no stated principle to contradict. The thin-binding identity is respected: the new compositing/bounds/list/scratch tier is orchestration over kernels, not re-implemented image processing — the heavy lifting still lives in `@flighthq/surface`. The closed- switch and kind-literal findings above are measured against the SDK-wide structural forks and the codebase map, not against this (silent) charter — they are candidate Open directions, recorded below.

## Contract & docs fit

**Lives up to the contract:**

- Full unabbreviated type words in every export (`compositeDropShadowFilterResultToSurface`, `getFilterSurfaceScratchByteLength`); `get*` for accessors, `acquire*`/`release*` for the pool bracket, `create*` for the allocating variant — all the correct verbs.
- `out`-param discipline and alias safety: `getFilterSurfaceBounds` documents and tests the same-object case; the inner-shadow and list paths read inputs before writing.
- Sentinels-not-throws: unknown kinds copy through / return source bounds rather than throwing. (The flip side — a _quiet wrong answer_ on an unregistered kind — is the closed-switch gap above.)
- Single root export, `sideEffects: false`, dependency set minimal. Types are consumed from `@flighthq/types`; the one new local type (`FilterCompositeRole`) is a backend-internal compositing-role enum, not a cross-package contract, so keeping it local is defensible — though if `filters-gl`/`filters-canvas` grow the same role concept it should migrate to `@flighthq/types`.

**Candidate contract / admin-doc revisions:**

- **Package Map omits this package.** The codebase map's Package Map lists `@flighthq/filters`, `@flighthq/filters-gl`, etc., but has **no `@flighthq/filters-surface` line** — the very package under review. The map should gain a `filters-surface` entry describing the CPU/surface backend (and note the new compositing/bounds/list/scratch tier), mirroring the `filters-gl` line.
- **Rust conformance drift — the alignment doc is now stale.** `reviews/alignment/ts-rust/filters-surface.md` certifies "all 14 TS exports map 1:1" and the Rust crate is `apply.rs`+`lib.rs` only. This session added **9 new exports** (the composite quartet, `getFilterSurfaceBounds`, `applyFilterListToSurface`, the scratch trio) with **no Rust mirror**. Per the rust-port intent (1:1 conformance), `flighthq-filters-surface` now lags upstream; the divergence map / alignment doc needs a new "pending port" entry rather than its current "fully aligned." Whether the list/scratch/composite tier ports as-is or is reshaped for the arena/`&mut [u8]` Rust idiom is a port-side decision to surface, not assume.

## Candidate open directions

The charter is a stub (North star / Boundaries / Decisions all `TODO`); these are the questions a reviewer had to assume, surfaced for the user to settle:

1. **Closed switch vs. registry for filter-kind dispatch (fork B).** Should `getFilterCompositeRole`, `getFilterSurfaceBounds`, and `applyOneFilter` become a per-kind registry (so a custom/vendor filter kind can register its role, bounds, and adapter) or stay closed unions? These are once-per-filter, not per-pixel, so the hot-loop exception is weak. A Boundary decision: is `filters-surface` a fixed built-in set, or extensible?
2. **Should the compositing role / bounds metadata live on the descriptor (in `@flighthq/filters` / `@flighthq/types`) instead of being re-derived per backend?** `getFilterCompositeRole` and the bounds-expansion reach are backend-agnostic facts about a filter; `filters-gl`/`filters-canvas` will want the same answers. This may be a cross-package home question (descriptor metadata vs. per-backend switch).
3. **Where does ordered filter-list dispatch belong, and how does it compose with bounds?** Status flags that bounds-expanding filters are clipped inside a list and that an `applyExpandingFilterListToSurface` (allocating an expanding destination via `getFilterSurfaceBounds`) and a displacement-map-aware variant are deferred. Whether the coordinating dispatcher is owned here or in a render/coordination package is the cross-package call the depth review already flagged.
4. **Scratch-pool lifecycle.** Should the pool have a cap / trim / eviction policy, and should `release` of a foreign buffer be a hard error (programmer-error throw) rather than a silent no-op?
5. **`knockout` on inner filters.** Adding `knockout` to `InnerShadowFilter`/`InnerGlowFilter` in `@flighthq/types` would make the already-implemented inner-knockout branch reachable — a cross-package types decision.
