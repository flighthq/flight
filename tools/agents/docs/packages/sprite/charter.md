---
package: '@flighthq/sprite'
crate: flighthq-sprite
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# sprite — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Atlas-based, batch-rendered scene-graph primitives — the "draw many textured quads from one atlas in one pass" graph layer of a 2D engine. It owns four entity quartets, all value-typed data buffers:

- **`Sprite`** — an individual atlas-region display node (frame selection, region lookup, pivot-anchored origin, local bounds).
- **`QuadBatch`** — a packed instanced-quad buffer (vector2 or matrix3x2 per-instance transforms, capacity management, append/remove/clear, range/iterate/compact, AABB and exact-polygon hit testing).
- **`Tilemap`** — a grid of tile ids over a tileset (read/write/fill/blit, content-preserving resize, column/row/point navigation, grid×tileset bounds).
- **`ParticleEmitter`** — a SoA render container for particle instances (transform/color/alpha/velocity buffers, capacity, append/remove/clear, rotate+scale corner-union bounds). Data buffers only.

Where it ends: this package holds **node data and graph participation**, not the work that fills the buffers or draws them. Particle _simulation_ lives in `@flighthq/particles`; _atlas/tileset construction_ in `@flighthq/resources`; _animation_ in `@flighthq/spritesheet`/`@flighthq/timeline`; _rendering_ and _interaction_ in the backend/interaction packages. The realized head upholds this — no simulation, atlas construction, or animation has leaked in.

This maps to Starling's `Image`/`QuadBatch`/`Tilemap`, PixiJS `ParticleContainer`/`Mesh`, and OpenFL `Tilemap`/`Tile`.

## North star (proposed)

_Proposed from the realized design + the SDK forks. Edit, or promote into a blessed North star only after you confirm._

1. **Value-typed leaf, no hidden work.** Every kind is plain data buffers driven by explicit, side-effect-free free functions: `create*`/`get*`/`set*`/`append*`/`remove*`/`clear*`/`clone*`/`reserve*`/`resize*`/`compute*`/`hitTest*`. The package allocates only where named, writes bounds/navigation through alias-safe `out` params, and returns sentinels (`-1`/`false`/no-op) on out-of-range rather than throwing. This is what makes it an excellent Rust conformance target.
2. **Four symmetric quartets.** Each node kind carries the same entity/runtime/`*Like`/`*Kind` quartet shape and a parallel capability surface (per-instance accessors, append/remove/clear, capacity, clone, bounds, hit test, opt-in signals). A reader who learns one kind can navigate the others. Asymmetries (ParticleEmitter has no signals group; Tilemap lacks `reserve*`/`getCapacity`) should be _deliberate and recorded_, not incidental.
3. **Data here; simulation/atlas/animation elsewhere.** The package draws a clean line at "buffers + graph participation" and never simulates, constructs atlases, or animates. Resist scope creep across that line; surface anything that blurs it (structural-fork A).
4. **Header-layer discipline.** Cross-package types (`SpriteSignals`/`QuadBatchSignals`/`TilemapSignals`, the `*Kind` strings) live in `@flighthq/types`, not inline. Opt-in signals are zero-cost until `enable*Signals` is called.
5. **Single root barrel, `sideEffects: false`.** A thin 4-file re-export; no per-file subpaths; no top-level registration or side effects.

## Boundaries (proposed)

_Proposed; confirm before treating as blessed non-goals._

**In scope:**

- The four node-data quartets and their per-instance / per-tile / per-particle buffer operations.
- Capacity management, append/remove (O(1) swap-remove), clear, clone, resize.
- Local bounds computation and hit testing (AABB + exact-polygon for QuadBatch).
- Tilemap grid navigation (column/row/point lookups) returning raw cell values.
- Opt-in signals groups for the kinds where per-change notification is wanted.

**Out of scope (housed elsewhere — non-goals):**

- Particle **simulation** / forces / lifetime → `@flighthq/particles`.
- Atlas / tileset **construction** and loading → `@flighthq/resources`.
- Frame **animation** / timelines → `@flighthq/spritesheet`, `@flighthq/timeline`.
- **Rendering** (GPU / canvas / dom draw) → the `render-*` / `displayobject-*` backend packages.
- **Interaction** dispatch → `@flighthq/interaction` (this package provides hit-test _math_ only).

## Decisions

None blessed yet.

## Open directions

Every candidate question this draft inherits from the review and the structural forks. These are where the charter still asks rather than asserts — settle them in a direction session.

1. **`0xffff` sentinel-deletion model — bless or drop?** `compactQuadBatch`/`compactParticleEmitter` filter on a hard-coded `0xffff` id sentinel that nothing in the package ever writes (remove uses swap-remove + count-decrement). As shipped they are no-ops for the documented case and only serve a deletion protocol that does not exist here — the doc comment even argues with itself. Either bless a named "mark-deleted then compact" workflow (a `markQuadBatchInstanceDeleted` seam) or remove the compact functions. **Borders structural-fork A** (source-data vs. graph participation): who owns the deletion/lifetime convention — `sprite` or `particles`?
2. **Signals-group symmetry.** Sprite/QuadBatch/Tilemap each got an opt-in signals group; `ParticleEmitter` did not. Is the emitter intentionally signal-free (its writer is `@flighthq/particles`, which may not want per-particle dispatch), or an omission? Settle the rule and record it as a deliberate asymmetry or a gap to close.
3. **`transformType` enforcement policy.** Vector2-only mutators (`appendQuadBatchInstance`, `setQuadBatchInstance`) write `index*2` regardless of `transformType`, silently corrupting a matrix3x2 batch's stride. Should these hard-guard the transform type (no-op/sentinel) or stay documented-precondition-only? This is the package's main silent-corruption surface.
4. **Tile flip/rotate flag bit budget** (`Int16Array` → `Int32Array`). The one open header-layer decision blocking Tiled-class tilemaps: no `TilemapTileFlags`/`packTilemapTileId`/`getTilemapTileFlags`/`getTilemapTileBaseId`, and navigation currently returns raw cell values with no flag vocabulary. **Cross-package** (`@flighthq/types` + renderers) — surface to the user, do not assume.
5. **Tilemap capacity symmetry.** Add `reserveTilemap`/`getTilemapCapacity` to match QuadBatch/ParticleEmitter, or record a blessed decision that grids legitimately diverge from the buffer kinds. Still unresolved in source.
6. **Narrow out-param type — `{ x: number; y: number }` vs `Vector2Like`.** `getQuadBatchInstanceTransform`/`getTilemapColumnRowAtPoint`/`getParticleEmitterParticleVelocity` take an inline `{ x: number; y: number }` — a third spelling of the same shape. A one-line SDK-wide convention ruling would remove it. (Borders an SDK-wide convention, not just this package.)
7. **Where does bounds caching live?** `compute*LocalBoundsRectangle` recomputes on every call; there is no dirty/invalidation slot. Adding one is a per-package perf decision that **borders structural-fork C** (the render update pipeline) — confirm it belongs here before building it.
8. **Edge-case hardening posture (Gold).** What is the defined behavior for NaN transforms in bounds/hit tests, negative/oversized `reserve*` capacity, region-id past `atlas.regions`, and empty-atlas-with-nonzero-count? Currently undefined/untested. Decide whether hardening these is in-charter for this package or deferred.
9. **Pooling brackets and a `tilemap-formats` neighbor.** `acquire*Instance`/`release*Instance` pooling (profiling-gated) and a `tilemap-formats` codec cell (cross-package, gated by the triad **plurality guard** — needs ≥2 formats first). Both are parked; confirm whether/when they enter scope.
10. **Rust conformance drift.** The matured TS surface has run ahead of any `flighthq-sprite` port; the buffer math is a deterministic value-typed leaf and an ideal conformance target, but parity is unverified (the Rust side is not in this bundle). Confirm the port is expected to catch up to this surface.
11. **Charter-silent fallback flag.** While the charter stays a stub, `review.md` is judged against the codebase-map AAA standard, which surfaced one live tension: the AAA "every exported function has a colocated test" rule and the `exports:check`/`order` checkpoints are violated by ~26 untested second-wave exports. This is unfinished work, not a design fork — but it underlines that the North star above should explicitly bless (or relax) the "every export tested" bar for this package.
