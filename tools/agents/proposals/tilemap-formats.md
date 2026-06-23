---
id: tilemap-formats
title: '@flighthq/tilemap-formats'
type: new-package
target: tilemap-formats
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/tilemap-formats.md
  - tools/agents/docs/reviews/breadth/game-2d.md
depends_on: []
updated: 2026-06-23
---

## Summary

Import (and round-trip) of Tiled (TMX/TSX/JSON) and LDtk level files into Flight's `Tilemap`/`Tileset` types — multiple tile layers, object groups, custom properties, animated tiles, and chunked/infinite maps — the `-formats` neighbor of `sprite`/`tilemap`.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that gives a 2D game an on-ramp: load a typical Tiled JSON or LDtk project and get back renderable `Tilemap`s. The 80%-value path is finite (non-infinite) maps, orthogonal orientation, embedded tilesets, CSV/array tile data.

**Types (in `@flighthq/types` first):**

- `TileLevel` (composite document): `width`, `height`, `tileWidth`, `tileHeight`, `orientation: TileMapOrientation`, `layers: TileLevelLayer[]`, `tilesets: Tileset[]`, `backgroundColor: number` (packed RGBA), `properties: TileProperties | null`.
- `TileLevelLayer` — discriminated by `kind: TileLevelLayerKind` string identifier. Bronze ships `TileLayer` (wraps a `Tilemap` + `name`, `visible`, `opacity`, `offsetX`, `offsetY`).
- `TileLevelLayerKind` string constants: `TileLayerKind = 'TileLayer'`, with `ObjectGroupKind`/`ImageLayerKind`/`GroupLayerKind` reserved for Silver.
- `TileMapOrientation = 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal'` (Bronze parses only `'orthogonal'`; others return the orientation string but a flat-grid `Tilemap`).
- `TileProperties = Readonly<Record<string, TilePropertyValue>>`; `TilePropertyValue = string | number | boolean`.
- `TileGlobalId` brand note: Tiled global tile IDs (GIDs) carry flip bits in the high 3 bits; Bronze defines `TileFlipFlags` (`flippedHorizontal`/`flippedVertical`/`flippedDiagonal` bit constants) and a `decodeTileGlobalId(gid): { tileId: number; flip: number }` returning the local tile id + flip mask.

**Format schemas + parsers (Tiled JSON, LDtk):**

- `tiledJsonSchema.ts` — `TiledMap`, `TiledLayer`, `TiledTileset`, `TiledProperty` interfaces (field names exactly as exported).
- `parseTiledJsonTileLevel(json: string): TileLevel` — embedded tilesets, finite orthogonal maps, CSV/array `data`, layer offset/opacity/visible, map+layer custom properties.
- `parseTiledJsonTilemap(json: string, layerName?: string): Tilemap` — convenience: first (or named) tile layer straight to a single `Tilemap` for the simplest case.
- `ldtkSchema.ts` — `LdtkProject`, `LdtkLevel`, `LdtkLayerInstance`, `LdtkTilesetDefinition`, `LdtkFieldInstance`.
- `parseLdtkProjectTileLevels(json: string): TileLevel[]` — one `TileLevel` per LDtk level; `IntGrid` + `Tiles`/`AutoLayer` layers → `Tilemap`s, tileset definitions → `Tileset`.
- `parseLdtkLevelTileLevel(json: string, levelIdentifier: string): TileLevel | null` — single named level, `null` on miss (sentinel).
- `decodeTiledTileData(layer: Readonly<TiledLayer>): Int16Array` — CSV string and array forms; returns the `tiles` payload `createTilemapData` expects (`-1` for empty).

**Behavior:** parsers are pure; expected failures (missing layer/level) return `null`; only malformed-call misuse (e.g. passing non-JSON where JSON is required after the caller claimed it parsed) follows the codebase's throw-on-misuse rule. `JSON.parse` failures propagate (caller's malformed input).

**Effort:** moderate. Tiled JSON + LDtk JSON are both well-documented and stable; the bulk is the GID/flip decode and the `TileLevel` type design. This is the shippable slice.

### Silver

Competitive with what a good Tiled/LDtk runtime loader offers: every common layer kind, object data, animated tiles, external tilesets, and round-trip serialization back to Tiled. This is the "professional daily workflow" bar.

**Types (header additions):**

- `ObjectGroupLayer` (`kind: ObjectGroupKind`) holding `TileObject[]`.
- `TileObject`: `id`, `name`, `type` (Tiled class / LDtk entity identifier), `x`, `y`, `width`, `height`, `rotation`, `gid: number | -1` (tile objects, `-1` = none), `shape: TileObjectShape`, `properties: TileProperties | null`.
- `TileObjectShape = 'rectangle' | 'ellipse' | 'point' | 'polygon' | 'polyline' | 'tile' | 'text'`, with `TileObjectPoint[] points` for poly shapes.
- `ImageLayer` (`kind: ImageLayerKind`): image URL/descriptor + repeat flags + offset.
- `GroupLayer` (`kind: GroupLayerKind`): nested `layers: TileLevelLayer[]` (Tiled layer groups, LDtk layer ordering).
- `AnimatedTile`: `tileId`, `frames: TileAnimationFrame[]` (`{ tileId, durationMilliseconds }`); attach via `Tileset` side-table `TilesetAnimations = Readonly<Record<number, AnimatedTile>>` (returned alongside the `Tileset`, not jammed into the entity).
- `TileCollisionShape` — per-tile collision objects (Tiled "objectgroup" inside a tile) so a future `collision`/`physics2d` package can consume level geometry.
- `TilePropertyValue` widened: add `'color'` (packed RGBA via `TileColorProperty`), `'file'` (path string), `'object'` (object id ref), `'class'` (nested `TileProperties`) — matching Tiled's typed property system; LDtk field types mapped onto the same union.

**Format coverage:**

- `parseTiledTmxTileLevel(xml: string): TileLevel` — the **TMX/XML** variant (not just JSON), the historically dominant Tiled export. Needs a minimal dependency-free XML reader or a tiny schema-targeted parser (see Open questions). `tiledTmxSchema.ts`.
- External tileset support: `parseTiledTsxTileset(xml: string): Tileset` and `parseTiledJsonTileset(json: string): Tileset`, plus a `resolveTileLevelTilesets(level, resolver)` step where the caller supplies loaded external tileset text. Unresolved external refs surface as `TilesetReference { sourcePath, firstGlobalId }` on the `TileLevel` until resolved.
- Base64 + zlib/gzip-compressed Tiled tile data (`encoding: 'base64'`, `compression`): `decodeTiledTileData` extended; gzip/zlib via an injectable `inflate` callback so the package keeps zero hard deps (caller passes `pako`/`DecompressionStream`). Sentinel/throw on unsupported compression with no decoder supplied.
- LDtk: AutoLayer rule output, `IntGrid` value extraction (`parseLdtkIntGrid(layer): Int16Array`), entity instances → `TileObject[]`, level `neighbours`, world layout (`worldX`/`worldY`) preserved on `TileLevel`.
- Animated tiles: `getTilesetTileAnimation(animations, tileId): AnimatedTile | null` accessor; bridge to `@flighthq/spritesheet`/`@flighthq/timeline` left to the caller (boundary).

**Round-trip serialization (matches the sibling packages' `*Serialize.ts`):**

- `serializeTiledJsonTileLevel(level: Readonly<TileLevel>, existing?: Readonly<TiledMap>): string` and `serializeLdtkProject(levels, existing?)` — preserve unknown fields from `existing` like `texturePackerSerialize` preserves `meta`.
- `parse*TileLevelDocument` variants returning `{ level, document }` for lossless round-trip, matching `parseTexturePackerSpritesheetDocument`.

**Cross-cutting:** colocated `*.test.ts` per source file with real fixture exports of each format; `npm run exports:check`/`order:check` clean; full `Readonly<>` on all parse inputs and accessor params.

**Effort:** substantial. The TMX/XML reader and the compression-decoder seam are the two real costs; everything else is schema breadth.

### Gold

The canonical Flight↔Tiled/LDtk bridge: exhaustive format coverage, every Tiled/LDtk feature a level designer can author, performance for large maps, full error reporting, and 1:1 Rust parity.

**Type completeness (header):**

- `IsometricTileLevel` / `HexagonalTileLevel` projection metadata: `staggerAxis`, `staggerIndex`, `hexSideLength` so isometric/staggered/hexagonal maps round-trip and a renderer can place tiles correctly (Bronze only flattened the grid).
- `TileLevelWorld` for LDtk multi-world projects and Tiled "world" `.world` files: `worlds: TileLevelWorld[]`, each with placed `TileLevel` instances + bounds — `parseTiledWorld(json)` / `parseLdtkWorld(json)`.
- Infinite/chunked Tiled maps: `TileLayerChunk { x, y, columns, rows, tiles }` and `ChunkedTileLayer` so infinite maps load without materializing one giant array; `getChunkedTileLayerTile(layer, x, y): number`.
- `TileWangSet` / terrain ("Wang tiles") definitions for autotiling tools.
- `EmbeddedTilesetImage` vs `TilesetImageCollection` (per-tile image tilesets) — both LDtk and Tiled support image-collection tilesets that don't fit the uniform grid `Tileset`; introduce `TilesetTileImage[]` for the collection case.

**Format completeness:**

- Tiled: every layer property (`parallaxx`/`parallaxy`, `tintcolor`, `repeatx`/`repeaty`, `class`), `template` objects (`.tx`), object templates resolution, text objects, point/ellipse, image-collection tilesets, Wang sets, both XML and JSON for _every_ sub-document (map/tileset/template/world).
- LDtk: every field type (incl. enums, arrays, entity refs, tile rects), `__cWid`/`__cHei`, level field instances, enum definitions (`LdtkEnumDefinition`), `defs` resolution, separate-level-files (`externalRelPath`) mode, layer `__gridSize`, optional-image embed (`bgRelPath`, `bgPivot`, `__bgPos`).
- A structured **diagnostics** channel instead of bare throws: `parse*` overloads / a `TileLevelParseResult { level, diagnostics: TileLevelDiagnostic[] }` where `diagnostic.severity` distinguishes recoverable warnings (unknown property type → preserved as string) from fatal errors — without abandoning the simple `parse*: TileLevel` form for the common case.
- Format autodetection: `detectTileLevelFormat(text): TileLevelFormatKind` (`'tiled-json' | 'tiled-tmx' | 'ldtk'`) and `parseTileLevel(text, format?): TileLevel` umbrella.

**Performance & correctness:**

- Chunked/streaming decode for infinite maps; `Int16Array`/`Int32Array` chosen by max GID (large tilesets exceed 32767 tiles + flip bits → need wider storage; introduce `TileIdStorage` selection or document the `Int32Array` upgrade and align `TilemapData.tiles` accordingly — a `@flighthq/sprite` coordination item, see Open questions).
- Flip/rotation bits faithfully applied to `Tilemap` quad transforms (coordinate with `QuadTransformType` in `@flighthq/sprite`).
- Exhaustive fixtures: every Tiled example map shipped with Tiled, every LDtk sample project, golden round-trip tests (`parse → serialize → parse` equality).
- Docs: a `tools/agents/docs/` reference page on the Tiled/LDtk mapping table (GID→tileId, layer kinds, property types).

**Rust parity:** `flighthq-tilemap-formats` 1:1 — same function names (`parse_tiled_json_tile_level`, `decode_tile_global_id`, `serialize_ldtk_project`), same `TileLevel` shape in `flighthq-types`, XML via a small dep, inflate via a feature-gated `flate2`. Conformance fixtures shared with TS (parse the same files, assert identical `TileLevel` structure). Recorded in the conformance map as a value-leaf, fully mixable crate.

**Effort:** large. Wang sets, templates, image-collection tilesets, infinite maps, and the diagnostics channel are each non-trivial; Gold is a multi-session arc, and a couple of items (tile-id storage width, flip→quad-transform) require `@flighthq/sprite`/`@flighthq/types` coordination that should be surfaced before starting.

## Boundaries

- **Render primitive stays in `@flighthq/sprite`.** This package never renders; it produces `Tilemap`/`TileLevel` data. Backend leaves (`displayobject-gl`/`-wgpu`/`-canvas`) draw `Tilemap` as today.
- **Resource loading stays out.** The parser takes already-loaded `string`/`ArrayBuffer`. Fetching files, resolving relative image/tileset paths, decoding PNGs, and building `TextureAtlas`/`ImageResource` are `@flighthq/loader` / `@flighthq/resources` / `@flighthq/filesystem` concerns, invoked by the caller/examples. The parser emits _path strings_ and `TilesetReference`/image descriptors, not loaded textures. (This keeps the package resource-free and tree-shakable, matching `spritesheet-formats`.)
- **Compression/XML deps are injected, not bundled.** zlib/gzip inflate and (optionally) an XML reader come in via caller-supplied callbacks or a feature-gated optional dep so the default bundle stays minimal — verify with `npm run size`.
- **Collision/physics lives in a future `collision`/`physics2d`.** This package _exposes_ `TileCollisionShape`/object geometry from levels but does not implement broad-phase, integration, or resolution (flagged as a separate missing package by both game-2d and missing-domains reviews).
- **Animation playback stays in `@flighthq/spritesheet`/`@flighthq/timeline`.** Animated-tile _data_ is parsed here; turning it into a ticking animation is the animation packages' job.
- **Camera/viewport, parallax scrolling runtime** are not here — parallax _factors_ are parsed as data; a `camera2d` package (also review-flagged) consumes them.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

1. **Tile-id storage width.** `TilemapData.tiles` is `Int16Array` (max ~32k ids, and flip bits don't fit). Tiled GIDs pack 3 flip bits into a 32-bit value, and large tilesets can exceed 16-bit local ids. Do we (a) store _local_ tile id in `Int16Array` and carry flip flags in a parallel array / per-tile `materialData`, (b) widen `TilemapData.tiles` to `Int32Array`, or (c) add a `TileFlipLayer` side-array? This touches `@flighthq/sprite` and `@flighthq/types` and should be decided before Silver.
2. **Where does `TileLevel` live as an entity?** It is authored data, not a display node — but multiple `Tilemap`s under one document want a parent container. Is `TileLevel` a plain data record (this spec's assumption) that the caller instantiates into a `Container` of `Tilemap`s, or does a `TileLevel` deserve its own graph node? Plain-data-first argues for the former; ergonomics may argue for a `createTileLevelContainer(level)` helper in `@flighthq/sprite` (boundary call).
3. **XML dependency.** TMX/TSX/TX are XML. Options: a tiny hand-rolled schema-targeted reader (zero dep, more code), `DOMParser` (browser-only, breaks native/Rust parity and the resource-free goal), or a small injected `parseXml` callback (consistent with the inflate seam). The injected-callback route best preserves tree-shaking and Rust symmetry.
4. **External-reference resolution shape.** Tiled splits tilesets (`.tsx`) and templates (`.tx`) into sibling files. Should `resolveTileLevelTilesets` be sync-with-preloaded-text (parser-pure, this spec) or accept an async loader (couples to `@flighthq/loader`)? Sync-with-preloaded keeps the parser pure and matches the sibling packages.
5. **Property typing ergonomics.** Tiled/LDtk typed properties (`class`, `color`, enums, object refs) could be a flat `string|number|boolean` map (simple, lossy) or a typed `TilePropertyValue` union (faithful, more surface). Silver assumes the typed union; confirm the union shape against both formats' full type lists.
6. **LDtk vs Tiled normalization.** Should both formats normalize into one identical `TileLevel`, or should LDtk-specific concepts (IntGrid values, AutoLayer rules, enum defs) be preserved on an optional `ldtk`-namespaced extension field? Recommend: common concepts normalize 1:1; format-unique concepts ride on an optional typed extension so nothing is lost on round-trip.

## Agent brief

> Create `@flighthq/tilemap-formats` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
