# Depth Review: @flighthq/resources

**Domain:** Resource primitives and loading — backend-agnostic descriptors and loaders for the asset types a graphics SDK consumes: images, fonts, audio, video, texture atlases, and tilesets.

**Verdict:** solid — **62/100**

The package is a clean, well-shaped _resource-handle and loader_ layer. It covers every asset type its description names, with a consistent and unusually complete matrix of source/loader entry points (URL / URLs-with-format-negotiation / ArrayBuffer / Blob / Base64 / element / bitmap / canvas) per asset. As a "wrap a browser asset into a versioned, backend-agnostic resource entity" library it is genuinely strong. It falls short of _authoritative_ because the two genuinely hard, value-add domains a mature resource library is expected to own — texture-atlas metadata parsing and tilemap/tileset richness — are present only as bare geometric grids, with no metadata ingestion, no named-region lookup, and no tile properties.

## Present capabilities

Per-asset coverage is broad and symmetric, which is the package's strongest quality:

- **ImageResource** — the most developed type. Dual representation (`source` element + raw CPU `data`), monotonic `version` with `invalidateImageResource`, `alphaType`/`format` (`rgba8unorm`) fields, `cloneImageResource` (identity over shared pixels), `disposeImageResource`, and predicates `hasImageResourceData` / `hasImageResourceSource` / `isImageResourceEmpty`. Loaders: URL (with `crossOrigin`), ArrayBuffer, Blob, Base64, and element/bitmap/canvas constructors. Includes a real `detectImageMimeType` (PNG/JPEG/GIF/WebP/BMP magic-byte sniff) and `isImageResourceSameOrigin`. The type doc even reserves a `compressed` slot for KTX2/Basis. This sub-area is solid.
- **Font / FontResource** — `FontFace`-backed loaders from ArrayBuffer, URL, name (CSS-registered), and multi-source URLs with format negotiation (`woff`/`woff2`/`truetype`/`opentype`/`embedded-opentype`/`svg` inference). Split `Font` (named handle) vs `FontResource` (`FontFace` carrier).
- **AudioResource** — `AudioBuffer`-backed, `getAudioContext()` singleton accessor, eager (`create*FromUrl`) and awaitable (`load*FromUrl`) variants, plus `*FromURLs` with `canPlayType` codec negotiation and extension→MIME inference (mp3/ogg/wav/aac/flac/webm/m4a).
- **VideoResource** — `HTMLVideoElement` carrier, URL and multi-source URL constructors/loaders.
- **TextureAtlas / TextureAtlasRegion** — atlas = image + region array; region carries `x/y/width/height/id/pivotX/pivotY`. Rich region-add ergonomics: `addTextureAtlasRegion`, `...Rectangle`, `...RectangleXY` (corner-pair), `...Vector2`, plus `createTextureAtlasRegion` / `setTextureAtlasRegion` (out-param, alias-safe). Atlas constructors from canvas/bitmap/element/ImageResource and loaders from URL/ArrayBuffer/Blob/Base64.
- **Tileset** — grid model (`tileWidth/tileHeight/rows/columns/atlas`) with `buildTilesetRegions` (generates regions from the grid, reusing existing region objects) and `createTilesetFromAtlas` / `...FromImageResource` (auto-computes rows/columns) plus the full loader matrix.

The entity/runtime + free-function + out-param conventions are followed consistently; loaders return sentinels/best-effort and the eager-vs-awaitable split is a deliberate, useful pattern.

## Gaps vs an authoritative resource library

The omissions cluster in exactly the parts that distinguish a real asset pipeline from a thin wrapper:

- **No atlas metadata ingestion.** This is the biggest gap. A mature texture-atlas library reads the formats artists actually export: TexturePacker JSON (hash + array), Starling/Sparrow XML, LibGDX `.atlas`, Cocos plist, Aseprite JSON. Here `loadTextureAtlasFrom*` only loads the _image_ and produces an atlas with **zero regions** — the caller must hand-build every region. There is no `parseTextureAtlas*` for any sidecar format, and no paired image+metadata loader (the canonical "load atlas" call in OpenFL/PixiJS/Phaser).
- **No named regions and no region lookup.** Regions have a numeric `id` but no `name` field, and there is no `getTextureAtlasRegion(atlas, name|id)`. Frame-by-name lookup is table-stakes for atlas usage (`atlas.getRegion("hero_walk_01")`); its absence forces index bookkeeping on the caller.
- **No trim/rotation support in atlas regions.** Authoritative atlas formats pack with whitespace trimming (source rect + frame offset + original size) and 90° rotation. `TextureAtlasRegion` has only `x/y/w/h/pivot` — no `trimmed`/`sourceRect`/`originalSize`/`rotated`. This makes the type unable to round-trip any real packer output even once a parser exists.
- **Tileset is geometry-only.** A canonical tileset (Tiled `.tsx`/`.tsj`, LDtk) carries per-tile properties, named tiles, animation frames, collision shapes, margin, and spacing. Here there is no `margin`/`spacing` (so grids with packing gutters can't be expressed), no per-tile metadata, and no tile-animation. It is a uniform-grid slicer, not a tileset library.
- **No resource cache / registry.** There is no keyed store (`getResource(key)` / dedup of in-flight loads). Two `loadImageResourceFromUrl` calls for the same URL fetch twice. The cross-package `@flighthq/loader` owns batch orchestration, but a mature resource library typically also owns a content-addressed cache — this is plausibly missing-by-design given the package split, but worth noting.
- **No retry / timeout / abort.** Loaders take no `AbortSignal`, no timeout, no retry policy. The eager `createAudioResourceFromUrl` swallows errors silently (`.catch(() => {})`), which is intentional for fire-and-forget but leaves no error surface.
- **No compressed-texture path.** The `compressed` slot is reserved in the type but unimplemented — no KTX2/Basis/DDS ingestion, no `format` values beyond `rgba8unorm` exercised.
- **No memory accounting.** No `getImageResourceByteSize` or equivalent; resource libraries often expose footprint for budgeting.
- **`ResourceLoader` type is defined in `@flighthq/types` but unused here** — the package exposes no progress/aggregate-loader surface itself (again likely delegated to `@flighthq/loader`).

## Naming / API-shape notes

- Naming is excellent and on-spec: fully unabbreviated type words (`createImageResourceFromImageBitmap`), `has*`/`is*` predicates, `dispose*` vs (deferred) `destroy*` distinction respected (GPU texture teardown explicitly noted as renderer-owned), out-param `setTextureAtlasRegion`.
- Minor inconsistency: `...FromUrl` (single) vs `...FromURLs` (plural) capitalizes "URL" differently. Intentional-looking but reads oddly side by side.
- The eager `create*From*` (returns immediately, populates later) vs awaitable `load*From*` split is a clean, deliberate convention and well worth keeping.
- `TextureAtlasRegion.id` as a number rather than a name is the API decision most worth revisiting — adding an optional `name` is the single highest-leverage change for atlas authoritativeness.
- `buildTilesetRegions` mutating `atlas.regions` in place (reusing region objects) is a nice allocation-conscious touch consistent with house style.

## Recommendation

Treat this as a **solid resource-handle layer that is not yet an authoritative asset pipeline**. To reach AAA for the domain, prioritize in order:

1. **Atlas metadata parsing** — add `parseTextureAtlas` for at least TexturePacker JSON (hash + array) and a paired `loadTextureAtlasWithMetadata(imageUrl, dataUrl)`. This is the defining feature of an atlas library and its absence is the main thing keeping the verdict below "authoritative".
2. **Named regions + lookup** — add `name` to `TextureAtlasRegion` and `getTextureAtlasRegion(atlas, name)` / `...ById`.
3. **Trim + rotation fields** on `TextureAtlasRegion` (`sourceRect`, `originalSize`/offset, `rotated`) so regions can faithfully represent packer output.
4. **Tileset richness** — `margin`/`spacing`, optional per-tile properties and tile-animation, and a Tiled `.tsj` parser.
5. Add `AbortSignal`/timeout to the `load*` family and an optional dedup cache, and decide explicitly whether caching belongs here or in `@flighthq/loader` (document the boundary).

The bones are good and the conventions are right; the gaps are additive feature work in two well-understood sub-domains (atlas + tilemap), not structural rework.
