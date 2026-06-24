---
package: '@flighthq/sprite'
updated: 2026-06-24
basedOn: ./review.md
---

# sprite — Assessment

> Recommendation layer. Sorts the gaps in [review.md](./review.md) and the absorbed Bronze/Silver/Gold roadmap (`reviews/maturation/depth/sprite.md`) into sweep-safe **Recommended** and parked **Backlog**, applying the SDK-wide [structural forks](../structural-forks.md). Design forks and cross-package items are routed to the charter's Open directions (listed at the end), not into Recommended. **Approved** is empty until the user's verbal gate.
>
> The depth/maturation roadmap is now absorbed here; per [index.md](../index.md) it should be removed once this lands.

## Recommended

Sweep-safe: within `@flighthq/sprite`, no cross-package coupling, no breaking change, no open design decision. Safe under a blanket "do all recommended."

1. **Cover the untested second wave (review Gap 1 — highest value).** Add a colocated `*.test.ts` case for each of the ~26 newly-landed exports that currently have none: `cloneSprite`, `enableSpriteSignals`, `getSpriteSignals`, `createSpriteSignals`; `cloneQuadBatch`, `compactQuadBatch`, `enableQuadBatchSignals`, `getQuadBatchSignals`, `createQuadBatchSignals`, `hitTestQuadBatchPointExact`/`…XY`, `iterateQuadBatchInstances`, `setQuadBatchInstanceRange`, `setQuadBatchTransformType`; `cloneParticleEmitter`, `compactParticleEmitter`; `cloneTilemap`, `enableTilemapSignals`, `getTilemapSignals`, `createTilemapSignals`, `getTilemapColumnAtX`, `getTilemapRowAtY`, `getTilemapColumnRowAtPoint`, `getTilemapTileAtPoint`/`…XY`, `getTilemapTileRect`. This is unfinished work, not a design choice; `npm run exports:check` would currently fail. Pure within-package.

2. **Restore test order-mirror (review Gap 1).** Add the new functions' `describe` blocks so each test file's blocks mirror its source export list, then run `npm run order:fix`. Lands with item 1; `npm run order` would otherwise flag the new files.

3. **Pin `setQuadBatchTransformType` capacity + round-trip behavior with tests (review Gap 3).** The expand path (`vector2 → matrix3x2`) silently drops reserved-but-unused vector2 capacity beyond `count`, and the post-switch `getQuadBatchCapacity` is untested. Add tests asserting capacity and a `vector2 → matrix3x2 → vector2` round trip over both the live range and reserved tail. This is characterization only — it pins current behavior and exposes any mis-size without changing the API. (Whether the expand path _should_ preserve reserved capacity is a correctness edge; if the test reveals data loss the fix is in-package and non-breaking. The broader transform-type **enforcement policy** is an Open direction — see below.)

4. **Pin existing sentinel/out-of-range behavior with tests (subset of review Gap 6).** Add tests for the behaviors the package _already_ implements as sentinels — region-id past `atlas.regions` (the loops `continue`), out-of-range reader → `-1`/`false`, out-of-range mutator → no-op — so the shipped contract is locked. This does **not** define new behavior for the undecided cases (NaN transforms, negative/oversized `reserve*`); those need a ruling and are parked. Within-package, no design decision.

5. **Fix the codebase-map Package Map one-liner for `@flighthq/sprite`.** The line ("sprite/tilemap/ quad-batch graph for atlas-based batch rendering") omits `ParticleEmitter`, a fourth owned node kind. A one-line doc correction in `tools/agents/docs/index.md`, no source change. (Doc-only and self-contained; included here because it is a factual fix, not a direction call.)

## Backlog

Parked: needs a design decision, crosses a package boundary, is profiling-gated, or is larger scope. Each carries its reason.

- **`compact*` sentinel-deletion semantics (review Gap 2).** `compactQuadBatch`/ `compactParticleEmitter` filter on a hard-coded `0xffff` id sentinel that nothing in the package ever writes — dead-ish code with self-contradicting docs. **Parked: open design decision** — either bless a named "mark-deleted then compact" workflow (`markQuadBatchInstanceDeleted` seam) or remove the functions. Borders structural-fork A (who owns the deletion/lifetime convention, `sprite` or `particles`). Routed to Open directions.

- **`transformType` enforcement policy (review Gap 4, and the API question behind Gap 3).** `appendQuadBatchInstance`/`setQuadBatchInstance` write the vector2 stride with no guard, silently corrupting a `matrix3x2` batch. **Parked: open design decision** — hard-guard (no-op/sentinel) vs. documented-precondition-only is the package's main silent-corruption surface and must be settled, not assumed. Routed to Open directions.

- **Tile flip/rotate flags (review Gap 5; roadmap Silver).** `TilemapTileFlags` + `packTilemapTileId`/`getTilemapTileFlags`/`getTilemapTileBaseId`. **Parked: cross-package + open header decision** — adds constants to `@flighthq/types`, requires renderers to read the flags, and hinges on the `Int16Array → Int32Array` bit-budget ruling. Gates Tiled-class tilemaps. Routed to Open directions.

- **Undecided edge-case behavior (remainder of review Gap 6; roadmap Gold).** Defining behavior for NaN transforms in bounds/hit tests, negative/oversized `reserve*`, and empty-atlas-with-nonzero- count. **Parked: needs a ruling** on each (sentinel vs. throw vs. clamp) before tests can encode it — see the SDK sentinel-vs-misuse rule. The _characterization_ subset is Recommended (item 4); the _new-behavior_ definitions wait on the rulings.

- **Bounds-cache / dirty-invalidation slot (review Gap 6/7; Open #7).** `compute*LocalBoundsRectangle` recomputes every call. **Parked: per-package perf decision that borders the render update pipeline (structural-fork C)** — confirm it belongs here before building. Routed to Open directions.

- **Pooling brackets (`acquire*Instance`/`release*Instance`) (review Gap 7; roadmap Gold).** Free-list of instance slots. **Parked: profiling-gated** — only build if per-frame instance churn justifies it (SDK `acquire*`/`release*` convention requires the cost be earned).

- **`tilemap-formats` neighbor (roadmap Gold).** Tiled `.tmx`/`.tjx` import → `Tilemap` + `Tileset`. **Parked: cross-package + bedrock test** — borders `@flighthq/resources` (tileset construction) and must clear the triad plurality guard and the bedrock test before it is a real cell. A candidate for the register, not in-package work. Routed to Open directions.

- **Tilemap chunking (`TilemapChunk`) (roadmap Gold).** Sparse/chunked store for very large/infinite maps. **Parked: architectural design decision** (in-package variant vs. `tilemap-chunked` neighbor; dense-vs-sparse storage model). Surface, do not assume.

- **Tilemap capacity symmetry (review Open #5; roadmap Silver).** `reserveTilemap`/`getTilemapCapacity` to match QuadBatch/ParticleEmitter, **or** a recorded decision that grids intentionally diverge. **Parked: needs a deliberate ruling** — the work is small but the choice is a direction call.

- **Narrow out-param type (`{ x: number; y: number }` vs `Vector2Like`) (review Open #6).** `getQuadBatchInstanceTransform`/`getTilemapColumnRowAtPoint`/`getParticleEmitterParticleVelocity` use a third spelling of the same shape. **Parked: SDK-wide convention decision** — a one-line ruling that lands outside this package. Routed to Open directions.

- **Rust-port parity (roadmap Gold).** Mirror the matured surface in `flighthq-sprite`. **Parked: cross-worktree** — the Rust side is not in this bundle, so the matured TS surface has drifted ahead of the port. Strong value-typed-leaf conformance target, but a separate worktree's work.

- **Stale `status.md` / superseded roadmap docs (review "Candidate doc revisions").** The distributed `status.md` entry's test claim is false and its "Deferred (Silver)" list is mostly already-landed; `reviews/depth/sprite.md` and `reviews/maturation/depth/sprite.md` are superseded by `review.md` / this file and per `index.md` should migrate and be removed. **Parked: ingest/admin task** owned by the next merge pass, not package source work.

## Approved

_Empty. Approval is the user's verbal gate; nothing is frozen here yet._

## Routed to charter Open directions

For the user to settle (not edited into the charter by this pass): the `0xffff` compact/deletion model (fork A), signals-group symmetry (`ParticleEmitter` has no signals group — intentional or omission?), the `transformType` enforcement policy, the tile flip/rotate flag bit budget (`Int16Array → Int32Array`, cross-package), tilemap capacity symmetry, the narrow out-param type (`{ x: number; y: number }` vs `Vector2Like`, SDK-wide), and where bounds caching lives (fork C). The `tilemap-formats` neighbor and `TilemapChunk` are cross-package/architectural candidates for the register.
