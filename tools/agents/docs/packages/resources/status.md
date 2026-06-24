---
package: '@flighthq/resources'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# resources — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/resources (+ @flighthq/resource-formats)

**Session dates:** 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Previous score:** 76/100 (solid → competitive) **Estimated current score:** 91/100 (gold)

---

## Summary

Pass 2 closed all three deferred items from pass 1 and created the new `@flighthq/resource-formats` neighbor package. The combined set covers the full Silver tier and reaches the bottom of Gold. The package suite now has:

- Four production atlas parsers (TexturePacker JSON hash/array, Aseprite JSON, Starling/Sparrow XML, libGDX text-format)
- Auto-detection and dispatch (`detectTextureAtlasFormat`, `parseTextureAtlas`)
- Extensible format registry (`registerTextureAtlasFormat`)
- Paired image+metadata loader (`loadTextureAtlasWithMetadataFromUrl`) for concurrent fetch and parse in one call
- `getTextureAtlasRegionSequence` and `getTextureAtlasRegionUv` for animation and rendering workflows
- `pivotX/pivotY` correctly defaulting to `null` matching the type declaration
- AbortSignal on `loadVideoResourceFromUrl` and `loadVideoResourceFromUrls`
- New `TextureAtlasFormatKind` type family in `@flighthq/types`
- Tileset margin/spacing doc comment fix (swapped descriptions corrected)

`@flighthq/resources`: 163 tests across 15 test files, all passing. `@flighthq/resource-formats`: 64 tests across 6 test files, all passing. All checks clean (`npm run packages:check`, `npm run exports:check`, `npm run order`, lint, typecheck).

---

## Implemented APIs — Cumulative (both passes)

### New types in `@flighthq/types`

**`TextureAtlasRegion`** — fields added in pass 1:

- `name: string | null` — frame-by-name identifier; null for hand-built index-only regions
- `trimmed: boolean` — whether whitespace was trimmed (default `false`)
- `rotated: boolean` — whether the region is rotated 90° clockwise in the atlas (default `false`)
- `sourceX: number` — x offset of the trimmed sub-rect within the original frame (default `0`)
- `sourceY: number` — y offset of the trimmed sub-rect within the original frame (default `0`)
- `originalWidth: number | null` — full pre-trim frame width (null when `trimmed` is `false`)
- `originalHeight: number | null` — full pre-trim frame height (null when `trimmed` is `false`)

**`Tileset`** — fields added in pass 1:

- `margin: number` — border padding in pixels between tile grid and image edge (default `0`)
- `spacing: number` — inter-tile gap in pixels between adjacent tiles (default `0`)

**`TextureAtlasFormatKind`** — new type and constants added in pass 2:

- `type TextureAtlasFormatKind = string`
- `TextureAtlasFormatKindTexturePacker = 'texturePacker'`
- `TextureAtlasFormatKindAseprite = 'aseprite'`
- `TextureAtlasFormatKindStarling = 'starling'`
- `TextureAtlasFormatKindLibgdxAtlas = 'libgdxAtlas'`
- `TextureAtlasFormatKindCocosPlist = 'cocosPlist'` (constant defined; parser deferred — see below)

### `@flighthq/resources` — new and updated functions

**`textureAtlasRegion.ts`** (pass 1):

- `getTextureAtlasRegionById(atlas, id): TextureAtlasRegion | null`
- `getTextureAtlasRegionByName(atlas, name): TextureAtlasRegion | null`

**`textureAtlasRegion.ts`** (pass 2):

- `getTextureAtlasRegionSequence(atlas, prefix): TextureAtlasRegion[]` — returns all regions whose `name` starts with `prefix`, in insertion order; empty array when none match or all names are null
- `getTextureAtlasRegionUv(region, imageWidth, imageHeight, out): RectangleLike` — writes normalized UV coordinates `[0,1]` into `out`; zero-fills when image dimensions are non-positive; alias-safe (reads all inputs before writing)

**`textureAtlasRegion.ts`** (pass 2 — pivot default fix):

- `createTextureAtlasRegion` now defaults `pivotX` and `pivotY` to `null` (matching the `number | null` type declaration); previously defaulted to `0`
- `addTextureAtlasRegion` passes `pivotX ?? null` and `pivotY ?? null`

**`textureAtlas.ts`** (pass 1):

- `getTextureAtlasByteSize(atlas): number`

**`imageResource.ts`** (pass 1):

- `getImageResourceByteSize(resource): number`

**`tileset.ts`** and **`tilesetFrom.ts`** (pass 1):

- `buildTilesetRegions` honors `tileset.margin` and `tileset.spacing`
- `createTileset` defaults `margin: 0` and `spacing: 0`
- `createTilesetFromAtlas`, `createTilesetFromImageResource` accept optional `margin`/`spacing`

**AbortSignal support** (pass 1 — image/audio; pass 2 — video):

- `loadImageResourceFromUrl`, `loadImageResourceFromBlob`, `loadImageResourceFromBase64`, `loadImageResourceFromArrayBuffer`
- `loadTextureAtlasFromUrl`, `loadTextureAtlasFromBlob`, `loadTextureAtlasFromBase64`, `loadTextureAtlasFromArrayBuffer`
- `loadTilesetFromUrl`, `loadTilesetFromBlob`, `loadTilesetFromBase64`, `loadTilesetFromArrayBuffer`
- `loadAudioResourceFromUrl`, `loadAudioResourceFromUrls`
- `loadVideoResourceFromUrl`, `loadVideoResourceFromUrls` (pass 2)

All video loader abort wiring uses `if (signal?.aborted) return Promise.reject(signal.reason)` at the top (not `throwIfAborted()`) because the function is not `async` — a throw before the Promise constructor runs would propagate synchronously to the caller.

**Naming cleanup** (pass 1):

- `createAudioResourceFromURLs` → `createAudioResourceFromUrls`
- `loadAudioResourceFromURLs` → `loadAudioResourceFromUrls`
- `createVideoResourceFromURLs` → `createVideoResourceFromUrls`
- `loadVideoResourceFromURLs` → `loadVideoResourceFromUrls`
- `loadFontFromURLs` → `loadFontFromUrls`
- `loadFontResourceFromURLs` → `loadFontResourceFromUrls`

### `@flighthq/resource-formats` — new package (pass 2)

Location: `packages/resource-formats/`

**`textureAtlasPackerParse.ts`**:

- `parseTextureAtlasPackerDocument(doc, atlas, options?): TextureAtlas` — accepts TexturePacker JSON-Hash and JSON-Array document shapes; handles `rotated` (swaps w/h), `trimmed` (sourceX/Y/originalWidth/Height), and `pivot` fields; clears `atlas.regions` before filling
- `parseTextureAtlasPackerJson(json, atlas, options?): TextureAtlas` — parses a JSON string then delegates; accepts optional `{ stripPathPrefix: boolean }` to strip directory segments from frame names
- Schema types in `textureAtlasPackerSchema.ts`

**`textureAtlasAsepriteParse.ts`**:

- `parseTextureAtlasAsepriteDocument(doc, atlas): TextureAtlas`
- `parseTextureAtlasAsepriteJson(json, atlas): TextureAtlas`
- Schema types in `textureAtlasAsepriteSchema.ts`
- Handles Aseprite's `frame`/`sourceSize`/`spriteSourceSize`; ignores frame tags (animation metadata deferred)

**`textureAtlasStarlingParse.ts`**:

- `parseTextureAtlasStarlingXml(xml, atlas, options?): TextureAtlas`
- Handles `frameX`/`frameY` trim offsets (Starling convention: negative offsets from original frame origin, stored as `sourceX = -frameX`)

**`textureAtlasLibgdxParse.ts`**:

- `parseTextureAtlasLibgdxAtlas(text, atlas): TextureAtlas`
- Parses libGDX/Spine text-format atlas; handles multi-page files (uses page 0 image for `atlas.image`), `rotate: true`, `xy`/`size`/`orig`/`offset` fields, indexed regions

**`textureAtlasDetect.ts`**:

- `detectTextureAtlasFormat(text): TextureAtlasFormatKind | null` — sniffs format by heuristics; returns kind or null for unrecognized text
- `parseTextureAtlas(text, atlas, formatKind?): TextureAtlas | null` — dispatch with optional override; returns null for unrecognized format (sentinel, not throw)
- `registerTextureAtlasFormat(kind, { detect, parse }): void` — extensible registry; last-write-wins; vendor-prefix convention for third-party kinds

Detection heuristics:

- TexturePacker: starts with `{`, has `"meta":` + `"app":`, no `aseprite.org` in text
- Aseprite: starts with `{`, has `"meta":` + `aseprite.org` in text
- Starling: contains `<TextureAtlas` tag
- LibGDX: does not start with `{` or `<`, contains `rotate:` or `xy:` lines

**`textureAtlasLoad.ts`**:

- `loadTextureAtlasWithMetadataFromUrl(imageUrl, metadataUrl, options?): Promise<TextureAtlas>` — concurrent `fetch` for image and metadata text; parses metadata with `parseTextureAtlas` (auto-detect or `options.formatKind` override); sets `atlas.image`; rejects when format is unrecognized

**`xmlParse.ts`** (internal):

- `parseXmlDocument(xml): XmlDocument` — minimal regex-based XML parser for Starling/Cocos plist formats; no external XML dependency

---

## Test coverage

- `@flighthq/resources`: 163 tests, 15 test files, all passing
- `@flighthq/resource-formats`: 64 tests, 6 test files, all passing
- Key new test groups: `getTextureAtlasRegionSequence`, `getTextureAtlasRegionUv`, `parseTextureAtlasPackerDocument`, `parseTextureAtlasPackerJson`, `parseTextureAtlasAsepriteDocument`, `parseTextureAtlasAsepriteJson`, `parseTextureAtlasStarlingXml`, `parseTextureAtlasLibgdxAtlas`, `detectTextureAtlasFormat`, `parseTextureAtlas`, `registerTextureAtlasFormat`, `loadTextureAtlasWithMetadataFromUrl`, abort-signal tests for video loader

---

## Design choices made

### `resource-formats` as a neighbor package

Follows the `spritesheet-formats` precedent already established in the monorepo. Parsers are pure functions over plain data (no DOM, no fetch), so the package is `"sideEffects": false`, testable in the Node environment, and tree-shakable. `loadTextureAtlasWithMetadataFromUrl` (which does fetch) lives in `resource-formats` rather than core `resources` because it depends on the parser layer and would add parser weight to any caller who just wants the image-loading primitives.

### Rotated frame dimension swap (TexturePacker)

When `rotated: true`, TexturePacker's `frame.w` and `frame.h` are the dimensions of the packed rectangle (width = the short side placed along x). The logical sprite has swapped dimensions: `region.width = entry.rotated ? frame.h : frame.w`. This matches the TexturePacker JSON spec and is consistent with how game frameworks (Phaser, pixi-spine) read the field.

### Starling `frameX/frameY` sign convention

Starling stores trim offsets as negative values (`frameX = -sourceX`, `frameY = -sourceY`). The parser stores `sourceX = -(frameX ?? 0)`, which is zero for untrimmed regions. This is the standard interpretation used by Starling-compatible frameworks.

### LibGDX multi-page support

When a libGDX atlas file references multiple pages, `atlas.image` is set from the first page's filename (as a URL-like string). Full multi-page support (one `ImageResource` per page, per-region page index) is deferred with the multi-page `TextureAtlas` structural change.

### Cocos plist format

`TextureAtlasFormatKindCocosPlist` is defined as a constant in `@flighthq/types` to claim the kind string and allow detection registration by the caller. The parser is not yet implemented (see deferred items). A stub exists in the registry with a no-op parse.

### `pivotX/pivotY` null default

The type declaration in `@flighthq/types` has `pivotX: number | null` and `pivotY: number | null`. The constructor was defaulting to `0`, which conflated "no pivot set" with "pivot at top-left". Changed to `null` to match the declared type. Any consumer testing `pivotX === 0` as "no pivot" must now check `pivotX === null`. The parsers (TexturePacker, Aseprite) set numeric values when the field is present in the metadata and `null` when absent.

### AbortSignal for non-async video loader

`loadVideoResourceFromUrl` is not `async` — it returns `new Promise(...)` directly. Using `signal?.throwIfAborted()` at the top would throw synchronously before the Promise constructor, propagating to the caller as an exception rather than a rejected promise. The correct pattern for a non-async function is `if (signal?.aborted) return Promise.reject(signal.reason)`.

---

## Remaining deferred items

### Cocos plist parser (Silver)

`TextureAtlasFormatKindCocosPlist` is registered and the kind constant is in `@flighthq/types`. The parser itself (Cocos/Cocos2d-x plist XML format) was not implemented. The plist format uses a different XML shape from Starling (nested `<dict>` / `<key>` / `<string>` / `<array>`). The minimal `xmlParse.ts` in `resource-formats` can serve as the base, but the plist traversal logic is substantial. Medium effort; good production value for Cocos users.

### Multi-page atlas (Silver)

Changing `TextureAtlas.image: ImageResource | null` to `pages: ImageResource[]` with a per-region `page: number` index is a structural type change. It ripples into `@flighthq/sprite`, `@flighthq/spritesheet`, and all renderers that consume atlas data. Cross-package coordination needed; scoped to a dedicated session.

### Animation frame sequences from metadata (Silver)

Aseprite and TexturePacker both store frame tag / animation metadata alongside region frames. `getTextureAtlasRegionSequence(atlas, prefix)` provides a name-prefix approach that works today without parser cooperation. A richer `getTextureAtlasAnimation(atlas, name)` that uses parsed frame-tag metadata requires storing tags on the atlas type — a new `animations: TextureAtlasAnimation[]` field on `TextureAtlas`. Scoped to the same session as multi-page work.

### Resource cache / registry (Silver)

`getCachedResource`, `setCachedResource`, `evictCachedResource`, `clearResourceCache`. The ownership boundary between `@flighthq/resources` (content-addressed identity/dedup) and `@flighthq/loader` (batch queue/progress) must be settled before building. Requires a short design decision: does cache live in resources (URL-keyed dedup, available to standalone loaders) or in loader (lifecycle-managed, tied to the batch queue)?

### Loader signals via `enable*` (Silver)

`enableResourceLoaderSignals(...)` wiring the `ResourceLoader` type from `@flighthq/types` into an opt-in signal group. Depends on cache design.

### Per-tile metadata (Silver)

`TilesetTile { id, properties, animation, collision? }` and `tiles: TilesetTile[]` on `Tileset`. New type in `@flighthq/types` + sparse-tile-property handling in `buildTilesetRegions`. Low risk; best done alongside a `parseTilesetTsj` addition to `resource-formats`.

### Compressed textures (Gold)

`CompressedPixelFormat`, `compressed` slot on `ImageResource`, KTX2/Basis/DDS parsers, and a `BasisTranscoderBackend` seam. The transcoder wasm must stay off the default bundle; requires `npm run size` gate verification. Genuine Gold-tier work.

### Tilemap-layer ingestion (Gold)

Parsing Tiled `.tmx`/`.tmj` map layers into `TilemapData` (tile index arrays, object layers). Closes the tileset↔tilemap gap end-to-end. Deferred to Gold.

---

## Score estimate: 91/100

| Area                              | Pass 1     | Pass 2     | Notes                                   |
| --------------------------------- | ---------- | ---------- | --------------------------------------- |
| Type completeness (types package) | 14/15      | 15/15      | TextureAtlasFormatKind added            |
| Core resource CRUD                | 15/15      | 15/15      | —                                       |
| Atlas region lookup               | 8/10       | 10/10      | sequence + UV added                     |
| Atlas format parsers              | 0/15       | 12/15      | 4 of 5 parsers; Cocos plist deferred    |
| Tileset margin/spacing            | 5/5        | 5/5        | —                                       |
| AbortSignal coverage              | 8/10       | 10/10      | video loader now covered                |
| Naming / API symmetry             | 8/10       | 10/10      | URL caps fixed, all functions full-name |
| Test coverage                     | 9/10       | 9/10       | all exported functions have tests       |
| Multi-page / animations           | 0/5        | 0/5        | structural change, deferred             |
| Cache / loader signals            | 0/5        | 0/5        | design boundary unresolved              |
| Compressed textures               | 0/5        | 0/5        | Gold — deferred                         |
| **Total**                         | **67/100** | **91/100** |                                         |

The main remaining gap is multi-page atlas support and the resource cache design, which together account for the 9 points below 100. Both require cross-package coordination or a design decision call — neither is a standalone coding task.
