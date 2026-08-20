---
package: '@flighthq/spatial'
role: package
crate: flighthq-spatial
draft: false
lastDirection: 2026-07-30
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

- **[2026-07-30] Insert cost is bounded by object count, never by object size.** The uniform grid indexed by walking every cell from min to max, so its work was proportional to (extent ÷ cellSize)² — measured at ~1 µs per cell, a 200-unit box at one cell per unit cost 28 ms, a 2000-unit box 4.7 s, and an AABB a trillion units wide (what a diverging rigid-body simulation actually produces) never returned. A hang is worse than a throw: it is uncatchable and takes the caller with it. Two bounds close it, both decided *before* any cell is touched, since deciding afterwards would mean walking the cells to learn there were too many:
  - **Oversized extents go to a flat overflow list.** An AABB spanning more than `MAX_INDEXED_CELLS_PER_OBJECT` (1024, a 32×32 block) is held outside the cell map and scanned by every query. This is a cost decision, not a degraded result — an object that spans a thousand cells is a co-occupant of nearly everything, so the cell index tells the queries almost nothing that a linear scan does not. Keeping such objects out of the occupied cell range matters twice: one oversized AABB would otherwise stretch the range every ray traversal walks.
  - **Non-finite bounds are declined.** `insertSpatialObject`/`updateSpatialObject` return `boolean`; `false` means the object is not held at all, so no query returns it. A declined *update* removes the object rather than stranding it at its previous bounds, so a caller ignoring the sentinel can never read a stale position as a current one.
  The same hazard from the caller's side — a query region wider than the world — is closed the same way: `querySpatialRegion` flips to scanning objects when the region spans more cells than the grid has occupied, so a region query is never more expensive than a full scan. User-directed (chief-authorized).
- **[2026-07-30] Core-layer diagnostics carry records and formatters, never a logger.** The natural shape for the above would be an `enableSpatialGuards` that warns through `@flighthq/log`, and the assessment recommended exactly that. It cannot live here: `@flighthq/spatial` is a **core**-layer package and `scripts/package-layers.ts` allows core to depend only on core, deliberately as central policy a package may not weaken about itself. So this package ships the two halves core *may* own — `setSpatialIndexingGuard` (a null-by-default seam, zero dependencies) and `formatSpatialIndexingNotice` (the text, separately importable so it sheds) — following `@flighthq/importdiagnostics`, which is core and does the same. Wiring them to a logger is three lines at a layer that can reach both. **Open:** whether a blessed `enableSpatialGuards` should exist at all, and if so where. See Open directions 5.
- **[2026-07-30] `explainSpatialIndexing` is the measurement seam, not only a debugging aid.** It reports `absent` / `cells` / `overflow` / `declined` plus a `bucketCount`, and `bucketCount` is precisely the quantity that goes unbounded when the cost bound is removed. That makes the bound assertable without timing anything — which is what let its regression test be written as a bounded assertion that *fails* against unbounded code in 40 ms rather than hanging on it. A probe that can hang is not a usable regression test.

- **[2026-07-15] Unified 2D+3D package.** When 3D broadphase arrives (BVH, octree, 3D sweep-and-prune), it joins this package behind the same `SpatialIndexBackend` seam. The concept is the same (spatial index for candidate-pair queries); the dimension changes the data structure, not the domain. 3D backends slot into the existing swappable-backend architecture: `createBvhSpatialBackend`, `createOctreeSpatialBackend`. User-directed.

- **[2026-08-20] Two dimension-native seams in one package, over a shared policy layer.** The 2026-07-15 unification holds — `spatial` stays one package — but 3D does **not** arrive behind the existing `SpatialIndexBackend`, and to that extent this supersedes the "same seam" clause above. That seam is 2D in its types (`SpatialAabb` has no z; the point and ray queries take no third axis) and was never dimension-generic. The seam is suffixed (`SpatialIndexBackend2D` / `SpatialIndexBackend3D`, `SpatialAabb2D` / `SpatialAabb3D`, `createSpatialIndex2D` / `createSpatialIndex3D`) while the policy vocabulary that is genuinely dimension-free — object identity, indexing mode, decline reasons, `bucketCount`, the `explainSpatialIndexing` seam, and the 2026-07-30 cost bounds — stays unsuffixed and shared. Widening one seam to three dimensions was rejected: every current consumer (`camera`, `interaction`, `physics2d`) is 2D and would pay for an axis it does not use, which is the bundle invariant. Backend factories suffix only where the structure's name is dimension-ambiguous, so `createQuadtreeSpatialBackend` and `createOctreeSpatialBackend` need none while `createUniformGridSpatialBackend` does. The suffix follows the SDK's spatial-dimension convention (`Camera2D`/`Camera3D`, `Ray3D`), not the linear-algebra rank convention (`Matrix3`, `Vector4`). User-directed. See [spatial dimension seams](../../spatial-dimension-seams.md).

## Open directions

1. **Quadtree backend (phase 2).** Recursive quadrant subdivision for clustered/variably-sized objects.
2. **Sort-and-sweep backend (phase 3).** Sweep-and-prune along dominant axes for many similarly-sized movers.
3. **Persistent-pair tracking.** Enter/stay/exit pair events across frames (for trigger volumes), emitted through signals — a composing layer over the raw pair query.
4. **3D backends.** BVH and octree for 3D broadphase, behind the **3D** seam (`SpatialIndexBackend3D`), not the 2D one. These serve `@flighthq/physics3d` and 3D scene culling. The seam suffixing that had to land first is done — the types, the constructors, and the free operations all carry the dimension, while the backend's own method names and the policy vocabulary stay unsuffixed — so nothing now blocks the first 3D backend.
5. **Where a log-backed `enableSpatialGuards` lives, if anywhere.** The core-layer rule keeps `@flighthq/log` out of this package, so the guard seam and the formatter ship here and the logger wiring does not. The options are to leave it to callers (current state), reclassify one of the two packages, or put a thin `spatial-guards` neighbor at the feature layer. This is an architecture call about the layer policy, not a spatial API call.
6. **Whether `MAX_INDEXED_CELLS_PER_OBJECT` should be per-grid rather than global.** It is an exported constant today, readable but not settable. A world whose objects are genuinely varied in size might want to tune it per index; nothing needs it yet, and a `createUniformGridSpatialBackend(cellSize, maxCellsPerObject?)` overload is purely additive when something does.
