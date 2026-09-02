---
package: '@flighthq/spatial'
status: solid
score: 83
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - types (Spatial.ts, SpatialIndexing.ts)
---

# spatial — Review

## Verdict

solid -- 83/100. The package delivers a well-architected broadphase spatial index across two
dimensions behind twin swappable seams, with three working backends (2D uniform grid, 3D uniform grid,
3D BVH), a cost-bound system that makes insert time independent of object size, and a diagnostics
layer split cleanly between a null-by-default guard seam and a separately-importable formatter. The
dimension split is done right: every 2D operation has a 3D counterpart with signatures dimensionally
extended, while the policy vocabulary -- overflow, decline reasons, the guard, the notice formatter --
stays unsuffixed and shared. The BVH is tested differentially against the uniform grid, which is
stronger than self-consistent assertions. The test suite (143 cases across 9 files) is now substantial,
including seeded brute-force property tests that compare pairs, region, point, and ray results against
independent O(n^2) oracles.

The score reflects three structural gaps: 2D still has only one backend while 3D has two; the
chartered P2 (quadtree) and P3 (sort-and-sweep) backends are unbuilt; and the 2D pair path still
allocates a fresh `{ a, b }` per pair per query while the 3D grid reuses pair objects. Smaller
issues: `@flighthq/geometry` is a declared dependency that nothing in the package imports,
`createSpatialIndex2D`/`3D` return plain objects rather than Entity (while the backends are Entity),
and the `'cells'` mode vocabulary is acknowledged as a misnomer for the BVH.

## Present capabilities

**Type surface** (`@flighthq/types`): `SpatialObjectId` (number), `SpatialAabb2D`/`SpatialAabb3D`
(min/max corners, deliberately distinct from collision and geometry AABB types),
`SpatialPair` (unsuffixed, shared), `SpatialFrustum3D` (24-element corner list),
`SpatialIndexBackend2D`/`SpatialIndexBackend3D` (8 methods each, identical contract across
dimensions), `SpatialIndexRuntime2D`/`3D`, `SpatialIndex2D`/`3D` entity types, plus the full indexing
vocabulary: `SpatialIndexingExplanation`, `SpatialIndexingMode` (`absent`/`cells`/`declined`/`overflow`),
`SpatialDeclineReason`, `SpatialIndexingOperation`, `SpatialIndexingReason`, `SpatialIndexingNotice`,
`SpatialIndexingGuard`.

**2D facade** (`spatialIndex.ts`): `createSpatialIndex2D(backend?)` defaulting to a 128-unit uniform
grid, plus `insertSpatialObject2D`/`updateSpatialObject2D`/`removeSpatialObject2D`/`clearSpatialIndex2D`
and `querySpatialPairs2D`/`Region2D`/`Point2D`/`Ray2D`, each dispatching through `runtime.backend`.

**3D facade** (`spatialIndex3D.ts`): The same eight operations suffixed `3D`, plus two composite queries
not on the backend seam: `querySpatialSphere3D` (bounding-cube region query, candidate set) and
`querySpatialFrustum3D` (depth-sliced covering boxes, deduped across slices). Both are built on top of
`querySpatialRegion` so every current and future backend answers them for free.

**2D uniform grid** (`uniformGrid.ts`): Spatial hash keyed by `"cx,cy"` string. Per-object copied
bounds. Pair dedup by canonical top-left shared cell with ids ordered `a < b`. Region/point queries
confirm candidates against real bounds. Ray query uses Amanatides-Woo DDA bounded to the occupied
cell range, with entry clipping and per-id slab confirmation. Oversized objects (spanning more than
`MAX_INDEXED_CELLS_PER_OBJECT` = 1024 cells) go to a flat overflow list scanned by every query.
Non-finite and inverted bounds are declined with a `false` sentinel. Invalid cell size routes to
overflow with the guard notified. The `updateSpatialObject` fast path compares old and new cell ranges
and, when unchanged, overwrites only the stored bounds (four field writes instead of remove+reinsert).
Region queries flip to a full-scan path when the query region spans more cells than the grid occupies.
Cell-enumeration scratch array (`pairIds`) is reused per query.

**3D uniform grid** (`uniformGrid3D.ts`): Structural mirror of the 2D grid extended to three axes.
Cell key is `"cx,cy,cz"`. The same cost policy and overflow/decline rules apply, with the per-object
budget binding harder (a ~10-cell cube vs a 32-cell square). Pair objects are reused across queries
via `_writeGrid3DPair`, avoiding per-pair allocation (an improvement the 2D grid has not adopted).

**3D BVH** (`bvh3D.ts`): Dynamic bounding-volume hierarchy with FAT bounds (object box grown by a
configurable margin). Parallel arrays (struct-of-arrays) for cache friendliness and C-port readiness.
AVL-style balancing on insert prevents sorted-input degeneration. Surface-area heuristic descent for
leaf placement. Leaf queries test exact bounds, not fat bounds, matching the grid's results.
Small movements within the margin require no reinsertion -- only exact bounds are refreshed. Guard
behaviour matches the grid: reports only faults (decline, missing-id), never ordinary success.
Tested differentially against the uniform grid on region, point, ray queries AND notice output.

**Diagnostics**: `setSpatialIndexingGuard` (null-by-default module-scoped seam, shared across both
dimensions), `reportSpatialIndexing` (internal dispatch), `formatSpatialIndexingNotice` (separately
importable human text), `explainSpatialIndexing2D`/`3D` (pull query returning plain data). The guard
fires on declines (non-finite bounds, inverted bounds), overflow routing, invalid cell sizes, and
missing-id operations. It stays silent on ordinary success. Notice text is dimension-neutral, naming
the unsuffixed backend methods.

**Package shape**: 28 public exports. Two lanes (`.` and `./contract`). Dependencies: `entity` (for
`createEntity` in backends), `geometry` (declared but unused), `types`. `sideEffects: false`. No
import-time side effects confirmed by inspection.

## Gaps

- **2D has one backend; 3D has two.** The 2D side lacks a second backend. No quadtree (chartered P2),
  no sort-and-sweep (chartered P3). The seam exists to receive them.
- **2D pair query allocates per pair.** `_queryGridPairs` in the 2D grid pushes a fresh `{ a, b }`
  object per pair per query. The 3D grid's `_writeGrid3DPair` reuses pair objects from previous
  queries, avoiding this allocation. The assessment records the cell-scan de-allocation as landed, but
  the pair-object allocation remains on the 2D side.
- **`@flighthq/geometry` is a stale dependency.** Listed in `package.json` but imported nowhere in
  source. The earlier 2D implementation used geometry's `intersectsRectangle` and
  `containsRectanglePointXY`; the current code has its own `_isSpatialAabbOverlapping` and
  `_isSpatialAabbContainsPoint`. The dependency should be removed.
- **`createSpatialIndex2D`/`3D` do not return Entity.** They return a plain `{ runtime: { backend } }`
  object. The backends ARE Entity (via `createEntity`), but the index entity itself is not. The
  codebase rule says `create*` returns Entity; this is either a deliberate exception (the index is a
  thin runtime wrapper, not an SDK object with identity) or an unconsidered gap.
- **Ray results are unordered and carry no entry parameter.** Picking and line-of-sight callers
  must re-test and sort. Adding entry `t` changes the seam signature; the status parks this as a
  seam-signature decision.
- **No persistent pair events.** `querySpatialPairs` reports this frame's candidate set with no
  enter/stay/exit transitions. Charter Open direction 3.
- **The `'cells'` mode vocabulary is grid-shaped.** The BVH reports `'cells'` with `bucketCount: 0`
  because there is no member meaning "indexed normally in a tree." Renaming it would change a shared
  vocabulary. Acknowledged as an open naming question in status.
- **`MAX_INDEXED_CELLS_PER_OBJECT` is a global constant.** 1024 is reasonable for 2D (32x32) but tight
  for 3D (~10x10x10). Charter notes whether it should be per-grid as open.
- **No 2D circle query.** 3D has sphere and frustum queries; 2D has neither circle equivalent. Whether
  it wants one is noted as open in status.
- **3D brute-force property tests are absent.** The 2D grid has seeded churn tests comparing pairs,
  region, point, and ray against O(n^2) oracles. The 3D grid is tested thoroughly but does not have
  the same randomized oracle-comparison coverage. The BVH IS tested differentially against the 3D
  grid, which partially compensates.

## Charter contradictions

- **Boundaries section lists `geometry` + `types`; actual dependencies are `entity` + `types`.**
  `@flighthq/entity` is imported in all three backend files for `createEntity`, but the charter's
  Boundaries section omits it. `@flighthq/geometry` is named in the charter and package.json but
  imported nowhere. The charter boundary statement should read `entity` + `types`.
- **[2026-07-15] "same `SpatialIndexBackend` seam" partially superseded.** The 2026-08-20 decision
  explicitly supersedes the "same seam" clause, establishing twin seams
  (`SpatialIndexBackend2D`/`3D`). The charter records this correctly; no contradiction in the
  implementation.

No structural contradictions against the ratified decisions. The three 2026-07-10 decisions (swappable
seam with grid default, deduped self-excluding pairs as ids, types in the header layer) hold exactly.
The 2026-07-30 cost-bound decisions (overflow list, non-finite decline, region-query flip) are
implemented faithfully in both dimensions. The 2026-08-20 dimension split is clean.

## Contract & docs fit

- **Export lanes**: correct. `index.ts` re-exports a curated list from `contract.ts`; `contract.ts`
  barrel-exports every source module. Both lanes present.
- **Naming**: all exported functions carry the full `Spatial` type name and the dimension suffix where
  applicable. `querySpatialFrustum3D`, `querySpatialSphere3D` are globally unique and
  self-identifying. `MAX_INDEXED_CELLS_PER_OBJECT` is the lone exported constant.
- **`sideEffects: false`**: honored. No top-level registrations, no module-scoped mutation on import.
  The `_indexingGuard` variable is module-scoped mutable state but is set only by an explicit
  `setSpatialIndexingGuard` call, never on import -- consistent with the diagnostics convention for
  core-layer packages (charter decision 2026-07-30).
- **Out-array discipline**: all query functions clear then fill the caller-provided array. Verified
  in source and tested explicitly.
- **`Readonly<T>` usage**: bounds parameters are `Readonly<SpatialAabb2D>` / `Readonly<SpatialAabb3D>`
  throughout. Index parameters are `Readonly<SpatialIndex2D>` / `Readonly<SpatialIndex3D>`.
- **Module-private helpers**: `_`-prefixed throughout both grids and the BVH. Consistent with existing
  codebase precedent.
- **Scratch objects at file bottom**: `queryRegionScratch`, `frustumSeen`, `frustumSlice` in
  `spatialIndex3D.ts` and `DEFAULT_SPATIAL_CELL_SIZE` in `spatialIndex.ts` are at file bottom per
  Source Style.
- **Test alignment**: 9 test files, one per source file (minus `index.ts` and `contract.ts`).
  `describe` blocks mirror exported names. Tests use structural literals for AABB values (appropriate
  since `SpatialAabb2D`/`SpatialAabb3D` are `*Like` inputs without runtime identity).

## Candidate open directions

- **2D pair-object reuse.** The 3D grid's `_writeGrid3DPair` pattern should be back-ported to the 2D
  grid to eliminate the last per-frame allocation on the pair path.
- **Remove the stale `@flighthq/geometry` dependency.** Pure housekeeping; no code change needed.
- **Whether `createSpatialIndex2D`/`3D` should return Entity.** The backends are Entity but the index
  wrapper is not. If the index is an SDK object, it should be Entity; if it is a structural container
  (like a config bag), the current shape is fine. Settling this before the API ships avoids a breaking
  change.
- **Rename `'cells'` to a mode name that works for both grids and trees.** `'indexed'` or `'held'`
  would be truthful for both. Changes a shared vocabulary across both dimensions and every backend.
- **Ray entry-t and nearest-first order.** Changes the backend seam signature. Settle before P2/P3
  backends multiply. Affects `SpatialIndexBackend2D`/`3D` in `@flighthq/types`.
- **3D brute-force property tests.** The 2D grid has four-seed oracle comparison tests; the 3D grid
  does not. Adding them would bring the 3D grid to the same confidence level.
- **2D circle query.** A bounding-square region query mirroring `querySpatialSphere3D`, candidate set
  over the enclosing square. Additive; does not widen the backend seam.
- **`MAX_INDEXED_CELLS_PER_OBJECT` per-grid.** An optional `maxCellsPerObject?` parameter on the grid
  factory would let callers tune per workload. Purely additive.
- **Where `enableSpatialGuards` lives.** The core-layer rule keeps `@flighthq/log` out of this package.
  The guard seam + formatter ship here; wiring them to a logger is the caller's responsibility.
  Options: leave it to callers (current state), reclassify a package, or put a thin `spatial-guards`
  neighbor at the feature layer. Charter Open direction 5.
