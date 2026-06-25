---
package: '@flighthq/render'
updated: 2026-06-25
basedOn: ./review.md
---

# render — Assessment

> Recommendation layer over [review.md](./review.md). Scoped to the **integration-b2824e3d8 delta** judged against the approved baseline `origin/main` (`eb73c3d74`). Sorts the review's findings into within-package sweep-safe fixes, parked work, and the user's approval gate. Design forks and cross-package items route to the charter's Open directions, not into Recommended.

## Recommended (sweep-safe, within-package)

These are mechanical, contained to `packages/render/src/renderViewport.ts(.test)`, and do not require a design decision:

1. **Replace the bare `Rectangle` literal cast with `createRectangle()`.** `b2824e3d8:packages/render/src/renderViewport.ts:57` — `{ x: 0, y: 0, width: 0, height: 0 } as Rectangle` violates the entity-construction rule (`Rectangle extends Entity`). Swap to `createRectangle()`. Trivial, no behavior change.

2. **Reconcile the edge-inclusivity comment with the code.** The header comment (`:30-33`) says "exclusive-right/bottom," but `:47` is inclusive on all four edges. Either fix the comment to "inclusive on all edges" (matches the code and the status.md design note) or change the overlap test to match the comment. Pick one; do not ship the contradiction.

3. **Add tests that distinguish position from world-bounds.** Current tests (`renderViewport.test.ts`) only use origin/zero-size objects, so they cannot fail if the bounds are wrong. Add at least one case with a moved + scaled (and ideally nested/parented) object whose true world AABB differs from its local `x/y`, asserting the cull decision against the _real_ bounds. This test is what turns finding #1 below from invisible into caught.

## Backlog (parked — each with why)

1. **Fix `computeRenderProxyWorldBounds` to compute real world bounds.** It writes local `x/y` with zero size instead of reading `getNodeWorldBoundsRectangle` (`@flighthq/node`). _Parked from Recommended_ because the correct fix touches the trait-resolution model (does the function take a `Spatial2DNode` and read the runtime world-bounds rectangle, or keep the `unknown` + duck-type seam?) and intersects charter Open direction #8 (the conservative-cull-via-sentinel-vs-throw question). It is a correctness fix, not a sweep — it needs the bounds-resolution boundary ruled first. This is the gating defect for merge; see the dispatch brief.

2. **Replace the `'pivotX' in source` duck-type trait sniff.** `:6-8` keys spatial-ness off one field name. _Parked_ because the right replacement depends on #1's resolution: if the function reads bounds through a `Spatial2DNode` runtime accessor, the predicate problem evaporates; solving it in isolation would be throwaway work.

3. **Re-baseline the package's `review.md`/`status.md` to the merged artifact.** The bundle's `status.md` and the prior `review.md` (86/100, `solid`) credit a driver/queue/blend-stack/parity-suite that are not in `base` or `head`. _Parked_ as a docs-hygiene task for the ingest pass that lands the real driver work, not for this delta's worker — but the integration owner should know the continuity log overstates what merged.

## Approved

_None. Approval is the user's verbal gate; this layer only proposes. Nothing here is blessed until the user says so in a direction session._

## Notes for the charter's Open directions

- **Open direction #8 (the user's contract-fit gate) now has a concrete instance to rule.** The delta's `computeRenderProxyWorldBounds` chose to _fabricate_ zero-size bounds rather than read `getNodeWorldBoundsRectangle` or probe it via a sentinel. The charter should decide: (a) does 2D viewport-cull bounds resolution live in `render` reading the `node` world-bounds runtime, and (b) is the conservative-keep path a sentinel-returning probe or a fabricated default? Until ruled, this primitive cannot be honestly named.
- **Charter/status scope drift.** The draft charter (lines 19, 30–31, 62, 74) describes `drawRenderProxy`, `RenderQueue`, the blend stack, and `flushRenderBatch` as resident; this integration head carries none of them. When the direction session runs, confirm whether those landed on a different branch or are still as-claimed, so the charter's "What it is" matches a real artifact.
