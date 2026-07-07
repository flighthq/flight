---
package: '@flighthq/sprite'
crate: flighthq-sprite
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# sprite — Charter

## What it is

`@flighthq/sprite` is the **atlas-based, batch-rendered scene-graph layer** — four entity quartets for "draw many textured quads from one atlas in one pass":

- **Sprite** — an individual atlas-region display node (frame selection, region lookup, pivot-anchored origin, local bounds).
- **QuadBatch** — a packed instanced-quad buffer (vector2 or matrix3x2 per-instance transforms, capacity management, append/remove/clear/compact, range/iterate, AABB and exact-polygon hit testing, transform-type switching).
- **Tilemap** — a grid of tile ids over a tileset (read/write/fill/blit, content-preserving resize, column/row/point navigation, grid×tileset bounds).
- **ParticleEmitter** — a SoA render container for particle instances (transform/color/alpha/velocity buffers, capacity, append/remove/clear/compact). Data buffers only — no simulation.

Where it ends: this package holds **node data and graph participation**, not the work that fills the buffers or draws them. Particle _simulation_ lives in `@flighthq/particles`; _atlas/tileset construction_ in `@flighthq/textureatlas`/`@flighthq/tileset`; _animation_ in `@flighthq/spritesheet`/`@flighthq/timeline`; _rendering_ in the backend packages; _interaction_ dispatch in `@flighthq/interaction` (this package provides hit-test _math_ only).

## North star

1. **Value-typed leaf, no hidden work.** Every kind is plain data buffers driven by explicit, side-effect-free free functions. The package allocates only where named, writes bounds/navigation through alias-safe `out` params, and returns sentinels (`-1`/`false`/no-op) on out-of-range rather than throwing.
2. **Four symmetric quartets — with deliberate, recorded asymmetries.** Each node kind carries the entity/runtime/`*Kind` quartet shape and a parallel capability surface (per-instance accessors, append/remove/clear, capacity, clone, bounds, hit test). Where a kind diverges (ParticleEmitter has no signals group; Tilemap has no `reserve`/`getCapacity`), that is a deliberate decision, not an omission.
3. **Full user-facing API surface, not just internal consumption.** APIs like `compactQuadBatch` exist for users even if nothing in the package itself writes the deletion sentinel. The package builds a complete feature surface for external consumers. (Decision #1.)
4. **Data here; simulation/atlas/animation elsewhere.** The package draws a clean line at "buffers + graph participation" and never simulates, constructs atlases, or animates.
5. **Header-layer discipline.** Cross-package types (`SpriteSignals`/`QuadBatchSignals`/`TilemapSignals`, the `*Kind` strings) live in `@flighthq/types`. Opt-in signals are zero-cost until `enable*Signals` is called.

## Boundaries

**In scope:**

- The four node-data quartets and their per-instance / per-tile / per-particle buffer operations.
- Capacity management, append/remove (O(1) swap-remove), clear, clone, compact (mark-deleted batch removal).
- Local bounds computation and hit testing (AABB + exact-polygon for QuadBatch).
- Tilemap grid navigation (column/row/point lookups, tile rect).
- QuadBatch transform-type switching (vector2 ↔ matrix3x2 re-stride).
- Opt-in signals groups for Sprite, QuadBatch, and Tilemap.

**Non-goals:**

- Particle **simulation** / forces / lifetime → `@flighthq/particles`.
- Atlas / tileset **construction** and loading → `@flighthq/textureatlas`, `@flighthq/tileset`.
- Frame **animation** / timelines → `@flighthq/spritesheet`, `@flighthq/timeline`.
- **Rendering** (GPU / canvas / dom draw) → the `displayobject-*` backend packages.
- **Interaction** dispatch → `@flighthq/interaction` (this package provides hit-test _math_ only).

## Decisions

- **[2026-07-02] The `0xffff` compact sentinel is a blessed user-facing API.** `compactQuadBatch` and `compactParticleEmitter` filter on `0xffff` as a "mark deleted" sentinel. The user writes `0xffff` to an instance's id (O(1), no data movement), then calls `compact` to batch-remove all marked entries in a single pass. This is a user-facing fast-delete workflow — the fact that nothing else in the package writes the sentinel is irrelevant; APIs exist for users, not just internal consumption. **Resolves Open direction #1.**

  **Why:** Swap-remove (`removeQuadBatchInstance`) is O(1) but moves the last element into the gap, disrupting ordering. For bulk deletion of many instances, mark-then-compact avoids repeated swap-removes and preserves relative order of surviving instances. Both deletion strategies have valid use cases.

- **[2026-07-02] ParticleEmitter signals are intentionally absent.** Per-particle dispatch is a poor idea — the emitter manages thousands of particles per frame, and per-particle signal emission would be a measurable cost with no real use case. The emitter's writer is `@flighthq/particles`, which owns the simulation lifecycle. This is a deliberate asymmetry, not a gap. **Resolves Open direction #2.**

  **Why:** Signals are for loose, multi-listener notification. Per-particle events at thousands of particles per frame would fire more signals than any listener could meaningfully consume. The particle simulation layer in `@flighthq/particles` manages lifecycle directly.

- **[2026-07-02] transformType enforcement is documented-precondition-only — no runtime guard.** The vector2-only mutators (`appendQuadBatchInstance`, `setQuadBatchInstance`) do not guard against being called on a `matrix3x2` batch. The doc comment states the precondition; violating it is a programmer error. No runtime check is added because these are hot-loop functions where a branch has measurable cost. **Resolves Open direction #3.**

  **Why:** The `transformType` is set once and determines the batch's layout for its lifetime. Checking it on every append/set in a hot loop taxes the common case for a precondition that correct code never violates. This is the SDK's "throw only on programmer error" rule applied to performance-critical paths — except here the precondition is cheap enough to document rather than enforce.

- **[2026-07-02] Use `Vector2Like` for all `{x, y}` out-params — no inline structural literals.** `getTilemapColumnRowAtPoint`, `getParticleEmitterParticleVelocity`, and any other function returning `{x, y}` should use `Vector2Like` from `@flighthq/types`, not an inline `{ x: number; y: number }`. **Resolves Open direction #6.**

  **Why:** Inline structural types are a third spelling of the same shape. `Vector2Like` is the SDK's established convention for plain `{x, y}` data. Using the named type is consistent and avoids proliferating anonymous shape duplicates.

- **[2026-07-02] Widen `TilemapData.tiles` to `Int32Array` for tile flag bit budget.** The current `Int16Array` (max 32767) cannot accommodate flip/rotate flag bits without shrinking the base-id range to 4095. `Int32Array` provides ample room for 3 flag bits (flip-H, flip-V, flip-diagonal) plus a base-id range of ~500M. This is cross-package: it touches `@flighthq/types` (`TilemapData`), the renderers, and unlocks `TilemapTileFlags` / `packTilemapTileId` / `getTilemapTileBaseId` helpers. **Resolves Open direction #4.**

  **Why:** Tiled-class tilemaps need flip/rotate flags. Packing them into an `Int16Array` is untenable (4095 base ids). The memory cost of `Int32Array` is 2× per tile, which is acceptable for the capability gained. This is a foundational decision that blocks the tile-flags API surface.

## Open directions

1. **Tilemap capacity symmetry.** QuadBatch/ParticleEmitter have `reserve*`/`getCapacity`. Tilemap uses `resizeTilemap` (2D grid semantics, not 1D append). Whether to add `reserveTilemap`/`getTilemapCapacity` or accept the asymmetry is unsettled — `reserve` is memory mechanics, tilemap is a checkerboard, and the alignment may not be natural. _(Was Open direction #5.)_

2. **Bounds caching / dirty slot.** `compute*LocalBoundsRectangle` recomputes on every call; there is no dirty/invalidation slot. Adding one is a per-package perf decision that borders the render update pipeline. _(Was Open direction #7.)_

3. **Edge-case hardening posture.** Defined behavior for NaN transforms in bounds/hit tests, negative/oversized `reserve*` capacity, region-id past `atlas.regions`, empty-atlas-with-nonzero-count. Currently undefined/untested. Gold-tier. _(Was Open direction #8.)_

4. **Pooling brackets and `tilemap-formats` neighbor.** `acquire*`/`release*` pooling (profiling-gated) and a `tilemap-formats` codec cell (needs ≥2 formats for the plurality guard). Both parked. _(Was Open direction #9.)_

5. **Rust `flighthq-sprite` conformance.** The buffer math is deterministic, value-typed, and an ideal conformance target. The port should catch up to the matured TS surface. _(Was Open direction #10.)_
