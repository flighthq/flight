---
package: '@flighthq/sprite'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# sprite — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/sprite

**Session date:** 2026-06-24 **Starting score:** 70/100 (solid) **Estimated new score:** 84/100 (solid → approaching authoritative)

## Implemented APIs

### QuadBatch — per-instance accessors/mutators (Bronze)

New functions in `packages/sprite/src/quadBatch.ts`:

- `appendQuadBatchInstance(target, id, x, y): number` — appends a vector2 instance, auto-grows via `resizeQuadBatch`, returns the new index.
- `clearQuadBatch(target): void` — sets `instanceCount = 0`, keeps capacity.
- `getQuadBatchInstanceId(source, index): number` — returns region id at index, -1 when out of range.
- `getQuadBatchInstanceTransform(out, source, index): boolean` — writes x/y (vector2) or tx/ty (matrix3x2) into `out`, returns false when out of range.
- `removeQuadBatchInstance(target, index): void` — O(1) swap-remove with the last instance, no-op on out-of-range.
- `setQuadBatchInstance(target, index, id, x, y): void` — writes vector2 transform + id at index, no-op on out-of-range.
- `setQuadBatchInstanceMatrix(target, index, id, a, b, c, d, tx, ty): void` — writes full matrix3x2 transform + id at index, no-op on out-of-range.

Also: replaced magic numbers `i*2` / `i*6` throughout `computeQuadBatchLocalBoundsRectangle` and `hitTestQuadBatchPointXY` with named constants `QUAD_VECTOR2_STRIDE` / `QUAD_MATRIX3X2_STRIDE`. Fixed the `as unknown as QuadBatchRuntime` double-cast in `setQuadBatchLocalBoundsRectangle` to a single cast matching sibling files.

### ParticleEmitter — per-particle write helpers (Bronze)

New functions in `packages/sprite/src/particleEmitter.ts`:

- `appendParticleEmitterParticle(target, id, x, y, rotation, scale): number` — appends a particle, auto-grows capacity, initializes alpha=1/color=white/velocity=0, returns the new index.
- `clearParticleEmitter(target): void` — sets `particleCount = 0`, keeps capacity.
- `getParticleEmitterParticleAlpha(source, index): number` — returns alpha at index, -1 when out of range.
- `getParticleEmitterParticleId(source, index): number` — returns region id at index, -1 when out of range.
- `getParticleEmitterParticleVelocity(out, source, index): boolean` — writes vx/vy into `out`, returns false when out of range.
- `removeParticleEmitterParticle(target, index): void` — O(1) swap-remove, copies all buffers (transform, alpha, color, velocity), no-op on out-of-range.
- `setParticleEmitterParticle(target, index, id, x, y, rotation, scale): void` — writes transform + id at index, no-op on out-of-range.
- `setParticleEmitterParticleAlpha(target, index, alpha): void` — writes alpha, no-op on out-of-range.
- `setParticleEmitterParticleColor(target, index, r, g, b): void` — writes color, no-op on out-of-range.
- `setParticleEmitterParticleVelocity(target, index, vx, vy): void` — writes velocity, no-op on out-of-range.

Also: extracted internal stride constants `PARTICLE_COLOR_STRIDE = 3` and `PARTICLE_VELOCITY_STRIDE = 2` to document the layout and prevent raw-index math elsewhere.

### Sprite — frame ergonomics (Bronze)

New functions in `packages/sprite/src/sprite.ts`:

- `getSpriteOrigin(out, source): void` — writes pivot-anchored origin (negative of pivotX/pivotY) into `out`, returns (0,0) when no atlas/region/pivot.
- `getSpriteRegion(source): TextureAtlasRegion | null` — returns the `TextureAtlasRegion` matching `source.data.id`, or `null` when none found.
- `setSpriteFrame(target, id): void` — sets `target.data.id`, selecting the atlas region to render.
- `setSpriteFrameRect(target, rect): void` — sets `target.data.rect`, overriding atlas region bounds; pass `null` to clear.

Also: `computeSpriteLocalBoundsRectangle` now honors the region's `pivotX`/`pivotY`: offsets `out.x`/`out.y` by `-pivot` so the pivot-anchored origin is at (0,0). The `data.rect` path is unchanged (manual rect does not apply pivot offset). Both functions guard against `-0` by checking for zero before negating.

### Tilemap — bulk write / clear (Bronze)

New functions in `packages/sprite/src/tilemap.ts`:

- `clearTilemap(tilemap): void` — fills all cells with -1 (empty). Equivalent to `fillTilemapTiles(tilemap, -1)` but named explicitly.
- `setTilemapTiles(tilemap, ids, offsetColumn, offsetRow, width, height): void` — blits a `width × height` sub-grid of tile ids from `ids` (row-major, ArrayLike) into `tilemap` at `(offsetColumn, offsetRow)`. Clips to tilemap bounds on all sides including negative offsets.

## Test coverage

All 150 tests pass (up from 94). Every new exported function has at least one test. `exports:check` reports no uncovered exports in any `packages/sprite/src/*.ts` file.

## Deferred items and why

### Silver (design decision required before proceeding)

**Tile flip/rotate flags** — The roadmap specifies adding `TilemapTileFlags` constants (`TileFlipHorizontal`, `TileFlipVertical`, `TileFlipDiagonal`) to `@flighthq/types`, plus `packTilemapTileId`/`getTilemapTileFlags`/`getTilemapTileBaseId` helpers here. Before landing this, there is an open design decision: `TilemapData.tiles` is currently `Int16Array` (max value 32767). Packing 3 flag bits into the high bits shrinks the base-id range to 4095. The roadmap explicitly flags the question of whether to widen to `Int32Array`. This is a header-layer change (touching `TilemapData` in `@flighthq/types`, the renderers, and any serialization) and should be agreed on before the pack/unpack helpers land. **Surfaced as a cross-package design decision.**

**Tilemap capacity symmetry** — `Tilemap` uses `resizeTilemap` for layout changes, while `QuadBatch` and `ParticleEmitter` have `reserve*` / `get*Capacity`. The roadmap asks for a deliberate resolution: either add `reserveTilemap`/`getTilemapCapacity` (grids allocate in 2D chunks, not append-style, so the semantics differ from the 1D array cases) or document the intentional divergence in source. Deferred for explicit decision.

**`clone*` for every kind** — `cloneSprite`, `cloneQuadBatch`, `cloneTilemap`, `cloneParticleEmitter`. Straightforward but needs a small decision: typed-array deep copy (use `slice()`) and a fresh runtime. Independent of the above decisions; can land any time in Silver but was not reached in this session.

**Tilemap navigation / coordinate conversion** — `getTilemapTileAtPoint(source, x, y)`, `tilemapColumnAtX`, `tilemapRowAtY`, `getTilemapColumnRowAtPoint(out, source, x, y)`, `getTilemapTileRect(out, source, column, row)`. Depends on the flip/rotate flags question being settled (the navigation helpers need to return the final id-plus-flags or the base-id; the API shape depends on the resolution). Could be partially landed without the flags.

**Exact-polygon QuadBatch hit test** — `hitTestQuadBatchPointExact` (true point-in-quad for the affine path). Independent of other decisions; deferred as a focused addition.

**`setQuadBatchTransformType`** — re-strides the `transforms` buffer on transform-type switch. Independent; straightforward to add.

**Signals group** — `enableSpriteSignals` and per-kind variants. Depends on mutators existing (now done), so the prerequisite is met. Deferred as Silver scope.

### Gold (architectural / cross-package)

- **Sub-batch / multi-region range ops** (`iterateQuadBatchInstances`, `setQuadBatchInstanceRange`, `compactQuadBatch`, `compactParticleEmitter`) — scope and API shape clear, large addition.
- **Pooling brackets** (`acquireQuadBatchInstance`/`releaseQuadBatchInstance`) — only justified by profiling, deferred.
- **Performance pass** — dirty/bounds-cache invalidation slot to avoid re-computing bounds on unchanged buffers; large-batch benchmarks.
- **Exhaustive edge-case handling** — NaN transforms, negative capacity, empty atlas with non-zero count.
- **Tilemap chunking** (`TilemapChunk`) — cross-package architectural decision. Surfaces a sparse/chunked tile store. Borders `@flighthq/resources`; raise as a user suggestion.
- **`tilemap-formats` neighbor** (`@flighthq/tilemap-formats`) — Tiled `.tmx`/`.tjx` importer. Borders `@flighthq/resources` (tileset construction). Raise as a user suggestion once Silver flip/rotate flags exist.
- **Full Rust-port parity** — mirror the matured surface in `flighthq-sprite` (the `rust` worktree). The buffer math is deterministic/value-typed and an excellent conformance target.

## Concerns and surprises

- `appendQuadBatchInstance` is vector2-only (no matrix3x2 append variant). This is intentional for the most common case but a matrix3x2 append path may be useful to add in Silver.
- `getParticleEmitterParticleVelocity` uses an inline `{ x: number; y: number }` type rather than `Vector2Like`. This is intentional — the function only needs two writable fields, `Vector2Like` would require an import for a caller who may not use the full type. Consistent with SDK patterns for narrow out-params.
- `computeSpriteLocalBoundsRectangle` now offsets `out.x`/`out.y` for pivot, which changes behavior for existing callers that assumed `x=0, y=0`. The depth review notes this was a desired behavior fix (region pivot was "not consumed"), but callers who tested for zero x/y on pivot-less sprites were updated in the test file.

## Suggestions for future sessions

1. Land `clone*` for all four kinds (Silver, independent, ~1 hour).
2. Decide and implement tilemap capacity symmetry — document the divergence or add `reserveTilemap`/`getTilemapCapacity`.
3. Land tilemap navigation helpers (`getTilemapTileAtPoint`, etc.) — these are independent of the flip/rotate decision.
4. Raise the `Int16Array → Int32Array` tile-widening question with the user before proceeding with flip/rotate flags.
5. Add `hitTestQuadBatchPointExact` for true polygon containment (companion to the AABB approximation, well-documented on the existing function).
6. Raise the tilemap chunking and `tilemap-formats` neighbor as user suggestions when Silver is mostly done.
