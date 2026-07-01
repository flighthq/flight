# Depth Review: @flighthq/sprite

**Domain:** Atlas-based batch-rendered scene-graph primitives — the GPU-batch node family: individual atlas `Sprite`, a packed `QuadBatch` (instanced quads), a `Tilemap` (grid of tile ids), and a `ParticleEmitter` render container (data buffers only). This is the "draw many textured quads from one atlas in one pass" graph layer of a 2D engine (the role of Starling's `Image`/`QuadBatch`/`Tilemap`, PixiJS `ParticleContainer`/`Mesh`, OpenFL `Tilemap`/`Tile`).

**Verdict:** solid — **70/100**

The package is a clean, complete realization of _exactly the slice it owns_: four batch graph-node kinds, each with the canonical entity/data/runtime quartet, capacity-managed typed-array storage, local-bounds computation, and hit testing for the batch type. It is not a stub — the buffer math (vector2 vs matrix3x2 transform strides, affine corner-transform bounds and hit tests) is real and exhaustive for what is present. It falls short of "authoritative" mainly because several capabilities a developer reaching for a "sprite/tilemap library" expects are deliberately housed in sibling packages, and a few that arguably belong _here_ (per-quad/per-tile mutation helpers, atlas-region-aware sprite frame helpers) are absent.

## Present capabilities

**Sprite (single atlas quad)**

- `createSprite` / `createSpriteData` / `createSpriteRuntime`, `getSpriteRuntime` — entity quartet.
- `computeSpriteLocalBoundsRectangle` — bounds from explicit `rect`, else from the atlas region matching `data.id`.
- `data` carries `atlas`, `id` (region id), and an override `rect`.

**QuadBatch (instanced atlas quads)**

- Quartet + `getQuadBatchRuntime`.
- Typed-array instance storage: `ids: Uint16Array`, `transforms: Float32Array`, `instanceCount`, `transformType` (`'vector2'` | `'matrix3x2'`), per-quad `materialData`.
- Capacity management: `getQuadBatchCapacity`, `getQuadBatchTransformStride`, `reserveQuadBatch` (geometric growth), `resizeQuadBatch` (doubling growth).
- `computeQuadBatchLocalBoundsRectangle` — correct per-instance union for both translation-only and full affine (3x2) instances.
- `hitTestQuadBatchPoint` / `hitTestQuadBatchPointXY` — returns the topmost-by-iteration instance index (or -1), affine-aware (note: AABB of the transformed quad, not exact polygon containment).
- `setQuadBatchLocalBoundsRectangle` — cached/override bounds with `invalidateNodeLocalBounds`.
- Runtime `instanceVelocities` slot for per-instance motion-vector output.

**Tilemap (tile grid)**

- Quartet + `getTilemapRuntime`.
- `Int16Array` tile grid (-1 = empty), `columns`/`rows`, `tileset`, per-tile `materialData`.
- `getTilemapTile` / `setTilemapTile` (bounds-checked), `fillTilemapTiles`, `resizeTilemap` (content-preserving re-grid).
- `computeTilemapLocalBoundsRectangle` from tileset tile dimensions × grid.

**ParticleEmitter (batch render container)**

- Quartet + `getParticleEmitterCapacity`, `reserveParticleEmitter`.
- Buffers for `transforms` (x, y, rotation, scale stride-4), `colors`, `alphas`, `ids`, `velocities`, `worldSpace`.
- `computeParticleEmitterLocalBoundsRectangle` — rotate+scale corner-transform union; `setParticleEmitterLocalBoundsRectangle` override.

Cross-cutting: every kind is registered against a `*Kind` string in `@flighthq/types`, with renderers (`renderCanvasSprite`, `renderGlSprite`/`flushGlSpriteBatch`, `renderWgpuSprite`) and interaction (`defaultSpriteHitTestPoint`) living in their proper backend/interaction packages. The package itself is value-typed, side-effect-free, and tree-shakable.

## Gaps vs an authoritative sprite/batch library

In-scope omissions (missing-by-omission — these arguably belong in this package):

- **Per-quad write helpers.** `QuadBatch` exposes raw `ids`/`transforms` typed arrays plus capacity helpers, but there is no `setQuadBatchInstance(target, i, id, x, y[, matrix])`, `getQuadBatchInstanceId/Transform`, `appendQuadBatchInstance`, `removeQuadBatchInstance`, or `clearQuadBatch`. Callers must hand-write stride math (`i*2` vs `i*6`) and know the layout — leaky for a batch library whose whole value proposition is managing that buffer. Starling/PixiJS expose add/remove/setAt for exactly this.
- **Sprite frame ergonomics.** A `Sprite` references a region by `id`, but there is no `setSpriteFrame`/`getSpriteRegion`/pivot-aware origin helper. Region pivot (`pivotX/pivotY`) exists on `TextureAtlasRegion` but is not consumed in `computeSpriteLocalBoundsRectangle` or any anchor helper here.
- **Tile flip/rotation flags.** `Int16Array` tile ids carry no flip-H/flip-V/rotate bits, and there are no pack/unpack helpers. Tiled-map and most tilemap engines support flipped/rotated tiles; that vocabulary is absent.
- **Tilemap region queries.** No `getTilemapTileAtPoint(x, y)` / `worldToTileColumn`/`tileToLocalRect` conversions — standard tilemap navigation. Hit testing exists for `QuadBatch` but not `Tilemap`.
- **ParticleEmitter per-particle write helpers** parallel to the QuadBatch gap (`setParticleEmitterParticle`, append/remove), and there is no `clear`/compaction.
- **No `clone*`** for any kind (the SDK uses `clone*` as a first-class verb elsewhere).

Out-of-scope by design (correctly housed elsewhere — missing-by-design, not a depth fault):

- **Particle _simulation_** (forces, colliders, lifetime curves, spawn rules, emitter config/state) lives in `@flighthq/particles`. The `ParticleEmitter` here is intentionally only the render-buffer container. This is the right split per the cellular-architecture rule.
- **Atlas / tileset construction and region lookup** (`createTextureAtlas`, `createTileset`, parsers) live in `@flighthq/resources` — atlases are resources, not graph nodes.
- **Spritesheet animation / frame playback** is `@flighthq/spritesheet` (+ `-formats`); timeline playback is `@flighthq/timeline`.
- **Drawing and batch flushing** are the `displayobject-{canvas,gl,wgpu}` renderers.

## Naming / API-shape notes

- Naming is consistent and self-identifying: full type words throughout (`computeQuadBatchLocalBoundsRectangle`, not `computeQBBounds`), correct `create*`/`get*`/`reserve*`/`resize*`/`hitTest*`/`compute*`/`set*` verbs, and out-parameter bounds functions. Conforms to the project's design constraints well.
- Allocation discipline is clean: `reserve*` grows capacity, `resize*` sets logical count, `compute*` writes to `out`. Good for the C/C++ port goal.
- One mild asymmetry: `QuadBatch` and `ParticleEmitter` expose capacity helpers (`getQuadBatchCapacity`, `reserveQuadBatch`), but `Tilemap` (also a typed-array grid) does not follow the same pattern — its growth is via `resizeTilemap` only. Defensible (grids are 2D, not append-style), but worth a deliberate note.
- `hitTestQuadBatchPoint*` returns an instance index — a good, allocation-free sentinel API. The AABB-of-transformed-quad approximation for affine instances should be documented (it over-reports on rotated quads); an exact-polygon variant would round out an authoritative API.
- `setQuadBatchLocalBoundsRectangle` uses a double cast (`as unknown as QuadBatchRuntime`) where the sibling particle/sprite files use a single cast — minor inconsistency worth tidying.

## Recommendation

Keep the scope split — particles/resources/spritesheet living in their own packages is correct and should not be pulled in. To move from **solid** toward **authoritative within its own slice**, add the in-scope buffer-management ergonomics that a batch library is expected to own:

1. Per-instance accessors/mutators for `QuadBatch` and `ParticleEmitter`: `set*Instance` / `get*Instance*` / `append*` / `remove*` / `clear*`, hiding the stride layout.
2. `Sprite` frame/pivot helpers: `setSpriteFrame`, pivot-aware origin, and have `computeSpriteLocalBoundsRectangle` honor region pivot.
3. Tilemap navigation + flip/rotate tile flags: `getTilemapTileAtPoint`, world↔tile coordinate conversion, and flip/rotation bit pack/unpack helpers.
4. `clone*` for each kind; tidy the `as unknown as` cast and document the affine hit-test/bounds approximation.

These are bounded, in-domain additions; with them the package would be a credible standalone "atlas batch graph" library rather than a correct-but-minimal node set.
