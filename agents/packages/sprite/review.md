---
package: '@flighthq/sprite'
status: solid
score: 71
updated: 2026-09-02
ingested:
  - charter.md (absorbed into scene2d + quadbatch + tilemap + particleemitter)
  - status.md (2026-08-08)
  - prior review.md (2026-07-13, scored 78) and assessment.md (2026-07-13)
  - source: scene2d/src/sprite.ts (8 exports), quadbatch/src/quadBatch.ts (31 exports), tilemap/src/tilemap.ts (22 exports)
  - tests: scene2d/src/sprite.test.ts (9 describes), quadbatch/src/quadBatch.test.ts (30 describes), tilemap/src/tilemap.test.ts (22 describes)
  - packages/quadbatch/package.json, packages/tilemap/package.json, packages/scene2d/package.json
  - types/src/Sprite.ts, types/src/QuadBatch.ts, types/src/QuadBatchSignals.ts, types/src/Tilemap.ts, types/src/TilemapSignals.ts
  - tilemap-formats/src/tiledProject.ts, tilemap-formats/src/tiledGid.ts (flip-bit landing check)
---

# sprite -- Review

> Full re-survey of the three split packages that absorbed `@flighthq/sprite`. There is no `packages/sprite/` directory; the charter's `absorbed:` field names the successors. This review verifies the charter's decisions and open directions against the live code in `scene2d/src/sprite.ts`, `quadbatch/src/quadBatch.ts`, and `tilemap/src/tilemap.ts`. The prior review (2026-07-13, 78/100) surveyed the three-quartet package pre-split.

## Verdict

**absorbed -- 71/100.** The split was clean and the three successors each carry well-tested, side-effect-free free-function surfaces with proper barrel/contract lanes, `sideEffects: false`, alphabetized exports, and colocated test coverage. The score drops from the prior 78 because: (a) five of the prior review's nine gaps persist unaddressed across the split packages; (b) the Sprite quartet lost its signals group and its atlas-facing API (frame selection, region lookup, pivot-anchored origin) entirely, narrowing it to a minimal texture-node wrapper with an out-param hygiene defect; (c) the charter is deeply stale, still describing four quartets and decisions for a package that no longer exists; (d) a new lane defect (`QUAD_BATCH_DELETED_ID` is contract-only despite Decision #1 blessing it as user-facing) and a phantom dependency (`tilemap` declares `@flighthq/quadbatch` but never imports from it) have appeared since the split.

## Present capabilities

### Sprite (scene2d/src/sprite.ts -- 8 exports, 3 public)

- Quartet: `createSprite` / `createSpriteData` / `createSpriteRuntime` / `SpriteKind` (kind lives in `@flighthq/types`).
- `cloneSprite` -- deep-copies through a fresh entity, sharing the texture reference.
- `computeSpriteLocalBoundsRectangle` -- derives width/height from `getTextureWidth(texture) * |uvScale.x|` and `getTextureHeight(texture) * |uvScale.y|`. Wired as the runtime default bounds method. Writes `out.width` and `out.height` only; `out.x`/`out.y` are never written (see Gap 1).
- Texture-aware dirty detection: `createSpriteRendererData` stamps texture identity + version per render state; `isSpriteRendererDirty` compares and auto-latches.
- Texture-aware bounds validity: `isLocalBoundsRectangleValid` (unexported, wired into runtime) re-checks when the texture reference or version changes, so bare `sprite.data.texture = newTex` triggers bounds refresh without explicit invalidation.
- `getSpriteRuntime` -- contract-only read accessor.
- Public lane exports only: `cloneSprite`, `computeSpriteLocalBoundsRectangle`, `createSprite`. The five contract-only exports are plumbing consumed by renderers and `scene2d` internals.

### QuadBatch (quadbatch/src/quadBatch.ts -- 31 exports, 26 public)

- Quartet: `createQuadBatch` / `createQuadBatchData` / `createQuadBatchRuntime` / `QuadBatchKind`.
- Capacity: `reserveQuadBatch`, `resizeQuadBatch`, `getQuadBatchCapacity` (via `reserveFloat32Array`/`reserveUint16Array`).
- Per-instance CRUD: `appendQuadBatchInstance` (vector2, auto-grow, emits `onInstanceAppended`), `setQuadBatchInstance` (vector2), `setQuadBatchInstanceMatrix` (matrix3x2), `setQuadBatchInstanceRange` (bulk write from `Float32Array`), `setQuadBatchInstanceTint` (lazy per-instance materialData allocation, packs RGBA via `>>> 0`).
- Read: `getQuadBatchInstanceId`, `getQuadBatchInstanceTransform` (writes `out.x`/`out.y`; does not write matrix fields for vector2 batches).
- Deletion: `removeQuadBatchInstance` (O(1) swap-remove, emits `onInstanceRemoved` with swap source), `compactQuadBatch` (filters `QUAD_BATCH_DELETED_ID` sentinel, preserves order, maintains `materialData`), `clearQuadBatch` (emits `onCleared`).
- Iteration: `iterateQuadBatchInstances` (allocation-free, subarray views per stride).
- Transform type switching: `setQuadBatchTransformType` (vector2 <-> matrix3x2, reverse-order expand, in-place collapse).
- Hit testing: AABB (`hitTestQuadBatchPointXY`, `hitTestQuadBatchPoint`) and exact polygon (`hitTestQuadBatchPointExactXY`, `hitTestQuadBatchPointExact`) via cross-product winding.
- Bounds: `computeQuadBatchLocalBoundsRectangle` (recomputes AABB over all instances, both strides, zeroes out on empty), `setQuadBatchLocalBoundsRectangle` (user-set override, copies into runtime, invalidates node local bounds). Default bounds method `copyLocalBoundsRectangle` copies the user-set override when present; leaves `out` untouched when null (see Gap 2).
- Signals: `enableQuadBatchSignals` / `getQuadBatchSignals` / `createQuadBatchSignals`; `Symbol`-keyed slot, zero-cost until enabled.
- Stride constants: `getQuadBatchTransformStride`, `QUAD_BATCH_DELETED_ID`.
- Runtime slot: `instanceVelocities` consumed by `scene2d-gl`/`-wgpu` velocity writers.

### Tilemap (tilemap/src/tilemap.ts -- 22 exports, 18 public)

- Quartet: `createTilemap` / `createTilemapData` / `createTilemapRuntime` / `TilemapKind`.
- `cloneTilemap` -- deep-copies grid, atlas ref (shared), and tiles buffer (cloned `Int16Array`).
- Grid ops: `getTilemapTile` / `setTilemapTile` (emits `onTileChanged`), `fillTilemapTiles`, `clearTilemap` (emits `onCleared`), `setTilemapTiles` (clipped row-major blit-in, emits `onTilesChanged`), `setTilemapTileTint` (lazy per-tile materialData allocation).
- Resize: `resizeTilemap` (content-preserving, new cells filled with -1).
- Navigation: `getTilemapColumnAtX`, `getTilemapRowAtY`, `getTilemapColumnRowAtPoint` (writes `out` as `Vector2Like`), `getTilemapTileAtPoint`/`getTilemapTileAtPointXY`, `getTilemapTileRect`.
- Bounds: `computeTilemapLocalBoundsRectangle` (columns * tileWidth, rows * tileHeight, zeroes when atlas is null). Writes all four `out` fields correctly.
- Signals: `enableTilemapSignals` / `getTilemapSignals` / `createTilemapSignals`; `Symbol`-keyed slot.

### Hygiene across all three

- All three packages declare `"sideEffects": false`.
- All cross-package types live in `@flighthq/types`: `Sprite`/`SpriteData`/`SpriteRuntime`, `QuadBatch`/`QuadBatchData`/`QuadBatchRuntime`/`QuadBatchSignals`, `Tilemap`/`TilemapData`/`TilemapRuntime`/`TilemapSignals`.
- Two-lane barrel structure: `.` (public) and `./contract` (full surface). `contract.ts` re-exports everything; `index.ts` selectively re-exports the public subset.
- Sentinels (`-1`/`false`/no-op) throughout; `Readonly<>` on inputs.
- Tests: 9 + 30 + 22 = 61 `describe` blocks across the three test files, mirroring the 61 exports (QUAD_BATCH_DELETED_ID tested within `compactQuadBatch`'s block).

## Gaps

Vs the charter's north star and the prior review's gap list (numbered to track lineage):

1. **Out-param hygiene in `computeSpriteLocalBoundsRectangle`.** `out.x` and `out.y` are never written. When texture is non-null, `out.width` and `out.height` are set but `out.x`/`out.y` retain whatever the caller passed. When texture is null, width/height are set to 0 but x/y are still untouched. This violates the "sentinel or fully-written out" rule. Test coverage does not catch this because `createRectangle()` initializes x/y to 0, which happens to be the correct value. _(Prior review Gap 2, persists.)_

2. **QuadBatch default bounds method leaves `out` untouched when no override is set.** `copyLocalBoundsRectangle` (the runtime default) does nothing when `runtime.localBoundsRectangle === null`. The separate `computeQuadBatchLocalBoundsRectangle` zeroes correctly, but the default method that `getNodeLocalBoundsRectangle` invokes does not. _(Prior review Gap 2, persists.)_

3. **Stale, self-contradicting `compactQuadBatch` doc comment.** Lines 76-86 of `quadBatch.ts` still state: "this function does NOT filter by id," references an "id==-1 sentinel" and "callers zero-out ids," and calls itself "a no-op for the common case." The body correctly filters `QUAD_BATCH_DELETED_ID` (0xffff) per charter Decision #1. The comment and the code disagree. _(Prior review Gap 3, persists.)_

4. **`QUAD_BATCH_DELETED_ID` is contract-only.** Charter Decision #1 blessed this sentinel as a user-facing API ("APIs exist for users, not just internal consumption"). The constant is exported from `quadBatch.ts` and `contract.ts` but is absent from `index.ts` (the public lane). A user importing from `@flighthq/quadbatch` (or `@flighthq/sdk`) cannot access it without reaching into `./contract`. _(New since prior review -- the split introduced the lane without placing the sentinel.)_

5. **Tile flip/rotate flags -- blessed, unexecuted, now confirmed dropping data.** Charter Decision #5 blessed widening `TilemapData.tiles` to `Int32Array` plus `TilemapTileFlags`/`packTilemapTileId`/`getTilemapTileBaseId`. `tiles` is still `Int16Array` (`types/src/Tilemap.ts:11`, `tilemap/src/tilemap.ts:66`). `tilemap-formats/src/tiledProject.ts:17` explicitly documents: "NOT carried into the grid: TilemapData has no per-tile flip slot." The `decodeTiledGid` function correctly extracts flip bits, but `buildTilemapLayersFromTiled` discards them. _(Prior review Gap 1, persists.)_

6. **No `getTilemapTiles` blit-out counterpart.** `setTilemapTiles` blits in; there is no bulk read. _(Prior review Gap 4, persists.)_

7. **No `appendQuadBatchInstanceMatrix`.** A matrix3x2 batch cannot be appended to without manual `resizeQuadBatch` + `setQuadBatchInstanceMatrix`. The vector2 path has `appendQuadBatchInstance` with auto-grow and signal emission. _(Prior review Gap 5, persists.)_

8. **Signal-emission asymmetries remain unrecorded.** `fillTilemapTiles` and `resizeTilemap` do not emit signals. `setQuadBatchInstance`/`setQuadBatchInstanceMatrix`/`setQuadBatchInstanceRange` do not emit. These may be deliberate for hot paths, but the asymmetry is not recorded as a decision. _(Prior review Gap 6, persists.)_

9. **Sprite lost its atlas-facing API surface.** The prior review recorded 13 Sprite exports including `getSpriteOrigin`, `getSpriteRegion`, `setSpriteFrame`, `setSpriteFrameRect`, and the `enableSpriteSignals`/`getSpriteSignals`/`createSpriteSignals` trio. All are absent from the codebase. Sprite is now 8 exports (3 public), a minimal texture-node wrapper. Whether this is a narrowing (features moved to spritesheet/textureatlas) or a loss is not recorded anywhere.

10. **Phantom dependency.** `packages/tilemap/package.json` declares `"@flighthq/quadbatch": "*"` in dependencies, but no file under `packages/tilemap/src/` imports from `@flighthq/quadbatch`. This is dead weight that inflates the install graph.

11. **Charter open directions still open.** Tilemap capacity symmetry, bounds caching/dirty slot, edge-case hardening (NaN, negative reserve, id past atlas.regions), pooling brackets, Rust `flighthq-sprite` conformance -- all unchanged since the prior review.

## Charter contradictions

The charter is stale in identity and scope:

- **Four-quartet identity for a non-existent package.** "What it is" describes Sprite, QuadBatch, Tilemap, and ParticleEmitter as four quartets of `@flighthq/sprite`. The package was absorbed; each quartet lives in its own package. The charter's North star #2 ("four symmetric quartets") and Boundary scope ("the four node-data quartets") describe an entity that no longer exists.
- **Decision #2 (ParticleEmitter signals absent) governs a different package.** The emitter quartet moved to `@flighthq/particleemitter`, which has its own cell. The decision still reads as a sprite-cell ruling.
- **Decision #1 blessed a user-facing constant that is contract-only.** `QUAD_BATCH_DELETED_ID` is in `quadBatch.ts` and `contract.ts` but not in `index.ts` (Gap 4).
- **Decision #5 (Int32Array widening) remains unexecuted.** The tiles field is still `Int16Array` in both `@flighthq/types` and `@flighthq/tilemap` (Gap 5).
- **Sprite's API contracted well beyond what the charter described.** The charter listed "frame selection, region lookup, pivot-anchored origin" as in-scope Sprite capabilities. All are gone (Gap 9). No decision or status entry records why.

No code-vs-charter contradiction where the code does something the charter forbids -- the contradictions are all identity/scope staleness and unexecuted decisions.

## Contract & docs fit

**Split packages to contract: adequate with defects.** All three packages have the two-lane barrel structure, `sideEffects: false`, alphabetized exports, types in `@flighthq/types`, and dependencies declared. Specific residue: `out.x`/`out.y` never written in Sprite bounds (Gap 1); QuadBatch default bounds leaves `out` untouched (Gap 2); `compactQuadBatch` doc contradicts its body (Gap 3); `QUAD_BATCH_DELETED_ID` lane misplacement (Gap 4); phantom `@flighthq/quadbatch` dependency in tilemap (Gap 10).

**Docs to package: needs refresh.** The charter describes a package that no longer exists. Status.md (2026-08-08) correctly explains the absorption and names where each quartet landed, but the charter itself was never rewritten. A fresh reader arriving at `agents/packages/sprite/charter.md` will read about a four-quartet `@flighthq/sprite` package and look for `packages/sprite/` that is not there. The assessment.md (2026-07-13) correctly noted this should be a direction session, not a sweep.

## Candidate open directions

1. **Charter refresh.** Rewrite the charter to reflect the absorbed identity: either retire the cell entirely and migrate its decision ledger to the split-package cells, or rewrite it as a coordination cell that tracks cross-cutting decisions (like the Int32Array widening) that span the split packages. The current state -- a charter for a non-existent package whose decisions apply to other packages' code -- is confusing.

2. **Sprite API surface question.** Was the loss of frame selection, region lookup, pivot-anchored origin, and signals a deliberate simplification (Sprite is now just "textured rectangle," and atlas-based selection moved to `@flighthq/spritesheet`), or an incomplete split? A decision should be recorded either way.

3. **`QUAD_BATCH_DELETED_ID` lane placement.** Add it to `quadbatch/src/index.ts` to match Decision #1's user-facing intent, or record a decision that the mark-then-compact workflow is contract-level only.

4. **Phantom tilemap -> quadbatch dependency.** Remove `@flighthq/quadbatch` from `packages/tilemap/package.json` if no import exists.

5. **Int32Array widening coordination.** This is the top cross-package backlog item (charter Decision #5). It touches `@flighthq/types`, `@flighthq/tilemap`, and the renderers. `tilemap-formats` now actively drops flip bits for want of it. Needs a coordinated dispatch, not a per-cell sweep.

6. **Signal-emission policy.** A recorded ruling ("append/remove/clear/blit emit; per-instance sets never do") would make the current asymmetry deliberate rather than accidental.
