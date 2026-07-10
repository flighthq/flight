---
package: '@flighthq/tilemap-formats'
crate: flighthq-tilemap-formats
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tilemap-formats — Charter

## What it is

`@flighthq/tilemap-formats` is the **tilemap import/export codec** — it parses the standard authoring formats (Tiled's TMX XML and TMJ JSON, and the TSX/TSJ tileset sidecars) into Flight's tilemap/tileset data, and serializes back. A codec neighbor so the parsing weight stays tree-shakable off the runtime tilemap/tileset packages, matching `path-formats`/`shape-formats`/`spritesheet-formats`.

## North star

Complete Tiled coverage: orthogonal (first), then isometric/hexagonal maps; multiple tile layers, object layers, and image layers; embedded and external tilesets (TSX/TSJ); tile/animation/collision/property metadata; GID flip/rotation flags; CSV and base64(+gzip/zlib) layer-data encodings. The parse produces a **faithful `TiledMap` document** (every layer, tileset ref, raw 32-bit GID, property, orientation — losslessly `format*`-able); **projection functions** then map that document into Flight runtime primitives on the caller's terms. `parseTiledTmx`/`parseTiledTmj` (+ tileset variants) → `TiledMap`; `buildTilemapLayersFromTiled` → `TilemapData[]`; `format*` re-emit.

## Boundaries

- **`Tilemap` stays bedrock.** Flight's `Tilemap` is single-grid, single-tileset by design (batching = one texture, one draw call). This codec does **not** grow `Tilemap` to absorb Tiled's multiplicity. A Tiled map decomposes into existing primitives — N tile layers → N `Tilemap`s stacked in a container; image layers → `Bitmap`s; object layers → collider/property data — and the codec's job is the faithful document plus the projections, never a mega-type.
- **Parse core depends on `@flighthq/types` + `@flighthq/xml`** (TMX/TSX are XML — reuse the sanctioned XML dep, as `spritesheet-formats`/`textureatlas-formats` do); **projection adds `@flighthq/sprite`** (`createTilemapData`, `Tilemap`) **+ `@flighthq/tileset`** (tileset build/resolve). A caller-supplied `inflate` callback decodes gzip/zlib layer data (no bundled zlib). No DOM, no renderer. External tilesets and atlas images resolve via caller-supplied resolvers (the reference-then-resolve pattern of `shape-formats`).
- **Faithful document + projection, not a runtime aggregate.** Turns TMX/TMJ/TSX/TSJ into a `TiledMap` document and back, and projects tile layers into `TilemapData`; owns no grid runtime, rendering, collision, or a "tiled scene" type — the display container already aggregates the projected layers.
- **Each format pair and each projection independently tree-shakable.**

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Tiled first; TMX (XML) + TMJ (JSON) + external tilesets.** `parseTiledTmx(text, options): TiledMap | null` and `parseTiledTmj(text, options): TiledMap | null`, plus `parseTiledTileset*` for TSX/TSJ. Sentinel `null` on malformed input. Layer data decoded from CSV and base64; gzip/zlib via an injected `inflate` seam (dropped-with-warning if a compressed layer appears without one).
- **[2026-07-10] GID flags + external references.** The 3 high bits of each tile GID (horizontal/vertical/diagonal flip) are decoded into per-tile flip flags; external tilesets (`<tileset source=…>`) and image sources resolve through caller-supplied resolvers, not I/O here.
- **[2026-07-10] Faithful document, then projection — two entry points.** `parse*` returns a faithful `TiledMap` DTO (in `@flighthq/types`): map metadata (orientation, dimensions, background), a `TiledLayer[]` discriminated union (`tilelayer`/`objectgroup`/`imagelayer`/`group`), `TiledTilesetRef[]` (embedded or external `source`), typed `TiledProperty[]`, and each tile layer's **raw 32-bit GIDs** (flip bits intact) with a `decodeTiledGid(gid) → { tileId, flipH, flipV, flipD }` helper. `formatTiledTmx(doc)` round-trips it losslessly for the modeled fields. This is the primitive; it forces no runtime shape on the caller.
- **[2026-07-10] Per-layer tile projection yields `TilemapData[]`, one Tilemap per tileset.** `buildTilemapLayersFromTiled(doc, layerIndex, resolveTileset): TilemapData[] | null` projects a single tile layer, splitting by tileset: a layer that draws from N tilesets becomes N single-tileset `TilemapData` (tiles outside a given tileset = `-1`), which the caller stacks in a container — the batching-correct answer, since a `Tilemap`/`QuadBatch` batches one atlas per draw. The common single-tileset layer returns a 1-element array. Multi-atlas is solved by *more Tilemaps* (or a `binpack`-merged atlas), never by per-tile atlas swapping — per-tile `materialData` carries material params (tint/color-transform), not a texture. Sparse per-instance-atlas needs (odd object-layer decorations) are individual `Sprite`s, which each own an `atlas`.
- **[2026-07-10] The caller drives non-tile layers.** A tile layer projects to `Tilemap`s; the caller maps object/image/group layers themselves (object → collider/entity data, image → `Bitmap`) by reading the faithful document. The codec does not force a layer to become a `Tilemap`, which is what keeps Tiled's non-tile content from demanding a mega-type or a package relocation — this stays `tilemap-formats` because Tiled is primarily a tilemap format.

## Open directions

1. **Whole-map compose-down convenience.** `buildTiledScene(doc, options) → container` — a separately-importable assembly that stacks the projected tile layers (+ image layers as `Bitmap`s) into one display container, so the convenience never taxes the per-layer primitive. Pulls in `@flighthq/displayobject`.
2. **Non-tile-layer projections.** `buildCollidersFromTiledObjectGroup` (→ `@flighthq/collision` shapes + property bag), `buildBitmapFromTiledImageLayer`, and `mergeTiledTilesetsToAtlas` (`binpack`+`textureatlas` merge for layers that must be a single batch).
3. **LDtk importer** — the modern Tiled alternative; its own `.ldtk` JSON shape over the same `TilemapData[]` projection target.
4. **Infinite/chunked maps** — Tiled's chunked layer data for large worlds.
5. **Wang/terrain + auto-tiling metadata** — import the terrain sets for rule-based tiling.
