---
package: '@flighthq/sprite'
updated: 2026-08-08
by: principal
---

# sprite — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

There is no `packages/sprite/`. The charter carries `absorbed:`, and the four quartets it described
were split into four packages, each of which owns its own cell and its own open threads:

- **Sprite** → `@flighthq/scene2d` (`packages/scene2d/src/sprite.ts`); `SpriteKind` is in
  `@flighthq/types` (`types/src/Sprite.ts:17`).
- **QuadBatch** → `@flighthq/quadbatch` (`packages/quadbatch/src/quadBatch.ts`).
- **Tilemap** → `@flighthq/tilemap` (`packages/tilemap/src/tilemap.ts`).
- **ParticleEmitter** → `@flighthq/particleemitter`, now split 2D/3D.

Two consequences for a reader who arrives here looking for code:

- **This cell's `Decisions` ledger outlives its package, and one ruling is still undelivered.** The
  2026-07-02 decision to widen `TilemapData.tiles` to `Int32Array` for tile flag bits has not landed —
  the field is still `Int16Array` (`types/src/Tilemap.ts:11`, `tilemap/src/tilemap.ts:66`), and no
  `TilemapTileFlags` or `packTilemapTileId` exists. Acting on it is `tilemap`'s cell, not this one.
- **The absorption was not a rename.** Several functions this cell recorded were dropped rather than
  moved: `getSpriteOrigin`, `getSpriteRegion`, `setSpriteFrame`, and `setSpriteFrameRect` exist
  nowhere in `packages/`. Do not treat an entry in the log below as a pointer to live code.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewrote the file to the Open + Log contract and cut the 2026-06-24 session report,
  which described a package that no longer exists. Verified the split targets by source, and found two
  claims false: the Sprite frame-ergonomics quartet (`getSpriteOrigin` / `getSpriteRegion` /
  `setSpriteFrame` / `setSpriteFrameRect`) is absent from the whole tree, and the `Int32Array` tile
  widening blessed in the charter never landed. Items the old report deferred *did* land in the split
  packages — `compactQuadBatch`, `hitTestQuadBatchPointExact`, `setQuadBatchTransformType`,
  `getTilemapTileAtPoint` — and were dropped as settled.
- **2026-06-24** — Last session against local `packages/sprite/`: per-instance accessors and mutators
  for QuadBatch and ParticleEmitter, Sprite frame ergonomics, and Tilemap bulk write/clear.
