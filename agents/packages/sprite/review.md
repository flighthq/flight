---
package: '@flighthq/sprite'
status: solid
score: 78
updated: 2026-07-13
ingested:
  - charter.md
  - status.md (2026-06-24 entry, now heavily stale)
  - prior review.md (2026-06-25 merge-gate) and assessment.md
  - source (packages/sprite/src/{index,sprite,quadBatch,tilemap}.ts + colocated tests)
  - packages/sprite/package.json
  - consumers: bitmaptext, tilemap-formats (tiledGid/tiledProject), displayobject-gl/wgpu velocity, particleemitter (independence check)
  - packages/types/src/{QuadBatch,Tilemap,QuadBatchSignals,SpriteSignals,TilemapSignals}.ts
---

# sprite — Review

> Full re-survey of the live tree. The prior review (2026-06-25) was a merge-gate review of the integration delta, not a standalone survey; its two blockers (B1: `*Signals` types missing from `@flighthq/types`; B2: undeclared `@flighthq/signals` dependency) are both **fixed** in the live tree. Since then, commit `b62d9808` extracted the entire ParticleEmitter quartet into `@flighthq/particleemitter` — sprite is now a **three**-quartet package.

## Verdict

**solid — 78/100.** A clean, well-tested, fully header-disciplined node-data layer: three symmetric quartets (Sprite, QuadBatch, Tilemap) of side-effect-free free functions, all 63 exports with colocated alphabetized tests, all prior merge blockers and all three Approved items landed. What holds it below 85: the blessed Int32Array/tile-flags decision is unexecuted while `tilemap-formats` now demonstrably drops Tiled flip bits against it, two out-param hygiene defects in the bounds path, and a stale self-contradicting doc comment on `compactQuadBatch`.

## Present capabilities

- **Sprite** (`sprite.ts`, 13 exports): quartet (`createSprite`/`createSpriteData`/`createSpriteRuntime`/`SpriteKind`), `cloneSprite`, frame selection (`setSpriteFrame`, `setSpriteFrameRect`), region lookup (`getSpriteRegion`), pivot-anchored origin (`getSpriteOrigin`), pivot-honoring `computeSpriteLocalBoundsRectangle` (wired as the runtime default bounds method), opt-in signals (`enableSpriteSignals`/`getSpriteSignals`/`createSpriteSignals`, `onFrameChanged`).
- **QuadBatch** (`quadBatch.ts`, 29 exports + `QUAD_BATCH_DELETED_ID`): capacity (`reserveQuadBatch`/`resizeQuadBatch`/`getQuadBatchCapacity` via geometry's `reserve*Array`), per-instance accessors/mutators (`appendQuadBatchInstance`, `setQuadBatchInstance`, `setQuadBatchInstanceMatrix`, `setQuadBatchInstanceRange`, `getQuadBatchInstanceId`, `getQuadBatchInstanceTransform` into a `Vector2Like`), O(1) swap-remove (`removeQuadBatchInstance`, emits `(index, swapSource)`), `clearQuadBatch`, order-restoring `compactQuadBatch` filtering the blessed `QUAD_BATCH_DELETED_ID = 0xffff` sentinel (maintains `materialData` alongside), allocation-free `iterateQuadBatchInstances` (subarray views), both-direction alias-safe `setQuadBatchTransformType` re-stride (expand fills in reverse; collapse `dst < src`), AABB (`hitTestQuadBatchPoint[XY]`) and exact point-in-quad (`hitTestQuadBatchPointExact[XY]` via `crossSign` winding) hit tests, `computeQuadBatchLocalBoundsRectangle` for both strides, user-set bounds override (`setQuadBatchLocalBoundsRectangle` + runtime `localBoundsRectangle`), a `instanceVelocities` runtime slot consumed by `displayobject-gl/wgpu` velocity writers, signals (`onInstanceAppended`/`onInstanceRemoved`/`onCleared`). Stride constants keep `i*2`/`i*6` out of callers.
- **Tilemap** (`tilemap.ts`, 21 exports): quartet + `cloneTilemap`, grid ops (`getTilemapTile`/`setTilemapTile`/`fillTilemapTiles`/`clearTilemap`), clipped row-major blit `setTilemapTiles`, content-preserving `resizeTilemap`, full navigation (`getTilemapColumnAtX`, `getTilemapRowAtY`, `getTilemapColumnRowAtPoint` into `Vector2Like`, `getTilemapTileAtPoint[XY]`, `getTilemapTileRect`), grid×tileset bounds, signals (`onTileChanged`/`onTilesChanged`/`onCleared`).
- **Hygiene:** thin 3-line barrel; `sideEffects: false`; all five deps declared (signals included); all cross-package types in `@flighthq/types` including the three `*Signals` interfaces; sentinels (`-1`/`false`/no-op) throughout; signals zero-cost until enabled via `Symbol`-keyed slots; per-instance `materialData` (adjustments fold target) carried through clone/remove/compact on QuadBatch and Tilemap.
- **Tests:** 63 `describe` blocks exactly mirroring the 63 exports across three colocated test files (~1,750 loc); every export covered.

## Gaps

Vs a mature sprite/tilemap/quad-batch atlas-rendering library:

1. **Tile flip/rotate flags — blessed, unexecuted, now under live pressure.** Charter Decision #5 (2026-07-02) blessed widening `TilemapData.tiles` to `Int32Array` plus `TilemapTileFlags`/`packTilemapTileId`/`getTilemapTileBaseId`. `tiles` is still `Int16Array` (`types/src/Tilemap.ts:9`), and `tilemap-formats` now ships a Tiled importer that decodes flip bits (`tiledGid.ts`) and then **drops them** — `tiledProject.ts:16`: "NOT carried into the grid: `TilemapData` has no per-tile flip slot." The consumer that Decision #5 anticipated exists; the header change does not.
2. **Out-param hygiene in the bounds path.** `computeSpriteLocalBoundsRectangle` on the `data.rect` path writes only `width`/`height` — `out.x`/`out.y` keep stale caller values, and `rect.x`/`rect.y` are ignored; the no-atlas/no-region path writes nothing at all. QuadBatch's default bounds method (`copyLocalBoundsRectangle`) likewise silently leaves `out` untouched when `runtime.localBoundsRectangle` is null. Both violate "sentinel or fully-written out"; QuadBatch's compute function zeroes correctly, showing the intended pattern.
3. **Stale, self-contradicting `compactQuadBatch` doc comment.** The body filters `QUAD_BATCH_DELETED_ID` per Decision #1, but the comment still claims "this function does NOT filter by id," references an `id==-1` sentinel and "callers zero-out ids," and calls itself "a no-op for the common case." The blessed workflow and its own documentation disagree.
4. **Bulk-read asymmetry.** `setTilemapTiles` blits in; there is no `getTilemapTiles` blit out (needed by editors/serializers; `tilemap-formats` builds grids by hand).
5. **No matrix append.** `appendQuadBatchInstance` is vector2-only; `setQuadBatchInstanceMatrix` exists but a matrix3x2 batch cannot be appended to without manual `resizeQuadBatch` + set (flagged in the 2026-06-24 status, never landed).
6. **Signal-emission asymmetries.** `clearTilemap` emits but `fillTilemapTiles` and `resizeTilemap` do not; `setQuadBatchInstance`/`setQuadBatchInstanceMatrix`/`setQuadBatchInstanceRange` and `setSpriteFrameRect` emit nothing (plausibly deliberate for hot paths, but unrecorded — only ParticleEmitter's absence was blessed, and that quartet has left the package).
7. **Linear region scans in sprite hot paths.** `getSpriteRegion` and `computeSpriteLocalBoundsRectangle` do `atlas.regions.find(...)` per call (allocating a closure); `@flighthq/textureatlas` owns region-lookup queries this could delegate to.
8. **No diagnostics layer.** Decision #3 blessed documented-precondition-only for the vector2-only mutators; per the diagnostics inversion rule the doc-comment warning is a candidate for a shakeable `enableQuadBatchGuards`, which Decision #3 does not preclude (it rejected a hot-loop runtime check, not an opt-in guard).
9. Charter Open directions still open: tilemap capacity symmetry, bounds caching/dirty slot, edge-case hardening (NaN transforms, negative `reserve*`, id past `atlas.regions`), pooling brackets, Rust `flighthq-sprite` catch-up.

**Structural fork A note:** the fork's live case — particles' sim reaching into sprite via `reserveParticleEmitter` — is **resolved** by the `b62d9808` extraction: `reserveParticleEmitter` and the whole emitter node now live in `@flighthq/particleemitter`, which does not depend on sprite at all. Sprite's remaining cross-package participation is healthy: `bitmaptext` composes QuadBatch (`createQuadBatch`/`reserveQuadBatch`/`appendQuadBatchInstance`/`clearQuadBatch`), and the backend renderers read `QuadBatchRuntime.instanceVelocities`.

## Charter contradictions

No code-vs-charter contradictions — but the **charter itself is now stale in identity**: "What it is" describes **four** quartets including ParticleEmitter, Decision #2 rules on ParticleEmitter signals, and North star #2 cites emitter asymmetries; that quartet moved to `@flighthq/particleemitter`. The code did not violate the charter (the extraction is the fork-A resolution and the Package Map already reflects it); the charter needs a direction-session refresh to the three-quartet identity. Decision #5 is blessed-but-unexecuted (Gap 1), and Decision #1's blessed sentinel landed but its function comment contradicts it (Gap 3). Decisions #3 and #4 are honored.

## Contract & docs fit

**Package → contract: strong.** Types-first (the three `*Signals` interfaces now live in `@flighthq/types` — prior B1 fixed); manifest declares all imports (prior B2 fixed); single root `.` export over a thin barrel; `sideEffects: false`; full unabbreviated names with correct verbs throughout; sentinels-not-throws; `Readonly<>` on inputs; alphabetized exports mirrored by tests; `exports:check`-clean. Residue: the out-param hygiene defects (Gap 2) and the rotted comment (Gap 3). Rust `flighthq-sprite` mirror remains behind the TS surface (charter Open direction #5).

**Docs → package: candidate revisions.**
- `agents/index.md` Package Map's sprite line ("sprite/tilemap/quad-batch for atlas rendering") is accurate post-extraction; no change needed there.
- `agents/packages/sprite/charter.md` — stale four-quartet identity (above); ParticleEmitter prose/decisions should be marked superseded-by-extraction or migrated to the `particleemitter` cell.
- `agents/packages/sprite/status.md` (2026-06-24) — describes `particleEmitter.ts` functions as living in this package; historically true, now misleading to a fresh reader.
- `agents/render-backend-support.md` item 10 reports region `pivotX`/`pivotY` "stored but never read by the sprite renderers" — sprite's bounds/origin now consume pivots, so the render-side half of that audit item is worth re-verifying.

## Candidate open directions

1. **QuadBatch default-bounds posture.** `computeQuadBatchLocalBoundsRectangle` exists but is *not* wired as the runtime default (the default copies a user-set override or does nothing). Is "bounds are explicit — compute-and-set, never implicit per-frame scans over thousands of instances" the intended posture? If yes, record it (and zero the out on null); if no, wire the compute.
2. **Mutation-signal completeness.** Which mutators emit is currently ad hoc (Gap 6). A ruling — "append/remove/clear/blit emit; per-instance sets never do" — would make the asymmetry deliberate.
3. **Region lookup delegation.** Should sprite depend on `@flighthq/textureatlas` for id→region queries (Gap 7), or keep the dependency floor at `types` and accept the linear scan?
4. **ParticleEmitter decision migration.** Decide where the emitter-era charter Decisions (#2) and prose live now that the quartet is `particleemitter`'s.
