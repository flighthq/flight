---
package: '@flighthq/tileset'
updated: 2026-07-03
basedOn: ./review.md
---

# tileset — Assessment

Based on the 2026-07-03 review (stub, 25/100). Both items approved 2026-07-02 have landed: `loadTilesetFromBytes` exists in source and the Package Map carries a tileset description — dropped from Recommended.

The review's central finding is a tension with the charter: charter Decision #2 says "near scope ceiling — growth is in formats, not core API," while the review measures the package as a grid slicer missing the floor of its domain (tile accessors, per-tile properties, animated tiles, collision, tileset metadata). Per the charter's authority, none of that growth is Recommended here; it is parked below as a candidate Open direction so the scope-ceiling decision can be revisited deliberately.

## Recommended

Sweep-safe: within `@flighthq/tileset`, no cross-package coupling, no open design decision.

1. **Fix the `buildTilesetRegions` correctness edges.** A real bug, not a feature: (a) when the grid shrinks, stale extra regions remain in `atlas.regions` — truncate to `rows × columns`; (b) freshly pushed regions keep `id: -1` and reused regions keep stale `id`/`name`/`rotated`/`trimmed` fields (because `setTextureAtlasRegion` writes only rect + pivot) — assign ids as tile indices and reset the metadata fields on reuse, so `getTextureAtlasRegionById` works on a built tileset. Keeps the zero-allocation refresh; completes its contract. (The deeper question of whether the tileset should mutate the shared atlas at all is the ownership fork, parked below.)

2. **Pass `margin`/`spacing` through the loaders.** `loadTilesetFromUrl(url, tileWidth, tileHeight, crossOrigin?, signal?)` (and the other three loaders) has no way to load a spaced sheet — an arbitrary convenience cliff relative to `createTilesetFromAtlas(atlas, tileWidth, tileHeight, margin, spacing)`. Parameter parity, not new feature surface.

3. **Add `disposeTileset`.** Entity-quartet completion, matching the SDK-wide lifecycle convention; minor at this size.

## Backlog

- **Region ownership fork.** `buildTilesetRegions` writes into `tileset.atlas.regions`, so building a tileset mutates the shared atlas — two tilesets over one atlas clobber each other, and a hand-authored atlas is destroyed. Review recommends regions owned by the `Tileset` (leaving `TextureAtlas` authoring-owned); alternative is documenting an explicit ownership-transfer rule. _Parked — design decision / cross-package (changes the `Tileset` type in `@flighthq/types` and the textureatlas seam); candidate Open direction for the charter._
- **Tile data model growth.** Tile accessors and grid math (`getTilesetTileCount`, `getTilesetRegion`, index↔column/row converters, per-tile UV), per-tile properties, animated tiles, per-tile collision shapes, terrain/autotiling metadata, non-uniform tilesets, and tileset-level metadata (`name`, `firstGid`-style offset, tile render offset). The review argues this data spine must exist before a formats package has a target. _Parked — contradicts charter Decision #2 (near scope ceiling); candidate Open direction for the charter._
- **`tileset-formats` package.** Blessed as a neighbor by charter Decision #3 (Tiled TSX primary); package shape (registry vs per-format functions) is charter Open direction #1. _Parked — new package, needs a direction session._
- **Tiled TMX / LDtk map format home.** _Parked — cross-package / cross-domain (tilemap/scene); charter Open direction #2._
- **Rust `flighthq-tileset` crate conformance.** _Parked — global posture (TS is the spec; Rust conforms in parity passes)._

## Approved

- [2026-07-02 · picked] Sweep items 1–2: Uint8Array rename, Package Map description
