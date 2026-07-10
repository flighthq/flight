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

Complete Tiled coverage: orthogonal (first), then isometric/hexagonal maps; multiple tile layers, object layers, and image layers; embedded and external tilesets (TSX/TSJ); tile/animation/collision/property metadata; GID flip/rotation flags; CSV and base64(+gzip/zlib) layer-data encodings. `parseTiledTmx`/`parseTiledTmj` (+ tileset variants) producing Flight tilemap + `@flighthq/tileset` data; `format*` re-emit.

## Boundaries

- **Depends on `@flighthq/tileset` + `@flighthq/types`** (+ a decompression seam for gzip/zlib layer data — a caller-supplied `inflate` callback, not a bundled zlib). No DOM, no renderer. Tileset atlas images resolve via a caller-supplied resolver (the reference-then-resolve pattern of `shape-formats`).
- **Codec only.** Turns TMX/TMJ/TSX/TSJ into tilemap+tileset data and back; owns no grid runtime, rendering, or collision — those are `@flighthq/tileset`/`sprite`/`collision`.
- **Each format pair independently tree-shakable.**

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Tiled first; TMX (XML) + TMJ (JSON) + external tilesets.** `parseTiledTmx(text, options): TileMap | null` and `parseTiledTmj(text, options): TileMap | null`, plus `parseTiledTileset*` for TSX/TSJ. Sentinel `null` on malformed input. Layer data decoded from CSV and base64; gzip/zlib via an injected `inflate` seam (dropped-with-warning if a compressed layer appears without one).
- **[2026-07-10] GID flags + external references.** The 3 high bits of each tile GID (horizontal/vertical/diagonal flip) are decoded into per-tile flip flags; external tilesets (`<tileset source=…>`) and image sources resolve through caller-supplied resolvers, not I/O here.

## Open directions

1. **LDtk importer** — the modern Tiled alternative; its own `.ldtk` JSON shape over the same tilemap target.
2. **Infinite/chunked maps** — Tiled's chunked layer data for large worlds.
3. **Wang/terrain + auto-tiling metadata** — import the terrain sets for rule-based tiling.
