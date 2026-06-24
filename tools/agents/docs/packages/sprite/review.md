---
package: '@flighthq/sprite'
status: solid
score: 80
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/sprite.md
  - reviews/maturation/depth/sprite.md
  - source
  - changes.patch
---

# sprite — Review

> Survey layer. Evidence is the incoming bundle `builder-67dc46d64` (`incoming/builder-67dc46d64/head/packages/sprite/`, `changes.patch`), judged against the charter (a seeded stub — North star / Boundaries / Decisions all `TODO`) with fallback to the codebase-map AAA standard and the prior depth + maturation reviews.

## Verdict

**solid — 80/100.** The package is now a genuinely full atlas-batch buffer library: the four entity quartets (`Sprite`, `QuadBatch`, `Tilemap`, `ParticleEmitter`) each carry per-instance accessors/mutators, append/remove/clear, `clone*`, capacity management, bounds, hit testing, an opt-in signals group, and — for `QuadBatch` and `Tilemap` — navigation and range/iterate/compact ops. The realized head is well past the "Bronze-only" state its own status doc reports: it contains most of the depth review's Silver and parts of Gold. The score is held below "authoritative" by one concrete, load-bearing defect — **roughly 26 of the newly-added exports have no colocated test** (the status doc's "every new export is tested / `exports:check` clean" claim is false against the realized source) — plus a few correctness edges in the most advanced functions and the still-stub charter.

## Status-doc verification (AS-CLAIMED vs. realized head)

The distributed worker report describes a **Bronze** session (per-instance accessors, append/ remove/clear, sprite frame ergonomics, tilemap bulk write) and lists Silver/Gold items as **deferred**. The realized source contradicts this in both directions:

- **Under-reported (present but claimed deferred):** `cloneSprite`/`cloneQuadBatch`/`cloneTilemap`/ `cloneParticleEmitter` (Silver "clone\* for every kind"); `enable*Signals` + `*Signals` types in `@flighthq/types` for all of Sprite/QuadBatch/Tilemap (Silver "signals group"); `hitTestQuadBatchPointExact`/`…XY` (Silver "exact-polygon hit test"); `setQuadBatchTransformType` (Silver "transform-type switch"); tilemap navigation `getTilemapColumnAtX`/`getTilemapRowAtY`/ `getTilemapColumnRowAtPoint`/`getTilemapTileAtPoint`/`…XY`/`getTilemapTileRect` (Silver "tilemap navigation"); and `iterateQuadBatchInstances`/`setQuadBatchInstanceRange`/`compactQuadBatch`/ `compactParticleEmitter` (Gold "sub-batch / range ops"). The worker shipped a much larger surface than it documented.
- **Overstated:** "All 150 tests pass… Every new exported function has at least one test. `exports:check` reports no uncovered exports." This is the central inaccuracy — see Gaps. The test `describe` blocks and a name-grep both show the entire under-reported wave is **untested**.

So the status doc is reliable for the Bronze functions it describes and **stale/inaccurate** for the second wave the same diff actually landed. Treat its "Deferred items" section as obsolete (most of Silver is already in source) and its test claim as not-verified-and-false.

## Present capabilities (grounded in source)

**Sprite** (`sprite.ts`) — quartet; `cloneSprite`; `setSpriteFrame`/`setSpriteFrameRect`; `getSpriteRegion` (replaces the inline `regions.find`); `getSpriteOrigin` (pivot-anchored origin); `computeSpriteLocalBoundsRectangle` now consumes region `pivotX`/`pivotY` (with a `-0` guard); `enableSpriteSignals`/`getSpriteSignals`/`createSpriteSignals` (`onFrameChanged`, fired by `setSpriteFrame`).

**QuadBatch** (`quadBatch.ts`) — quartet; capacity (`getQuadBatchCapacity`, `reserveQuadBatch`, `resizeQuadBatch`, `getQuadTransformStride`); per-instance `setQuadBatchInstance`/ `setQuadBatchInstanceMatrix`/`getQuadBatchInstanceId`/`getQuadBatchInstanceTransform`; `appendQuadBatchInstance`/`removeQuadBatchInstance` (O(1) swap-remove)/`clearQuadBatch`; `cloneQuadBatch`; bounds (`computeQuadBatchLocalBoundsRectangle`, vector2 + matrix3x2 corner union) and `setQuadBatchLocalBoundsRectangle` (now a single cast — the depth review's double-cast nit is fixed); hit testing `hitTestQuadBatchPoint`/`…XY` (AABB-of-transformed-quad, now documented as such) and `hitTestQuadBatchPointExact`/`…XY` (cross-product point-in-quad); range/visitor/compaction `iterateQuadBatchInstances` (allocation-free `subarray` view), `setQuadBatchInstanceRange`, `compactQuadBatch`; `setQuadBatchTransformType` (re-strides vector2↔matrix3x2 in place); signals (`onInstanceAppended`/`onInstanceRemoved`/`onCleared`, fired by the mutators). The `QUAD_VECTOR2_STRIDE`/`QUAD_MATRIX3X2_STRIDE` named constants replace the `i*2`/`i*6` magic numbers the depth review flagged.

**Tilemap** (`tilemap.ts`) — quartet; `getTilemapTile`/`setTilemapTile`, `fillTilemapTiles`, `clearTilemap`, `setTilemapTiles` (clipped sub-grid blit); `cloneTilemap`; `resizeTilemap` (content-preserving); navigation `getTilemapColumnAtX`/`getTilemapRowAtY`/`getTilemapColumnRowAtPoint`/ `getTilemapTileAtPoint`/`…XY`/`getTilemapTileRect`; bounds from tileset×grid; signals (`onTileChanged`/`onTilesChanged`/`onCleared`).

**ParticleEmitter** (`particleEmitter.ts`) — quartet; capacity (`getParticleEmitterCapacity`, `reserveParticleEmitter`); per-particle `setParticleEmitterParticle` + color/alpha/velocity setters, `getParticleEmitterParticle{Id,Alpha,Velocity}`; `appendParticleEmitterParticle` (defaults alpha=1/white/zero-velocity)/`removeParticleEmitterParticle` (full-buffer swap-remove)/ `clearParticleEmitter`; `cloneParticleEmitter`; `compactParticleEmitter`; rotate+scale corner-union bounds. Internal stride constants (`PARTICLE_TRANSFORM_STRIDE=4`/`_COLOR_=3`/`_VELOCITY_=2`) document the SoA layout. No signals group here (intentional asymmetry — see Open directions).

Cross-cutting: every kind registers against a `*Kind` string in `@flighthq/types`; renderers and interaction live in their backend/interaction packages; the package is value-typed, root-barrel-only, `"sideEffects": false`. The depth review's three "missing-by-design" splits (simulation → `particles`, atlas/tileset → `resources`, animation → `spritesheet`/`timeline`) are preserved — no scope creep.

## Gaps

1. **Untested second wave (highest-value finding).** ~26 newly-added exports have **no colocated test** and zero references in any `*.test.ts`: `cloneSprite`, `enableSpriteSignals`, `getSpriteSignals`, `createSpriteSignals`; `cloneQuadBatch`, `compactQuadBatch`, `enableQuadBatchSignals`, `getQuadBatchSignals`, `createQuadBatchSignals`, `hitTestQuadBatchPointExact`/`…XY`, `iterateQuadBatchInstances`, `setQuadBatchInstanceRange`, `setQuadBatchTransformType`; `cloneParticleEmitter`, `compactParticleEmitter`; `cloneTilemap`, `enableTilemapSignals`, `getTilemapSignals`, `createTilemapSignals`, `getTilemapColumnAtX`, `getTilemapRowAtY`, `getTilemapColumnRowAtPoint`, `getTilemapTileAtPoint`/`…XY`, `getTilemapTileRect`. `npm run exports:check` would fail on these, and `npm run order` would likely also flag the new test files (the new functions are absent from the `describe` set, so the existing blocks no longer mirror the source export list). This is unfinished work, not a design choice.

2. **`compactQuadBatch` / `compactParticleEmitter` semantics are confused.** Both are documented as "remove swap-remove holes / restore stable order," but the bodies actually filter on a hard-coded `0xffff` (`Uint16Array` max) id sentinel — a _caller convention the rest of the package never establishes_. `removeQuadBatchInstance`/`removeParticleEmitterParticle` swap-remove and decrement the count; they never write `0xffff`. So `compact*` is a no-op for the documented use case and only does anything for a deletion protocol that does not exist in this package. The doc comment in `compactQuadBatch` even argues with itself ("this is a no-op for the common case"). Either the sentinel-deletion model needs to be a real, named part of the API (a `markQuadBatchInstanceDeleted` seam) or these functions should be redesigned/removed. As shipped they are dead-ish code with misleading docs.

3. **`setQuadBatchTransformType` expand path can lose data / mis-size.** The vector2→matrix3x2 branch allocates `Math.max(transforms.length/2, count) * 6` and fills `[0,count)` in reverse — fine for the live range, but it silently drops any reserved-but-unused vector2 capacity beyond `count`, and the `getQuadBatchCapacity` it leaves behind is derived purely from the new buffer length. It is not alias-unsafe (new buffer), but the capacity bookkeeping after a switch is untested and not obviously correct. The collapse path mutates in place with `dst < src` (safe). Needs tests pinning capacity and round-trip behavior.

4. **`appendQuadBatchInstance` is vector2-layout-only with no guard.** It writes `index*2` regardless of `transformType`; on a `matrix3x2` batch it corrupts the stride. The depth review noted the vector2-only append as intentional, but there is no `transformType === 'vector2'` guard or documented precondition, so a matrix3x2 caller gets silent corruption rather than a sentinel/no-op. (Same shape: `setQuadBatchInstance` documents the vector2 precondition but does not enforce it.)

5. **Tile flip/rotate flags still absent.** No `TilemapTileFlags`/`packTilemapTileId`/ `getTilemapTileFlags`/`getTilemapTileBaseId`; the `Int16Array`-vs-`Int32Array` bit-budget decision the maturation roadmap flagged is unmade. This is the one genuinely cross-package Silver item not yet landed (it touches `@flighthq/types` + renderers). Tilemap navigation now exists, but returns raw cell values with no flag vocabulary.

6. **Edge-case hardening (Gold) untouched.** No defined behavior for NaN transforms in bounds/hit tests, negative/oversized `reserve*` capacity, region-id past `atlas.regions` (the loops `continue`, which is reasonable but untested), or empty-atlas-with-nonzero-count. No bounds-cache/dirty invalidation slot — `compute*LocalBoundsRectangle` recomputes every call.

7. **No pooling brackets** (`acquire*Instance`/`release*Instance`) and **no `tilemap-formats` neighbor** — both correctly parked as profiling-gated / cross-package in the roadmap.

## Charter contradictions

None in the strict sense — the charter's North star, Boundaries, and Decisions are all `TODO`, so there is no stated principle to contradict. The seeded "What it is" line (atlas-batch GPU node family, data buffers only, simulation/atlas/animation housed elsewhere) is **upheld** by the code: no simulation, no atlas construction, no animation leaked in. The only soft tension is with the _codebase-map_ standard, not the charter: the AAA "every exported function has a colocated test" rule and the `exports:check`/`order` checkpoints are violated by Gap 1.

## Contract & docs fit

**Package living up to the contract:**

- **Types-first:** the new `SpriteSignals`/`QuadBatchSignals`/`TilemapSignals` interfaces are defined in `@flighthq/types` (`head/packages/types/src/*Signals.ts`, exported from the barrel), not inline — correct header-layer discipline.
- **Naming / verbs:** full unabbreviated type words throughout; correct `create*`/`get*`/`set*`/ `append*`/`remove*`/`clear*`/`clone*`/`reserve*`/`resize*`/`compute*`/`hitTest*`/`enable*` verbs; `enable*Signals` follows the opt-in signals convention with a `Symbol`-keyed runtime slot and zero cost until enabled.
- **out-params / sentinels:** bounds and navigation functions write `out`; readers return `-1`/`false` sentinels on out-of-range; mutators no-op on out-of-range — matches "sentinel, not throw." Out-param bounds functions read inputs into locals before writing.
- **Single root export, `sideEffects:false`:** `index.ts` is a thin 4-file barrel; manifest exposes only `.`. Good.
- **`Readonly<T>`:** `source`/`point`/`rect` params are `Readonly`; `target`/`out` are mutable. One small leak: `getQuadBatchInstanceTransform`/`getTilemapColumnRowAtPoint`/ `getParticleEmitterParticleVelocity` take an inline `{ x: number; y: number }` rather than `Vector2Like` (the status doc flags this as intentional for narrow out-params — defensible, but it is a third spelling of the same shape and worth a convention ruling).
- **Rust mirror:** `crate: flighthq-sprite`; the buffer math is deterministic value-typed leaf code and an excellent conformance target — but the Rust side is not in this bundle, so parity is unverified and the matured surface has drifted ahead of any port.

**Candidate doc revisions (user-gated):**

- The codebase-map **Package Map** line for `@flighthq/sprite` ("sprite/tilemap/quad-batch graph for atlas-based batch rendering") omits `ParticleEmitter` entirely; the package owns a fourth node kind. Worth updating the one-liner.
- `reviews/depth/sprite.md` and `reviews/maturation/depth/sprite.md` are now superseded by this file (their "no per-quad helpers / no clone / no signals / no navigation" gaps are all closed) and per `index.md` should migrate here and be removed.
- The distributed `status.md` entry should be corrected on its next merge: its test claim is false and its "Deferred (Silver)" list is mostly already-landed.

## Candidate open directions

These are questions the stub charter does not answer that this review had to assume — each is a candidate for the charter's North star / Boundaries / Open directions:

1. **Is the `0xffff` sentinel-deletion model part of the API or not?** `compact*` presumes it but nothing produces it. Either bless a named "mark-deleted then compact" workflow or drop the compact functions. (Borders structural-fork A: source-data vs. graph participation — who owns the deletion/lifetime convention, `sprite` or `particles`?)
2. **Signals-group symmetry.** Sprite/QuadBatch/Tilemap got signals; `ParticleEmitter` did not. Is the emitter intentionally signal-free (its writer is `@flighthq/particles`, which may not want per-particle dispatch), or is this an omission? Settle the rule.
3. **`transformType` enforcement policy.** Should vector2-only mutators (`append`/`set`) hard-guard the transform type (no-op/sentinel) or stay documented-precondition-only? This is the package's main silent-corruption surface.
4. **Tile flip/rotate flag bit budget** (`Int16Array` → `Int32Array`): the one open header-layer decision blocking Tiled-class tilemaps. Cross-package (`@flighthq/types` + renderers) — surface to the user, do not assume.
5. **Tilemap capacity symmetry** (the depth review's standing question): `reserveTilemap`/ `getTilemapCapacity` to match QuadBatch/ParticleEmitter, or a recorded decision that grids diverge. Still unresolved in source.
6. **The narrow out-param type** (`{ x: number; y: number }` vs `Vector2Like`): a one-line SDK-wide convention would remove the third spelling.
7. **Where does bounds caching live?** A dirty/invalidation slot is a per-package perf decision that borders the render update pipeline (structural-fork C) — confirm it belongs here before building it.
