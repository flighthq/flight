---
package: '@flighthq/interaction'
updated: 2026-07-02
basedOn: ./review.md
---

# interaction — Assessment

Sorted from the depth review (solid, 68/100), the builder's as-claimed Gold expansion (lost — not present in this tree), and the direction session (2026-07-02). Six decisions blessed. The dispatch layer is deep and well-shaped; the hit-testing layer is shallow (bounds-only, `shapeFlag` dead wiring, tilemap/quad-batch TODO stubs). The builder's prior work (cursor, gating, hitArea, overlap, spatial queries, sub-index picking, shape-accurate picking) was lost and needs re-implementation. Tiers 1–3 approved for builder integration.

## Recommended

All three tiers below are approved for builder integration as a single parcel. Tier 1 is within-package; Tiers 2–3 require `@flighthq/types` additions and cross-package implementation.

### Tier 1 — Within-package, no types changes

- **`registerDefaultHitTestPoints()`.** One-call registrar that wires the full built-in bank of default hit-test handlers. Side-effect-free, tree-shaken when unused. New file `registerDefaultHitTestPoints.ts`.
- **Document traversal-order difference.** `findGraphHitTarget` traverses reverse child order (front-to-back); `hitTestGraphPoint` traverses natural order. Add a comment on `hitTestGraphPoint` explaining why they differ to prevent future "fixes."
- **Spatial area queries.** `hitTestAreaQuery(root, rect, out?)` and `hitTestAreaQueryCircle(root, cx, cy, radius, out?)` — linear O(n) DFS collecting nodes whose world bounds intersect the region. New file `spatialQuery.ts`. Typed on `DisplayObject`.
- **Overlap family.** `containsDisplayObject(outer, inner)`, `getDisplayObjectOverlapRectangle(source, other, out)`, `hitTestDisplayObjectsShape(source, other)` — all typed on `DisplayObject` (Decision #2). New file `displayObjectOverlap.ts`. `hitTestDisplayObjectsShape` uses cross-center + AABB approximation (documented; precision ceiling is Open direction #3).

### Tier 2 — Needs `@flighthq/types` additions

- **`HitTestResult` type** in `@flighthq/types`: `{ node: NodeAny; subIndex: number; localX: number; localY: number }`. `subIndex = -1` sentinel when the kind has no sub-index concept.
- **`findGraphHitTargetDetailed(source, x, y, out, shapeFlag?)`** — fills `out.node`, `out.localX`, `out.localY`, `out.subIndex` via registered detailed resolver.
- **`registerHitTestDetailed(kind, fn)`** — registers sub-index resolver.
- **Per-node interaction gating.** Types: `NodeInteraction` or similar in `@flighthq/types`. Functions: `setNodeInteractive(node, enabled)` / `isNodeInteractive(node)` (self-hit opt-out), `setNodeChildrenInteractive(node, enabled)` / `areNodeChildrenInteractive(node)` (subtree opt-out). `findGraphHitTarget`/`hitTestGraphPoint` consult both. Distinct from existing `enabled` flag.
- **`hitArea` proxy.** Type: `HitArea = Readonly<Rectangle> | Readonly<NodeAny>` in `@flighthq/types`. Functions: `setNodeHitArea(node, area | null)` / `getNodeHitArea(node)`. `findGraphHitTarget` delegates to the proxy.
- **`suppressTouchHover`** on `InteractionManagerOptions` (default `true`): touch pointer moves do not synthesize rollover/over/out chains.

### Tier 3 — Cross-package implementation

- **Shape-accurate picking.** `defaultShapeHitTestPointHandler` honors `shapeFlag=true` using `containsPathPoint` from `@flighthq/path` (already exists). Falls back to bounds for gradient/bitmap fills.
- **Tilemap/QuadBatch real sub-index picking.** Replace `// TODO` stubs with: `defaultTilemapHitTestPointHandler` — local point → tile cell, hit only on populated tiles. `defaultQuadBatchHitTestPointHandler` — per-quad AABB test. Register sub-index resolvers (`resolveTilemapHitSubIndex`, `resolveQuadBatchHitSubIndex`).
- **Clip-aware picking** (Decision #4). `findGraphHitTarget` checks `clipRegionContainsPoint` from `@flighthq/clip` when a node has a clip region. Add `@flighthq/clip` as a dependency.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Cursor management.** _Parked — design unsettled._ Multi-canvas architecture and whether `*Backend` pattern is right are Open direction #1. Do not implement the singleton version.
- **Bitmap alpha-threshold picking.** _Parked — gated on `@flighthq/surface`._ Needs a pixel-alpha accessor. Cross-package.
- **Glyph-box text picking + `getTextHitCaretIndex`.** _Parked — gated on `@flighthq/textlayout`._ Needs per-glyph rects.
- **True SAT overlap for `hitTestDisplayObjectsShape`.** _Parked — precision ceiling unsettled._ Open direction #3.
- **Spatial broadphase (`SpatialIndex`).** _Parked — profiling-gated._ Blessed as interaction's opt-in (Decision #6), but the type contract and implementation are future work.
- **`@flighthq/gestures` neighbor package.** _Parked — new package._ Blessed as separate (Decision #1). Drag, pan, pinch, swipe, tap, long-press.
- **`hitArea` proxy coordinate semantics.** _Parked — unspecified._ Open direction #2.
- **Rust `flighthq-interaction` crate.** _Parked — cross-worktree._ Open direction #4.

## Approved

- [2026-07-02 · picked] Tiers 1–3 integration: registerDefaultHitTestPoints, traversal-order doc, spatial queries, overlap family, HitTestResult + detailed hit, gating, hitArea, suppressTouchHover, shape-accurate picking, tilemap/quad-batch sub-index, clip-aware picking
