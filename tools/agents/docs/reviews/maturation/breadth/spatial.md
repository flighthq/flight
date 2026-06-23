# New Package Spec: @flighthq/spatial

**Represents:** A value-typed 2D broadphase spatial index — quadtree, uniform grid, and spatial hash structures with insert/remove/update/query plus point, region (AABB), ray, and nearest queries — for culling and collision broadphase over large entity counts.

**Requested by:** game-2d

**Fits:**

`@flighthq/spatial` is a leaf data-structure package: it stores axis-aligned bounds keyed by a caller-owned integer id and answers spatial queries fast. It is the "what's near X / on screen" layer the game-2d review names as a distinct hole, sitting _below_ both the (future) `camera2d` culling step and a (future) `collision`/`physics2d` narrowphase, and feeding both. It owns no scene-graph identity and no display objects — it indexes opaque ids the caller maps back to whatever it likes (a `DisplayObject`, a sprite, a collision body, a `NodeId`).

- **Dependencies:** `@flighthq/types` (header layer) and `@flighthq/geometry` (for `Rectangle`/`RectangleLike`, `Aabb`/`AabbLike`, `Vector2Like`, and the existing `intersectsRectangle` / `containsRectanglePointXY` value math — `spatial` reuses these rather than re-deriving overlap tests). No `node`, no `render`, no platform dependency. Pure CPU data structures, headlessly testable and fingerprintable — a member of the mixable value-typed leaf set.
- **Position in the SDK:** indexes are populated and queried by gameplay/culling code each frame; `spatial` never owns a loop and never reads the scene graph. The `@flighthq/sdk` barrel re-exports it. Dependency points downward only: `spatial` imports `geometry`, never the reverse, and nothing in `spatial` imports `displayobject`/`sprite`/`interaction`.
- **Neighbor packages:** `@flighthq/geometry` (supplies the rect/AABB/vector value types and overlap predicates), `@flighthq/interaction` (point hit-testing for _picking_, which can sit on top of a spatial query as broadphase but is a different concern), a future `@flighthq/camera2d` (consumes `querySpatialIndexRegion` for visible-set culling), and a future `@flighthq/collision`/`physics2d` (consumes `querySpatialIndexPairs` for broadphase before narrowphase). No `-formats` neighbor is warranted: a spatial index is a runtime structure built from live bounds, not an authored asset with a file format to import.
- **Backend seam:** none. A spatial index is deterministic CPU computation with no platform capability behind it, so there is no `*Backend` / `get*` / `set*` / `createWeb*` surface (same posture as `geometry` and `spring`).
- **Rust crate:** `flighthq-spatial`, a 1:1 mirror under `crates/`. Free functions over `&mut QuadtreeIndex` / `&UniformGridIndex` / out-params and a `SpatialId` newtype; deterministic, no GPU, bit-comparable under the conformance suite. Query results write into a caller-owned `&mut Vec<SpatialId>` / out-slice to honor explicit allocation.

Types are defined in `@flighthq/types` first (the header layer), then implemented in `@flighthq/spatial` against them.

## Bronze

The minimum viable, genuinely useful version: one general-purpose index (a quadtree), the insert/remove/query loop a game actually runs each frame, and the region query that drives culling — the 20% that delivers the 80% the review asks for.

- **Types in `@flighthq/types`:**
  - `SpatialId` — a branded `number` newtype for the caller-owned id stored against each entry (the value the caller maps back to its own object; `spatial` never dereferences it).
  - `SpatialIndexKind` — string `*Kind` identifier vocabulary: `QuadtreeKind = 'Quadtree'` for now (the family grows in Silver/Gold), used as the serialized/registry-friendly tag of which structure an index is.
  - `QuadtreeIndex` — the entity: a `{ kind }` data field plus an opaque paired `QuadtreeIndexRuntime` holding the node tree, entry table (`SpatialId → AABB`), and bounds. Public code treats the runtime as internal (entity/runtime split).
  - `SpatialQueryResult` — `{ ids: SpatialId[]; count: number }` written into a caller-supplied `out` so a hot query loop reuses one result buffer (explicit allocation).
  - `SpatialBoundsLike` — the structural input for an entry's bounds, aliased to `RectangleLike` (left/top/width/height in world space) so callers pass display-object bounds directly.
- **Quadtree core in `@flighthq/spatial`:**
  - `createQuadtreeIndex(bounds, options?): QuadtreeIndex` — allocate over a world `RectangleLike` extent; `QuadtreeOptions` (`{ maxEntriesPerNode?: number; maxDepth?: number }`) in `@flighthq/types`.
  - `insertSpatialEntry(index, id, bounds): boolean` — index `id` at `bounds`; returns `false` if the bounds fall fully outside the index extent (expected failure, sentinel not throw).
  - `removeSpatialEntry(index, id): boolean` — remove by id; `false` if not present.
  - `updateSpatialEntry(index, id, bounds): boolean` — reposition an existing entry (the per-frame moving-entity path); equivalent to remove+insert but reuses the entry slot.
  - `clearSpatialIndex(index): void` — drop all entries, keep the allocated structure for reuse.
  - `getSpatialEntryCount(index): number`.
- **Queries (the read side):**
  - `querySpatialIndexRegion(index, region, out): SpatialQueryResult` — all ids whose bounds overlap a `RectangleLike` (the culling / "what's on screen" query). Writes into `out`.
  - `querySpatialIndexPoint(index, x, y, out): SpatialQueryResult` — all ids whose bounds contain a world point.
  - `containsSpatialEntry(index, id): boolean`.
- **Tests:** colocated `*.test.ts` per source file — insert/remove/update round-trips, region query correctness against a brute-force oracle (every id whose `intersectsRectangle` is true is returned, no more), out-of-extent insert sentinel, `out`-buffer reuse, empty-index queries.

Effort: small–medium. A single quadtree with the frame loop (insert/update/remove) plus region + point query is the whole 80%.

## Silver

Competitive and solid — matches what a well-regarded broadphase library (rbush, Box2D's broadphase, Phaser's spatial structures) offers: the alternate structures the request names, the ray/nearest queries, the pair-enumeration that makes it a real collision broadphase, and bulk/pooled population for large worlds.

- **Types in `@flighthq/types`:**
  - `UniformGridKind = 'UniformGrid'`, `SpatialHashKind = 'SpatialHash'` added to the `SpatialIndexKind` vocabulary.
  - `UniformGridIndex` / `SpatialHashIndex` entities (each `{ kind }` + opaque runtime), giving three interchangeable structures behind a shared query vocabulary.
  - `SpatialIndex` — a feature alias union (`QuadtreeIndex | UniformGridIndex | SpatialHashIndex`) so query functions are written once against the family, mirroring the graph-feature-alias pattern (`HierarchyNode`). Query/insert functions dispatch on `.kind`.
  - `SpatialRayLike` — `{ originX; originY; dirX; dirY; maxDistance? }` (the ray for ray queries; direction need not be normalized — documented).
  - `SpatialRayHit` — `{ id: SpatialId; distance: number; nearX: number; nearY: number }`.
  - `SpatialPair` — `{ a: SpatialId; b: SpatialId }`, and `SpatialPairResult` (`{ pairs: SpatialPair[]; count: number }`) for broadphase pair enumeration into an `out`.
  - `SpatialNearestResult` — `{ ids; distances; count }` for k-nearest.
- **Uniform grid & spatial hash:**
  - `createUniformGridIndex(bounds, cellSize, options?)` — a bounded grid (best when entities are evenly sized/distributed); `UniformGridOptions` in types.
  - `createSpatialHashIndex(cellSize, options?)` — an _unbounded_ hashed grid (no fixed world extent; good for streaming/large open worlds). Shares the insert/remove/update/query surface via the `SpatialIndex` alias.
  - All three implement `insertSpatialEntry` / `removeSpatialEntry` / `updateSpatialEntry` / `querySpatialIndexRegion` / `querySpatialIndexPoint` identically (cross-structure consistency is a tested property).
- **Ray & broadphase queries:**
  - `raycastSpatialIndex(index, ray, out): SpatialQueryResult` — all ids whose bounds the ray crosses (broadphase: unordered).
  - `raycastSpatialIndexNearest(index, ray, out): SpatialRayHit | null` — the first AABB the ray enters, with entry distance (line-of-sight / projectile broadphase); `null` on no hit.
  - `querySpatialIndexPairs(index, out): SpatialPairResult` — enumerate all overlapping AABB pairs in the index (the collision broadphase entry point), de-duplicated.
  - `querySpatialIndexOverlaps(index, id, out): SpatialQueryResult` — everything overlapping one entry's bounds (excluding itself), the per-body broadphase.
- **Nearest / distance queries:**
  - `querySpatialIndexNearest(index, x, y, count, out): SpatialNearestResult` — k-nearest ids to a point.
  - `querySpatialIndexWithinRadius(index, x, y, radius, out): SpatialQueryResult` — circle/radius region (proximity, AoE).
- **Bulk population & pooling:**
  - `bulkInsertSpatialEntries(index, ids, bounds, count): void` — load a packed batch (a static layer / level geometry) in one pass; for the quadtree this enables a balanced bottom-up build instead of repeated splits.
  - `rebuildSpatialIndex(index): void` — recompute structure from current entries (after many in-place updates have degraded a grid/quadtree).
  - `acquireSpatialQueryResult()` / `releaseSpatialQueryResult(result)` and `acquireSpatialPairResult()` / `releaseSpatialPairResult(result)` — pooled result buffers for hot query loops, honoring the `acquire*`/`release*` bracket rule.
- **Iteration:** `forEachSpatialEntry(index, visit)` and `getSpatialIndexExtent(index, out): Rectangle` (the index's current world bounds, for debug overlays/culling).
- **Tests:** every query cross-checked against a brute-force oracle across all three structures; ray-nearest distance correctness; pair-enumeration de-dup and symmetry; alias-safe `out`; cell-size edge cases (entity larger than a cell, entity straddling cells, negative coordinates in the spatial hash).

Effort: medium. The three structures share one query vocabulary, so the work is one structure family + the ray/pair/nearest query set + bulk/pool plumbing — each self-contained.

## Gold

Authoritative / AAA — the canonical 2D broadphase reference: exhaustive structures, swept/continuous queries, incremental/persistent broadphase, full edge-case and error handling, debug introspection, complete tests and docs, and 1:1 Rust parity.

- **Additional structures (types in `@flighthq/types` first):**
  - `LooseQuadtreeKind` / `LooseQuadtreeIndex` — a loose quadtree (overlapping node bounds) that handles entities straddling node boundaries without forcing them up to the root, a common quadtree pathology for large moving objects.
  - `DynamicAabbTreeKind` / `DynamicAabbTreeIndex` — a fattened-AABB dynamic bounding-volume tree (Box2D `b2DynamicTree`), the gold-standard structure for many moving bodies: incremental re-insert only when an entity leaves its fat AABB, with tree-rotation rebalancing. Added to the `SpatialIndex` alias.
  - `SortAndSweepKind` / `SortAndSweepIndex` — a sweep-and-prune (sort-and-sweep) broadphase with persistent overlap pairs, optimal for the "many bodies, small per-frame motion" case.
- **Swept / continuous queries (CCD broadphase):**
  - `SpatialSweptBoundsLike` — `{ bounds: RectangleLike; deltaX; deltaY }` (an AABB plus its motion this frame).
  - `querySpatialIndexSwept(index, swept, out): SpatialQueryResult` — everything a moving AABB could touch along its path (tunneling-safe broadphase; the moving AABB's swept extent expands the region).
  - `raycastSpatialIndexAll(index, ray, out): SpatialRayHitResult` — every hit ordered by entry distance (penetrating ray / pierce queries), distances written into a parallel out array.
- **Incremental / persistent broadphase (the perf story):**
  - `SpatialPairDelta` — `{ added: SpatialPair[]; removed: SpatialPair[]; ... }`: which overlap pairs began and ended this step, so the narrowphase only processes _changes_.
  - `updateSpatialIndexPairs(index, out): SpatialPairDelta` — persistent pair tracking across frames (the dynamic-tree / sort-and-sweep payoff), instead of recomputing all pairs every frame.
  - Fat-AABB margin tuning: `DynamicAabbTreeOptions` (`{ fatMargin?: number; predictiveMargin?: number }`) so callers trade re-insert frequency against query overlap.
- **Batch / typed-array throughput:**
  - `querySpatialIndexRegions(index, regions, count, out): void` — answer many region queries (per-camera-tile culling) in one walk with zero per-query allocation, results packed into a flat out structure.
  - `getSpatialEntryBoundsInto(index, ids, count, out): void` — bulk-read stored bounds for a set of ids into a flat `Float32Array` (debug, narrowphase hand-off).
- **Filtering / layers:**
  - `SpatialMask` — a `number` bitmask carried per entry (`insertSpatialEntry(index, id, bounds, mask?)`), with `querySpatialIndexRegionMasked(...)` / `querySpatialIndexPairsMasked(...)` honoring category/collision-layer masks so broadphase skips non-interacting layers (player-vs-world vs. bullet-vs-enemy) without post-filtering.
- **Signals (opt-in):** `enableSpatialIndexSignals(index)` exposing `onSpatialPairBegin` / `onSpatialPairEnd` via `@flighthq/signals`, behind the `enable*` group so the default bundle stays signal-free — the event form of `updateSpatialIndexPairs`.
- **Introspection / debug:**
  - `forEachSpatialIndexNode(index, visit)` and `SpatialIndexNodeInfo` (`{ bounds; depth; entryCount }`) — walk the structure for debug overlays of the tree/grid subdivision.
  - `getSpatialIndexStats(index, out): SpatialIndexStats` (`{ entryCount; nodeCount; maxDepth; averageEntriesPerNode; ... }`) — health metrics so a game can detect a degenerate index and `rebuildSpatialIndex`.
- **Robustness & docs:** documented behavior for zero-size bounds, NaN/Infinity coordinates (sentinel-rejected, not thrown), entities far outside the extent (spatial hash) vs. clamped (bounded grid), and degenerate cell sizes. Throw only on genuine misuse (e.g. non-positive `cellSize`, a programmer error). Doc comments state allocation, alias, and coordinate-space semantics on every function.
- **Tests & API review:** exhaustive oracle cross-checks across all structures and every query (region/point/ray/swept/nearest/radius/pairs/masked); persistent-pair delta correctness over multi-frame motion; dynamic-tree re-insert and rebalance invariants; alias-safe `out` everywhere; `npm run api spatial` reviewed for naming symmetry with `geometry` and `interaction`.
- **Rust parity:** `flighthq-spatial` mirrors every structure and query, recorded in the conformance map and exercised by the parity differ (deterministic CPU — clean conformance reference, no GPU readback). A candidate `spatial-rs`-style mixable wasm leaf if ever desired.

Effort: large but cleanly partitioned — the dynamic-AABB-tree + sort-and-sweep structures, the persistent-pair/incremental broadphase, the swept/CCD queries, and the Rust mirror are the four substantial pieces; masks, stats, and debug walks are incremental on top.

## Boundaries

- **No narrowphase, no collision response.** `spatial` answers "which AABB pairs _might_ touch" (broadphase). Exact shape-vs-shape overlap (circle/polygon/swept-shape), penetration/separation vectors, and resolution belong to a future `@flighthq/collision`/`physics2d` neighbor that consumes `querySpatialIndexPairs`. `spatial` stores only axis-aligned bounds.
- **No scene-graph coupling.** It never reads `DisplayObject`/`Sprite` bounds, never holds a `NodeId`, never walks the hierarchy. The caller extracts world bounds (via `getDisplayObjectBounds`) and inserts them against its own id; keeping `spatial` graph-free is what keeps it a mixable leaf and reusable for non-display entities.
- **No picking/dispatch.** Pointer hit-testing, event dispatch, and per-kind interaction stay in `@flighthq/interaction`. A picking layer _may_ use a spatial region/point query as its broadphase, but the dispatch semantics are not this package's concern.
- **No camera/culling policy.** Deciding _what_ the visible region is, parallax, follow, and world↔screen transforms belong to a future `@flighthq/camera2d`; `spatial` only answers the region query that culling issues.
- **No file formats.** A spatial index is built from live runtime bounds, not an authored asset — there is no `spatial-formats` neighbor.
- **No backend seam.** Pure CPU data structures; no `*Backend` / `createWeb*` surface.
- **No 3D.** The 3D spatial-3d perspective's octree/BVH-over-`Aabb` needs are a separate concern; if shared structure emerges, a `scene`-adjacent 3D index is its own package, not a generic-dimension contortion here. (See Open questions.)

## Open design questions

- **Generic dimension vs. 2D-named surface.** The structures (quadtree, grid, hash, dynamic-AABB-tree) generalize to 3D (octree, dynamic-tree over `Aabb`). Do we ship a strictly 2D `spatial` (concrete, `RectangleLike`, matching the requesting game-2d lens) and let a future 3D index be its own package, or design one dimension-parameterized surface now? The 2D-concrete path matches the SDK's preference for obvious, concrete names over premature abstraction — proposed default — but the duplication with a later 3D index is worth flagging.
- **One `SpatialIndex` alias vs. per-structure functions.** Silver proposes a `SpatialIndex` union with `.kind` dispatch so queries are written once. The alternative is fully separate `queryQuadtree*` / `queryUniformGrid*` surfaces (more grep-direct, no runtime dispatch, better tree-shaking per structure). Decide whether the shared vocabulary or the per-structure explicitness wins — affects how many exported names the package carries.
- **Id ownership and stability.** `SpatialId` is caller-owned. Should `spatial` _assign_ ids (`insertSpatialEntry` returns a fresh `SpatialId`, slotmap-style, matching the Rust port's `NodeId`/`NodeArena` model) or store a caller-supplied id (caller maps it to its own object)? The Rust-port arena precedent argues for index-assigned ids; the "index opaque ids the caller already has" model is simpler for game code. This choice must be made before Bronze and must match across TS and Rust.
- **Bounds storage: copy vs. reference.** Does `insertSpatialEntry` copy the `RectangleLike` into the entry table (safe, but the caller must `updateSpatialEntry` on movement) or hold a reference (auto-tracks mutation, but couples lifetime and breaks the value-leaf purity)? Copy is the house-style answer (plain data, explicit update); confirm callers accept the explicit per-frame `updateSpatialEntry`.
- **Default structure for the docs/examples front door.** Quadtree is the most recognizable and the safe Bronze default, but the dynamic-AABB-tree is what a perf-conscious game with many moving bodies actually wants. Decide which structure the culling/broadphase examples lead with.
- **Pair-enumeration determinism for conformance.** `querySpatialIndexPairs` order depends on tree/grid traversal; for Rust↔TS conformance the pair _set_ must match but the _order_ may differ. Decide whether results are sorted (deterministic, fingerprintable, slight cost) or set-compared in the conformance differ.
