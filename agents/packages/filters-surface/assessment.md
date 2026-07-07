---
package: '@flighthq/filters-surface'
updated: 2026-06-24
basedOn: ./review.md
---

# filters-surface — Assessment

The review verdict is `solid` (88/100): both concrete gaps the 78/100 depth roadmap named (inner-shadow offset fidelity, the compositing tier) are closed, and the Bronze/Silver roadmap is largely landed (composite quartet, `getFilterSurfaceBounds`, scratch pool, ordered list dispatch, `getShadowFilterOffset` relocated into `@flighthq/filters`). What remains is mostly _structural_ — closed-switch-vs-registry, list/bounds wiring, conformance drift — which the review correctly surfaced as Open directions. Only one finding is strictly within-package, non-design, and non-breaking, so `Recommended` is deliberately short.

## Recommended

Strictly sweep-safe: within `@flighthq/filters-surface`, no cross-package coupling, no breaking change, no open design decision.

- **Replace raw kind-string literals with the imported `*Kind` constants in `surfaceFilterComposite.ts` and `surfaceFilterBounds.ts`.** Both switch on hand-written literals (`case 'DropShadowFilter'`) while `surfaceFilterList.ts` already switches on the imported `*Kind` constants (`case DropShadowFilterKind`). The codebase kind-identity model makes the `*Kind` constant the single canonical identity; the literal re-introduces the string↔const seam the model exists to remove. This is a like-for-like substitution against constants those files already have access to — it does not decide closed-switch-vs-registry (that stays an Open direction), it only makes the three switches agree on identity within the package. — review.md#gaps (kind-literal duplication)

## Backlog

Parked: each waits on a design decision, crosses a package boundary, or is larger than a sweep.

- **Closed `switch(kind)` → registry for `getFilterCompositeRole` and `getFilterSurfaceBounds` (fork B).** Both switch once-per-filter (not per-pixel), so the hot-loop exception that would justify a closed union is weak, and an unregistered kind falls into `default` as a _quiet wrong answer_ (`'outer'` / unexpanded source bounds) rather than a sentinel. Whether `filters-surface` is a fixed built-in set or an extensible registry is a **Boundary decision** for the charter, not a sweep — routed to Open directions. — review.md#candidate-open-directions (1)
- **Where the composite-role / bounds metadata lives (descriptor vs. per-backend).** `getFilterCompositeRole` and the bounds-expansion reach are backend-agnostic facts about a filter; `filters-gl`/`filters-canvas` will want the same answers. Lifting them onto the descriptor in `@flighthq/filters` / `@flighthq/types` is a **cross-package home question** — parked. — review.md#candidate-open-directions (2)
- **Wire `applyFilterListToSurface` to `getFilterSurfaceBounds` (and a displacement-aware variant).** The list path is two-copy and fixed-size: it assumes every filter outputs at source dimensions, so bounds-expanding filters (blur/shadow/glow) are clipped inside a list even though `getFilterSurfaceBounds` exists to size them. An `applyExpandingFilterListToSurface` allocating an expanded destination, and whether the coordinating dispatcher is owned here or in a render/coordination package, is the **cross-package boundary call** the depth review already flagged — parked. The stale `scratch` size contract on `applyFilterListToSurface` is part of this rework. — review.md#gaps (list dispatcher), #candidate-open-directions (3)
- **Scratch-pool lifecycle policy.** `_pool` only grows (no cap/trim/eviction), so a burst of large acquisitions permanently pins memory, and `release` silently no-ops a foreign/double-released buffer, making a missed-`release` leak invisible. Whether to add a cap/trim and whether a foreign `release` should hard-throw is an **open policy decision** (review Open direction 4), not a sweep — parked until the policy is set. — review.md#gaps (unbounded scratch pool), #candidate-open-directions (4)
- **`knockout` on inner filters.** `compositeFilterResultToSurface` already handles the `'inner'` role's knockout via `'knockout' in filter`, but neither `InnerShadowFilter` nor `InnerGlowFilter` carries a `knockout` field in `@flighthq/types`, so the branch is unreachable. Adding the field is a **cross-package types decision** — parked. — review.md#gaps (inner filters cannot express knockout), #candidate-open-directions (5)
- **Rust-port conformance drift.** This session added 9 new TS exports (the composite quartet, `getFilterSurfaceBounds`, `applyFilterListToSurface`, the scratch trio) with no mirror in `flighthq-filters-surface` (still `apply.rs`+`lib.rs`), and the `reviews/alignment/ts-rust/filters-surface.md` doc still certifies "fully aligned." Per the rust-port 1:1 intent the crate now lags upstream; whether the list/scratch/composite tier ports as-is or is reshaped for the arena/`&mut [u8]` Rust idiom is a **port-side decision**. Cross-tree (the `crates/` worktree), so parked. — review.md#gaps (Rust conformance drift), #contract-docs-fit
- **Admin-doc fixes (cross-doc, not within the package source).** The codebase-map Package Map has no `@flighthq/filters-surface` line despite listing `filters`/`filters-gl`; it should gain one describing the CPU/surface backend and the new compositing/bounds/list/scratch tier. Separately, the stale `reviews/alignment/ts-rust/filters-surface.md` needs a "pending port" entry. Both edit shared docs outside `packages/filters-surface/`, so they are coordination items, not a within-package sweep. — review.md#contract-docs-fit

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

## Notes for the charter (Open directions — do not edit the charter here)

The charter's North star / Boundaries / Decisions are all still `TODO`. The following questions surfaced by the review want a direction decision and should land in `charter.md › Open directions`:

1. **Is `filters-surface` a fixed built-in set or an extensible registry?** (fork B) — settles whether the once-per-filter `getFilterCompositeRole` / `getFilterSurfaceBounds` / `applyOneFilter` switches become a per-kind registry that a vendor filter can register into.
2. **Does composite-role / bounds metadata belong on the descriptor** (in `@flighthq/filters` / `@flighthq/types`) rather than re-derived per backend, shared with `filters-gl`/`filters-canvas`?
3. **Where does ordered filter-list dispatch live, and how does it compose with bounds?** — owned here or in a render/coordination package; how `applyFilterListToSurface` and the expanding/ displacement variants size their destinations.
4. **Scratch-pool lifecycle** — cap/trim/eviction policy, and whether a foreign `release` is a hard error.
5. **`knockout` on `InnerShadowFilter`/`InnerGlowFilter`** — a `@flighthq/types` field addition that would make the already-implemented inner-knockout branch reachable.
6. **Backend-consistency contract** (from the depth roadmap) — should all raster backends return composited results (GL-style) or masks (current surface-style)? This decides whether `compositeFilterResultToSurface` is the public contract or an internal helper, and is an SDK-wide filter-backend call.

_Source roadmap absorbed: `reviews/maturation/depth/filters-surface.md` (one-time seed; flagged for removal now that its Bronze/Silver items are reflected in this review/assessment)._
