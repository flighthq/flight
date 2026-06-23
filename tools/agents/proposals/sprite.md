---
id: sprite
title: '@flighthq/sprite'
type: depth
target: sprite
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/sprite.md
  - tools/agents/docs/reviews/depth/sprite.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 70/100. A clean, complete realization of exactly the slice it owns (four batch graph-node quartets — `Sprite`, `QuadBatch`, `Tilemap`, `ParticleEmitter` — with real capacity/transform/bounds/hit-test math), held back from "authoritative" by the absence of the per-instance buffer-management ergonomics a batch library is expected to own.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that turns four raw-buffer containers into a usable batch library. Every item hides a stride layout the caller currently computes by hand. No new `@flighthq/types` shapes required except the tile-flag bit constants.

- **`QuadBatch` per-instance accessors/mutators** — `setQuadBatchInstance(target, index, id, x, y)` (vector2 form) and `setQuadBatchInstanceMatrix(target, index, id, matrix)` (matrix3x2 form), `getQuadBatchInstanceId(source, index)`, `getQuadBatchInstanceTransform(out, source, index)` (writes a `Vector2` or `Matrix` `out`). These are the single biggest gap: they own the `i*2` vs `i*6` stride the depth review flagged. Bounds-checked against `instanceCount`, return `-1`/no-op on out-of-range (sentinel, not throw).
- **`QuadBatch` append/remove/clear** — `appendQuadBatchInstance(target, id, x, y)` (auto-grows via `resizeQuadBatch`, returns the new index), `removeQuadBatchInstance(target, index)` (swap-remove with the last instance — O(1), documents that it does not preserve order), `clearQuadBatch(target)` (sets `instanceCount = 0`, keeps capacity). Mirrors Starling/PixiJS `addQuad`/`removeAt`.
- **`ParticleEmitter` per-particle write helpers** — `setParticleEmitterParticle(target, index, id, x, y, rotation, scale)`, plus `setParticleEmitterParticleColor`/`setParticleEmitterParticleAlpha`/`setParticleEmitterParticleVelocity`, and `getParticleEmitterParticle*` readers; `appendParticleEmitterParticle`, `removeParticleEmitterParticle` (swap-remove), `clearParticleEmitter`. Parallels the QuadBatch gap; hides the stride-4 transform / stride-3 color / stride-2 velocity layout so `@flighthq/particles` (and manual callers) write through a named seam instead of raw arrays.
- **`Sprite` frame ergonomics** — `setSpriteFrame(target, id)` and `setSpriteFrameRect(target, rect)` (named mutators for the two `data` paths), `getSpriteRegion(source)` (returns the `TextureAtlasRegion` matching `data.id`, or `null`). Removes the inline `regions.find` every caller writes.
- **Sprite pivot in bounds** — have `computeSpriteLocalBoundsRectangle` honor the region's `pivotX`/`pivotY` (offset `out.x`/`out.y` by `-pivot`) so the field that already exists on `TextureAtlasRegion` is finally consumed. Add `getSpriteOrigin(out, source)` returning the pivot-anchored origin point.
- **`Tilemap` per-tile material + clear** — `clearTilemap(target)` (fill `-1`) and `setTilemapTiles(target, ids, offsetColumn, offsetRow, width, height)` (blit a sub-grid) — the bulk-write counterparts to the existing single-tile `setTilemapTile`.
- **Tidy + document** — collapse the `as unknown as QuadBatchRuntime` double-cast in `setQuadBatchLocalBoundsRectangle` to the single cast the sibling files use; document on `hitTestQuadBatchPoint*` and `computeQuadBatchLocalBoundsRectangle` that the affine path uses the AABB of the transformed quad (over-reports on rotated quads), not exact polygon containment.

### Silver

Competitive with Starling / PixiJS / a Tiled-class tilemap: tilemap navigation, flip/rotate tile flags, the full clone set, and exact-polygon hit testing.

- **Tile flip/rotate flags** — add the bit-flag vocabulary to `@flighthq/types` (`TilemapTileFlags` constants: `TileFlipHorizontal`, `TileFlipVertical`, `TileFlipDiagonal` — the Tiled GID convention) and pack/unpack helpers here: `packTilemapTileId(id, flags)`, `getTilemapTileFlags(value)`, `getTilemapTileBaseId(value)`. The `Int16Array` cell becomes id-plus-flags; renderers read the flags to flip/rotate. Update `getTilemapTile`/`setTilemapTile` docs to clarify the value is now id+flags. (Note: `Int16Array` limits the base-id range once flags consume high bits — surface whether `Tilemap.tiles` should widen to `Int32Array` as a design decision; see Sequencing.)
- **Tilemap navigation / coordinate conversion** — `getTilemapTileAtPoint(source, x, y)` and `getTilemapTileAtPointXY` (returns the cell value or `-1`), `tilemapColumnAtX(source, x)` / `tilemapRowAtY(source, y)`, `getTilemapColumnRowAtPoint(out, source, x, y)` (writes a `Vector2` column/row), and `getTilemapTileRect(out, source, column, row)` (the local-space rect of one cell). Standard tilemap navigation the depth review flagged as absent; hit testing exists for `QuadBatch` but not `Tilemap`.
- **`clone*` for every kind** — `cloneSprite`, `cloneQuadBatch`, `cloneTilemap`, `cloneParticleEmitter` (deep-copy the typed arrays and `materialData`, fresh runtime). `clone*` is a first-class verb across the SDK and is currently absent from all four.
- **Exact-polygon QuadBatch hit test** — `hitTestQuadBatchPointExact` (true point-in-quad containment for the affine path, vs the current AABB approximation), so an authoritative API offers both the cheap and the exact variant.
- **`QuadBatch` capacity parity for transform-type switch** — `setQuadBatchTransformType(target, transformType)` that re-strides the existing `transforms` buffer (vector2 ↔ matrix3x2) instead of forcing callers to rebuild it; today switching `transformType` silently invalidates the buffer layout.
- **Tilemap capacity helper symmetry** — a deliberate decision recorded in source: either add `reserveTilemap`/`getTilemapCapacity` to match the QuadBatch/ParticleEmitter pattern, or document in `resizeTilemap` why grids intentionally diverge (the depth review's "mild asymmetry" note). Pick one and make it explicit.
- **Signals group** — `enableSpriteSignals` (and per-kind variants if warranted) following the SDK `enable*` opt-in convention, emitting on instance add/remove/clear and tile change for consumers that need loose notification (e.g. a debug overlay or an editor). Lives here, in the owning package; cost only when enabled.

### Gold

Authoritative atlas-batch graph layer: exhaustive coverage, performance, full edge-case handling, and 1:1 Rust-port parity.

- **Sub-batch / multi-region range ops** — `iterateQuadBatchInstances` (allocation-free visitor over `(index, id, transform)`), `setQuadBatchInstanceRange` (bulk write from a source `Float32Array`), and `compactQuadBatch` / `compactParticleEmitter` (remove holes left by swap-removes while preserving order, for callers that need stable iteration order). Rounds out the buffer-management surface to the level Starling's `QuadBatch` and PixiJS's `ParticleContainer` expose.
- **Pooling brackets** — `acquireQuadBatchInstance`/`releaseQuadBatchInstance` and the particle equivalent (free-list of instance slots so high-churn callers reuse indices without compaction), following the SDK `acquire*`/`release*` pool convention. Only if profiling shows per-frame instance churn justifies it.
- **Performance pass** — guarantee every `set*Instance`/`get*Instance`/`hitTest*`/`compute*Bounds` is allocation-free in the hot loop; add a `dirty`/`bounds-cache` invalidation slot so `compute*LocalBoundsRectangle` recomputes only when the buffer changed; benchmark large batches (10k+ instances, 1M-cell tilemaps) and document the complexity of each op.
- **Exhaustive edge-case + error handling** — define behavior for: negative/oversized capacity in `reserve*`, NaN transforms in bounds/hit tests, empty atlas with non-zero `instanceCount`, region-id pointing past `atlas.regions`, and tilemap flag bits colliding with the base-id range. Sentinels for expected failure, throw only on genuine API misuse (per the SDK rule), and a test for each.
- **Tilemap chunking** — `TilemapChunk` support (a sparse/chunked tile store for very large or infinite maps) as either an in-package variant or a `tilemap-chunked` neighbor, with `getTilemapChunkAtPoint` navigation. This is the frontier capability a Tiled-class engine offers that no single dense `Int16Array` covers; surface as a design decision (in-package vs neighbor package).
- **Full Rust-port parity** — mirror the matured surface in `flighthq-sprite` (the `rust` worktree): `set_quad_batch_instance`, `get_tilemap_tile_at_point`, `pack_tilemap_tile_id`, `clone_quad_batch`, etc., as free functions over the slotmap arena, with the conformance scenes/tests pairing by name. The typed-array buffers map naturally to Rust `Vec<u16>`/`Vec<f32>`; this is a strong conformance target because the batch buffers are plain value data (no GPU, deterministic). Note: the per-instance/per-tile math here is exactly the kind of value-typed leaf that fingerprints identically across TS and Rust.
- **`-formats` neighbor (decide, do not assume)** — a `@flighthq/tilemap-formats` neighbor for importing Tiled `.tmx`/`.tjx` and similar map files into `Tilemap` + `Tileset`, following the established `-formats` importer-package pattern. This is the natural home for map parsing once flip/rotate flags exist (Bronze/Silver supply the target shape). Surface as a cross-package suggestion — it borders `@flighthq/resources` (tileset construction).

## Sequencing & effort

Recommended order, with dependencies and items to surface before acting.

1. **Bronze first, in this order** (all self-contained in the four source files, no other package touched, ~1–2 days):
   1. `QuadBatch` accessors/mutators/append/remove/clear — highest value, unblocks `@flighthq/particles` and any manual batch caller. Tidy the `as unknown as` cast in the same pass.
   2. `ParticleEmitter` per-particle helpers — same shape, directly consumed by `@flighthq/particles` (coordinate the seam with that package's authors so the field's writer uses these helpers rather than raw arrays).
   3. `Sprite` frame + pivot helpers — small; pivot-in-bounds is a behavior change, so add a functional-test/regression check that bounds shift correctly.
   4. `Tilemap` bulk write/clear — small.

2. **Silver** (~3–5 days). **Surface two design decisions before starting:**
   - **Tile-flag bit budget.** Packing flip/rotate flags into `Int16Array` cells shrinks the base-id range. Decide whether `Tilemap.tiles` widens to `Int32Array` (a `@flighthq/types` change touching `TilemapData`, the renderers, and any serialization) — this is a header-layer decision and should be agreed before the pack/unpack helpers land.
   - **Tilemap capacity symmetry** — resolve the QuadBatch/ParticleEmitter-vs-Tilemap asymmetry deliberately (add helpers or document the divergence).
   - Order within Silver: tile flags + pack/unpack → tilemap navigation (depends on flags being settled) → `clone*` (independent, can land anytime) → exact-polygon hit test (independent) → signals group (depends on the mutators existing, since it instruments them).

3. **Gold** (large, staged). Sequencing: performance/edge-case pass and bounds-cache invalidation first (hardening what exists), then range/visitor/compaction ops, then pooling only if benchmarks justify it. **Rust parity** tracks each matured surface — do it per-tier rather than as one big-bang port, so `flighthq-sprite` never drifts far from upstream. **Tilemap chunking** and the **`tilemap-formats` neighbor** are the genuine frontier; both are cross-package/architectural and should be raised as suggestions to the user, not built autonomously — chunking borders the dense-vs-sparse storage model, and `-formats` borders `@flighthq/resources`.

**Cross-package coordination points:** `@flighthq/particles` (its emitter-buffer writer should consume the new `ParticleEmitter` helpers), `@flighthq/resources` (tileset/atlas construction borders the `-formats` neighbor), the `displayobject-<backend>` renderers (must read the new tile flip/rotate flags and any widened tile type), and `@flighthq/types` (the tile-flag constants and any `Int16Array → Int32Array` widening are header-layer changes that gate Silver).

**What to keep out:** do not pull particle simulation, atlas/tileset parsing, or spritesheet animation into this package — the depth review confirms those splits are correct. Every addition above is in-domain buffer/navigation ergonomics for the four batch node kinds this package already owns.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/sprite` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
