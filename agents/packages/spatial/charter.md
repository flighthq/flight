---
package: '@flighthq/spatial'
crate: flighthq-spatial
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# spatial — Charter

## What it is

`@flighthq/spatial` is the **2D broadphase cell** — a spatial index over many objects' bounding boxes that answers "which pairs are close enough to be worth a narrow-phase test?" and "which objects overlap this region/point/ray?" without testing every object against every other. It is the O(n) filter in front of `@flighthq/collision`'s O(pair) narrow-phase, and the culling structure a `camera2d` or renderer uses to skip off-screen objects.

## North star

The complete 2D broadphase toolkit behind a **swappable index seam**: insert/update/remove objects by id + AABB, enumerate candidate overlapping pairs, and query by region / point / ray — with a uniform grid as the default index and quadtree / sort-and-sweep as drop-in alternates a caller selects by workload. Insert-update-query is allocation-frugal and the pair enumeration never returns a pair twice.

## Boundaries

- **Depends on `@flighthq/geometry` (2D AABB/Rectangle math) + `@flighthq/types`.** No narrow-phase shape tests (that is `@flighthq/collision`), no scene graph, no renderer.
- **Bounds only.** The index works on each object's axis-aligned bounds + an opaque id/handle; it knows nothing about the object's concrete shape, velocity, or display node. A candidate pair from the broadphase is *confirmed* by `collision` (or by the caller).
- **Index, not world.** It holds no simulation state, steps nothing, and resolves nothing — it is a queryable acceleration structure the caller drives (insert on spawn, update on move, query per frame).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Swappable index seam, uniform-grid default (phase 1).** A `SpatialIndex` created via `createSpatialIndex(backend?)` with the common operations (`insertSpatialObject`/`updateSpatialObject`/`removeSpatialObject`, `querySpatialPairs`, `querySpatialRegion`/`Point`/`Ray`) dispatching through a `SpatialIndexBackend`. P1 ships `createUniformGridSpatialBackend(cellSize)` as the default. P2/P3: `createQuadtreeSpatialBackend` and `createSweepAndPruneSpatialBackend` as alternates selected by workload — the operation vocabulary is stable, the structure underneath swaps. User-directed 2026-07-10.
  **Why:** 2D broadphase genuinely has multiple valid structures at different object-count/movement profiles — the exact condition that earns a seam over a hard-wired choice; a uniform grid is the robust, simple default.
- **[2026-07-10] Pair enumeration is dedup'd and self-excluding.** `querySpatialPairs` yields each candidate unordered pair at most once and never pairs an object with itself; the caller confirms with narrow-phase. Query results are ids/handles, not object references (the caller owns its objects).
- **[2026-07-10] `SpatialIndex`/`SpatialIndexBackend` + query result shapes in `@flighthq/types`.** Header layer owns the seam and result types so `collision`/`camera2d`/renderer consumers reference them without importing an index implementation.

## Open directions

1. **Quadtree backend (phase 2).** Recursive quadrant subdivision for clustered/variably-sized objects.
2. **Sort-and-sweep backend (phase 3).** Sweep-and-prune along dominant axes for many similarly-sized movers.
3. **Persistent-pair tracking.** Enter/stay/exit pair events across frames (for trigger volumes), emitted through signals — a composing layer over the raw pair query.
