---
id: resources
title: '@flighthq/resources'
type: depth
target: resources
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/resources.md
  - tools/agents/docs/reviews/depth/resources.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 62/100; a clean resource-handle and loader layer, but not yet an authoritative asset pipeline because atlas-metadata ingestion and tileset richness — the two hard, value-add sub-domains — are missing (atlases load with zero regions, tilesets are bare uniform grids).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that unblocks 80% of real usage: an atlas you load actually has regions, and you can look them up by name.

- **`name` on `TextureAtlasRegion`** (in `@flighthq/types` first): add `name: string | null`. Single highest-leverage change for atlas authoritativeness; `id` (number) stays for index-keyed access.
- **Region lookup** — `getTextureAtlasRegionByName(atlas, name): TextureAtlasRegion | null` and `getTextureAtlasRegionById(atlas, id): TextureAtlasRegion | null`. Sentinel `null` on miss. Linear scan is fine at Bronze; a name→region index map slot on the atlas runtime is a Silver concern.
- **TexturePacker JSON parser (the dominant format)** — `parseTextureAtlasJson(json, out: TextureAtlas): TextureAtlas` covering both the JSON-hash and JSON-array shapes (PixiJS/Phaser default export). Lives in `@flighthq/resource-formats`, not the core package. Populates named regions with trim/rotation fields (see next two items).
- **Trim + rotation fields on `TextureAtlasRegion`** (in `@flighthq/types`): `trimmed: boolean`, `rotated: boolean`, `sourceX/sourceY/sourceWidth/sourceHeight` (the trimmed sub-rect within the original), and `originalWidth/originalHeight`. Without these, no parser output round-trips faithfully. Default to untrimmed/unrotated so existing hand-built regions are unaffected.
- **Paired image+metadata atlas loader** — `loadTextureAtlasWithMetadataFromUrl(imageUrl, dataUrl, crossOrigin?): Promise<TextureAtlas>` — the canonical "load an atlas" call. Composes the existing image loader with `parseTextureAtlasJson`. (Keep it in `@flighthq/resource-formats` since it depends on the parser; the format-free `loadTextureAtlasFromUrl` stays in core.)
- **`margin` + `spacing` on `Tileset`** (in `@flighthq/types`): packing gutters are present in nearly every real tileset export; without them `buildTilesetRegions` cannot slice a standard Tiled/aseprite sheet. Update `buildTilesetRegions` to honor them.
- **`AbortSignal` on the `load*` family** — add an optional trailing `signal?: AbortSignal` to `loadImageResourceFromUrl`, `loadAudioResourceFromUrl`, `loadVideoResourceFromUrl`, `loadFont*`, `loadTextureAtlas*`, `loadTileset*`. Cancellation is table-stakes and the cross-package `@flighthq/loader` needs it to implement batch cancel.
- **Naming cleanup** — reconcile `...FromUrl` (single) vs `...FromURLs` (plural) capitalization. Pre-release, pick one (`...FromUrls`) and rename now; no migration debt to fear.

### Silver

Competitive with PixiJS/Phaser/LibGDX asset handling: the formats artists actually export, the common edge cases, and a content-addressed cache.

- **The atlas-format zoo in `@flighthq/resource-formats`** — `parseTextureAtlasXml` (Starling/Sparrow `<SubTexture>`), `parseTextureAtlasLibGdx` (`.atlas` text), `parseTextureAtlasPlist` (Cocos2d-x), `parseTextureAtlasAseprite` (Aseprite JSON with frame tags). Each takes the format-specific text/object and writes into a `TextureAtlas`. A `detectTextureAtlasFormat(text): TextureAtlasFormatKind | null` sniffer + `parseTextureAtlas(text, out)` dispatcher so callers need not know the format.
- **Multi-image / multi-page atlases** — `TextureAtlas.image` → support an atlas spanning several pages. Add `page` (or an image index) to `TextureAtlasRegion`, and a `pages: ImageResource[]` representation. LibGDX and large TexturePacker exports are multi-page; current single-`image` shape cannot represent them.
- **Animation frame-sequences in atlases** — `getTextureAtlasRegionSequence(atlas, prefix): TextureAtlasRegion[]` (frames named `hero_walk_0001…`), plus named animation tags surfaced from Aseprite/TexturePacker (`getTextureAtlasAnimation(atlas, name): readonly number[]`). This is what makes an atlas drive `@flighthq/spritesheet`.
- **Tiled tileset parser** — `parseTilesetTsj(json, out: Tileset)` and `parseTilesetTsx(xml, out: Tileset)` in `@flighthq/resource-formats`, including `margin`/`spacing`, per-tile properties, and tile-animation frames.
- **Per-tile metadata on `Tileset`** (in `@flighthq/types`): `TilesetTile { id, properties, animation, collision? }` and `tiles: TilesetTile[]` (sparse — only tiles with metadata). `getTilesetTile(tileset, id): TilesetTile | null`, `getTilesetTileProperty(tileset, id, key)`. Custom property bag typed as `Readonly<Record<string, string | number | boolean>>`.
- **Resource cache / registry** — a content-addressed dedup store so two `loadImageResourceFromUrl(sameUrl)` calls share one in-flight promise and one resource. `getCachedResource(key)`, `setCachedResource(key, resource)`, `evictCachedResource(key)`, `clearResourceCache()`. **Surface the boundary decision** with `@flighthq/loader` (see Sequencing) — cache belongs here (content-addressed identity), batch orchestration belongs there.
- **Timeout + retry policy** on `load*` — an options object `{ signal?, timeoutMs?, retries?, retryDelayMs? }` for the URL loaders. Replace the silent `.catch(() => {})` in eager `createAudioResourceFromUrl` with an error surface (an `onError` slot or an `enableResourceSignals`-gated `ResourceLoader` signal group — see next).
- **Loader signals via `enable*`** — wire the existing-but-unused `ResourceLoader` type (`onComplete`/`onError`/`onProgress`) into the load path through an opt-in `enableResourceLoaderSignals(...)` group, so progress/error reporting is available without forcing the signal cost onto bundles that fire-and-forget.
- **Memory accounting** — `getImageResourceByteSize(resource): number` and `getTextureAtlasByteSize(atlas): number` for budgeting. Pure functions over the resource fields.
- **Region geometry helpers** — `getTextureAtlasRegionUv(region, atlas, out: RectangleLike)` (normalized 0–1 UVs accounting for page size + rotation) and `getTextureAtlasRegionBounds(region, out)`. These bridge regions to the renderer/sprite layer and currently force every consumer to recompute UVs by hand.

### Gold

Authoritative reference for the domain: compressed textures, exhaustive format and edge-case coverage, performance, and 1:1 Rust parity.

- **Compressed-texture ingestion** — fill the reserved `compressed` slot. Add `CompressedPixelFormat` (BC1-7 / ASTC / ETC2 / PVRTC) to `@flighthq/types`, a `compressed: { format, data, mipLevels } | null` slot on `ImageResource`, and parsers `parseKtx2`, `parseBasisUniversal` (transcode seam — Basis transcoder is a swappable backend, not bundled), `parseDds`, `parsePkm`. Renderers consume `compressed` directly for GPU upload with no decode. This is the single biggest remaining feature for a production graphics asset pipeline.
- **Transcoder backend seam** — `BasisTranscoderBackend` in `@flighthq/types` with `getBasisTranscoderBackend`/`setBasisTranscoderBackend`/`createWebBasisTranscoderBackend` (wasm transcoder loaded lazily, off the default bundle). Mirrors the platform-capability backend pattern; native hosts and the Rust port supply their own.
- **Mipmap + image-pyramid support** — `generateImageResourceMipmaps`, mip-level representation on `ImageResource`, and ingestion of mip chains from KTX2/DDS.
- **Exhaustive atlas/tileset format coverage** — round-trip _writers_ (`serializeTextureAtlasJson`, `serializeTilesetTsj`) so Flight can export, not just import; LDtk project parser (`parseLdtkProject`) producing tilesets + tilemaps; Spine/DragonBones atlas variants; nine-slice/`borders` metadata on regions (`scale9` grid) which authoritative UI atlases carry.
- **Tilemap-layer ingestion** — extend beyond `Tileset` to parse Tiled `.tmx`/`.tmj` map layers into the `TilemapData` shape (tile index arrays, multiple layers, object layers), closing the gap between "tileset" (the palette) and "tilemap" (the placed grid) end-to-end.
- **Streaming / progressive image decode** — `createImageBitmap` with `resizeQuality`/region options, progressive JPEG and `image/avif` handling, and an `ImageDecoder` (WebCodecs) backend seam for animated formats (animated WebP/AVIF/GIF frame extraction → `TextureAtlasRegion` sequences).
- **Full edge-case + error handling pass** — premultiplied vs straight alpha correctness across all loaders, color-profile/`colorSpace` handling, CORS-tainted-canvas detection surfaced as a sentinel, malformed-metadata recovery (parser returns `null` + partial atlas rather than throwing), and decode-failure surfaces on every `load*`.
- **Performance** — region-name index map cached on the atlas runtime (built lazily, invalidated on region mutation); pooled `TextureAtlasRegion` allocation via `acquire*/release*`; zero-allocation `buildTilesetRegions` (already mostly there) extended to honor metadata; benchmark suite for large-atlas parse + lookup.
- **Tests + docs** — colocated `*.test.ts` per new source file (alias-safe out-param cases for new out-functions), functional/visual coverage proving a parsed atlas renders correctly across backends, parser fixtures for every supported format (real exporter output), and a package-level guide documenting the core ↔ `resource-formats` ↔ `@flighthq/loader` boundary.
- **1:1 Rust parity** — mirror every type and function into the existing `flighthq-resources` crate (and a `flighthq-resource-formats` crate for the parsers), with assertion-ported unit tests and parser fixtures shared with TS. Format parsers are pure value-in/value-out leaves — an ideal conformance and _mixing_ target (deterministic, no GPU, headlessly fingerprint-able). Record any intentional TS↔Rust divergence in the conformance map. Note the native default for image/audio/font decode differs from the web `*Backend` (std/native decoders vs browser elements) — capture that in the backend seam, native-first.

## Sequencing & effort

**Recommended order** (each tier is cumulative; within Bronze the items are roughly dependency-ordered):

1. **Types first, always.** Land `name`, trim/rotation, and `margin`/`spacing` field additions in `@flighthq/types` before any implementation — these are the header changes the rest depends on. Cheap, unblocking, low-risk (additive, defaulted).
2. **Bronze region lookup + TexturePacker JSON parser.** This is the headline gap. Create the `@flighthq/resource-formats` neighbor package here (copy shape from a nearby package, run `npm run packages:check`). Medium effort, high value — this single deliverable moves the verdict toward "authoritative."
3. **Bronze loader robustness** (`AbortSignal`, naming cleanup). Small, mechanical; do alongside (2).
4. **Silver formats + multi-page + cache.** The format zoo is parallelizable (one parser per file, each independently testable with exporter fixtures). Multi-page atlas is the one structural change in Silver — it touches `TextureAtlas`/`TextureAtlasRegion` shape, so settle it early in Silver before parsers proliferate against the single-page assumption. Largest sustained effort of the roadmap.
5. **Silver tileset richness + signals + accounting.** Independent of the atlas work; can proceed in parallel.
6. **Gold compressed textures first** (highest remaining production value), then format writers/LDtk/Tiled-map, then streaming/perf/Rust parity.

**Cross-package / design-decision items to surface:**

- **Cache ownership boundary (`@flighthq/loader` vs here).** The depth review flags this as "plausibly missing-by-design." Decide explicitly before building the Silver cache: content-addressed resource identity/dedup belongs in `resources`; batch queue/progress orchestration stays in `@flighthq/loader`. Document the seam in both packages. This is a design decision, not autonomous work — raise it.
- **`@flighthq/resource-formats` package split.** Confirm the "-formats" neighbor is the right boundary (it is, by the house pattern — parsers carry format-specific weight that must not enter the tree-shakable core). Decided here but worth one confirmation, since it sets up where every Silver/Gold parser lands.
- **Multi-page atlas shape change.** Touches the `TextureAtlas`/`TextureAtlasRegion` types in the header and any downstream sprite/spritesheet consumers. Pre-release there is no migration cost, but it ripples — coordinate with `@flighthq/sprite` and `@flighthq/spritesheet` owners before landing.
- **Animation/frame-sequence ownership.** Atlas frame tags feed `@flighthq/spritesheet`/`@flighthq/timeline-spritesheet`. Decide whether the _sequence grouping_ lives in `resources` (region-naming convention) or is consumed raw by spritesheet. Cross-package — surface rather than decide unilaterally.
- **Transcoder/decoder backend seams** (Gold) follow the platform-capability `*Backend` pattern and belong type-first in `@flighthq/types`; the wasm transcoder must stay off the default bundle (verify with `npm run size`).
- **Checkpoints:** run `npm run packages:check` when adding `resource-formats`, `npm run exports:check` after each new exported function (colocated test required), `npm run order:fix` for alphabetization, `npm run api` after public API changes, and `npm run size` after any export/barrel/dependency change to confirm the parser package and (Gold) transcoder do not leak into core bundles.

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

> Build `@flighthq/resources` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
