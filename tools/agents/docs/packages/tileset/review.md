---
package: '@flighthq/tileset'
status: stub
score: 25
updated: 2026-07-03
ingested:
  - source
  - tests
---

# tileset — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/tileset.md)._

**Domain:** Tileset data model — a uniform grid of tiles over a texture atlas, plus the per-tile metadata a tile-based game consumes: tile identity, properties, animation, collision, and grid math.

**Verdict:** stub — completeness 25/100

The package is two source files. `tileset.ts` provides `createTileset` and `buildTilesetRegions`; `tilesetFrom.ts` provides `createTilesetFromAtlas` / `createTilesetFromImageResource` and four async loaders. The grid slicing itself is done properly — margin (edge padding) and spacing (inter-tile gap) are handled with the standard Tiled formula, rows/columns are derived from image dimensions, and `buildTilesetRegions` reuses existing region objects for zero-allocation refresh. But that is the entirety of the package: a grid slicer. Measured against the concept "tileset" as established by Tiled (TSX), Godot's TileSet, Unity's Tile Palette, or Phaser's `Tileset`, everything past cutting rectangles is absent — no tile identity or lookup, no per-tile properties, no animated tiles, no collision shapes, and no way to even read back the region for tile N without reaching into `tileset.atlas.regions[i]` by hand.

## Present capabilities

- `createTileset(obj?)` — entity constructor over the `Tileset` type in `@flighthq/types` (`atlas`, `rows`, `columns`, `tileWidth`, `tileHeight`, `margin`, `spacing`).
- `buildTilesetRegions(target)` — fills/refreshes `atlas.regions` with one region per grid cell, row-major, honoring margin and spacing; reuses region objects in place when capacity matches (documented, allocation-conscious). Null-atlas sentinel no-op.
- `createTilesetFromAtlas(atlas, tileWidth, tileHeight, margin = 0, spacing = 0)` — derives `columns`/`rows` from the atlas image with the correct `floor((size − 2·margin + spacing) / (tile + spacing))` formula; zero-sentinels when the image is null or tile size is 0.
- `createTilesetFromImageResource`, plus `loadTilesetFromBase64` / `FromBlob` / `FromBytes` / `FromUrl` mirroring the `@flighthq/image` loader surface with `AbortSignal` support.

Tests cover the constructors, grid math, margin/spacing, region reuse, and loader paths. Naming, `create*`/`load*`/`build*` verbs, sentinels, and header-first types are all per convention.

## Gaps vs an authoritative tileset library

Compare Tiled's TSX tileset model, Godot `TileSet`, Phaser `Tileset`, LDtk tileset definitions:

- **No tile accessors.** Nothing answers "give me tile 17": no `getTilesetRegion(tileset, index)` (with bounds-checked `null` sentinel), no `getTilesetTileCount`, no index↔row/column converters (`getTilesetTileIndex(tileset, column, row)` / inverse), no per-tile UV convenience. The grid math a consumer needs every frame is left to the caller.
- **No per-tile properties.** Tiled's `<tile><properties>` (arbitrary key/values per tile id) is the mechanism behind "this tile is water/solid/damaging". There is no property storage or lookup at all.
- **No animated tiles.** Tiled's `<animation>` (frame id + duration lists per tile) is a first-class tileset feature in every engine listed. Nothing here models it (and `@flighthq/spritesheet` is per-sprite animation, not per-tile).
- **No collision shapes.** Tiled's per-tile `<objectgroup>` collision rectangles/polygons (Godot: physics layers per tile) have no representation — a tile-platformer cannot be data-driven from this tileset.
- **No terrain/autotiling metadata.** Wang sets / terrain corners (Tiled), Godot terrains, LDtk auto-rules — advanced but standard in the domain.
- **Non-uniform tilesets.** Tiled supports "collection of images" tilesets (one image per tile, varying sizes); the `Tileset` type hard-assumes one uniform grid over one atlas image.
- **Tileset-level metadata:** `firstGid`-style id offset (needed the moment two tilesets feed one tilemap), tile render offset (`tileoffset`), and a `name` — all standard TSX fields, all absent.
- **No formats bridge yet.** TSX/TMX-tileset import is deliberately deferred to a future `tilemap-formats` package (packages register: bedrock, "needs `tileset` extracted"), so file I/O is missing-by-design and not counted here — but the data model above must exist first for that package to have a target.
- **`buildTilesetRegions` correctness edges:** when the grid shrinks (fewer rows/columns than a previous build) stale extra regions remain in `atlas.regions` — the array is never truncated to `rows × columns`. Reused regions also keep stale `id`/`name`/`rotated`/`trimmed` fields because `setTextureAtlasRegion` writes only rect + pivot, and freshly pushed regions keep `id: -1`, so `getTextureAtlasRegionById` is unusable on a built tileset. The zero-allocation refresh is a good instinct with an incomplete contract.

## Naming / API-shape notes

- All six exported names carry the full `Tileset` type word and the right verbs (`create*`, `load*`, `build*`); loader signatures mirror `loadTextureAtlasFrom*` exactly. Shape-wise the package is clean.
- `buildTilesetRegions` writing into `tileset.atlas.regions` means building a tileset *mutates the shared atlas* — two tilesets over one atlas clobber each other, and a hand-authored atlas is destroyed by `buildTilesetRegions`. Either the tileset should own its regions (`tileset.regions`) or the ownership transfer ("the atlas becomes tileset-owned") needs to be a documented, deliberate rule. Today it is implicit — the kind of hidden coupling the SDK's explicit-data philosophy exists to avoid.
- `margin`/`spacing` vocabulary matches Tiled exactly — good "obvious word" choices.
- Loaders do not pass `margin`/`spacing` through (`loadTilesetFromUrl(url, tileWidth, tileHeight, crossOrigin?, signal?)` has no way to load a spaced sheet) — an arbitrary convenience cliff relative to `createTilesetFromAtlas`.
- No `disposeTileset`; the entity quartet is incomplete (minor at this size).

## Recommendation

Treat this as the seed of a package, not its shape. First, decide region ownership (recommend: regions on the `Tileset`, leaving `TextureAtlas` authoring-owned) and fix the `buildTilesetRegions` contract (truncate on shrink, reset ids, or build ids as tile indices). Then add the missing floor of the domain in order: (1) tile accessors and grid math — `getTilesetTileCount`, `getTilesetRegion`, index↔column/row converters, per-tile UV; (2) per-tile properties (a `TiledPropertyValue`-style map per tile id, types in `@flighthq/types`); (3) animated tiles (per-tile frame/duration lists plus a pure `getTilesetAnimatedTileFrame(tileset, tileId, timeMs)` sampler); (4) per-tile collision shapes (reusing `@flighthq/clip` or geometry rect/polygon types); (5) tileset metadata (`name`, id offset, tile render offset) so multiple tilesets can compose under a future tilemap. That sequence turns the grid slicer into the data spine that `tilemap-formats` (TSX/TMX) and the sprite/tilemap renderer both need; until then the package is a correct but very thin slice of its domain.
