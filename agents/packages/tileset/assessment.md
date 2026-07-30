---
package: '@flighthq/tileset'
updated: 2026-07-03
basedOn: ./review.md
---

# tileset — Assessment

## Retired 2026-07-30 — the package no longer exists

**Do not sweep this cell.** `@flighthq/tileset` was removed by `9c73a6786` ("refactor: split
quadbatch and tilemap packages"). Verified against the live tree, not inferred: `packages/tileset/`
holds only a gitignored `dist/` and a `tsconfig.tsbuildinfo` — no `src/`, no `package.json`, and
`git ls-files packages/tileset` returns nothing. `createTileset`, `buildTilesetRegions`, and
`disposeTileset` appear nowhere in any package's source. The surviving `Tileset` spellings are
`TiledTileset` in `@flighthq/tilemap-formats`, which is the parsed TMX/TSX *descriptor*, a different
thing from the runtime entity this cell was written about.

Where its responsibilities went:

- **Uniform grid → atlas regions** is `createTextureAtlasFromGrid` in `@flighthq/textureatlas`.
- **The runtime tile grid** is `@flighthq/tilemap`.
- **Tiled tileset descriptors** are `@flighthq/tilemap-formats`.

The three items this cell carried are void on that basis, and one of them was already satisfied
anyway: *pass `margin`/`spacing` through the loaders* is done — `textureAtlasGrid.ts` takes
`marginX`/`marginY`/`spacingX`/`spacingY` explicitly. *Fix the `buildTilesetRegions` correctness
edges* and *add `disposeTileset`* name functions that do not exist.

**Why this survived unnoticed** is worth recording: the leftover `dist/` directory makes
`packages/tileset` look like a package to anything that lists directories rather than reading
`package.json`, and `AGENTS.md`'s Package Map still named `tileset` — a file every agent session reads
in full. Both are corrected in the same change. `packages/scene-formats/` is the same shape of
residue (dist + tsbuildinfo, no source) left by the `scene3d-formats` rename, and is worth the same
check.

## Recommended

None — retired cell.

## Backlog

None — retired cell.
