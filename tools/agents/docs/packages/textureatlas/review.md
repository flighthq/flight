---
package: '@flighthq/textureatlas'
status: partial
score: 45
updated: 2026-07-03
ingested:
  - source
  - tests
---

# textureatlas — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/textureatlas.md)._

**Domain:** Texture atlas data model for a graphics SDK — packed-region metadata over an atlas image: region records (rect, rotation, trim, pivot), lookup/query, UV computation, and atlas construction from image sources.

**Verdict:** partial — completeness 45/100

The package (extracted from the dissolved `resources` package) exports a clean, well-tested core: `createTextureAtlas`, four `createTextureAtlasFrom*` wrappers, four async `loadTextureAtlasFrom*` loaders, region add/create/set helpers, three query functions, a UV computer, and a byte-size accessor. Everything present is correct, alias-safe where it should be, and shaped exactly per the SDK conventions. The `TextureAtlasRegion` type is genuinely complete for single-page atlases — `rotated`, `trimmed`, `sourceX/Y`, `originalWidth/Height`, and nullable pivot cover the full TexturePacker/Starling/libGDX feature set. But measured against libGDX's `TextureAtlas`, PixiJS's `Spritesheet`/texture frames, or Phaser's texture manager, the model stops at one image and one flat array: no multi-page atlases, no nine-slice metadata, no indexed lookup, no region mutation/removal beyond `push`, and no draw-placement math for trimmed/rotated regions.

## Present capabilities

- **Entity lifecycle:** `createTextureAtlas(obj?)` (image + regions array), `createTextureAtlasRegion(obj?)` with full defaulted fields, `getTextureAtlasByteSize` (delegates to `getImageResourceByteSize`, 0-sentinel when image is null).
- **Construction:** `createTextureAtlasFromCanvas` / `FromImageBitmap` / `FromImageElement` / `FromImageResource`, plus async `loadTextureAtlasFromBase64` / `FromBlob` / `FromBytes` / `FromUrl` — a complete mirror of `@flighthq/image`'s source surface, with `AbortSignal` support throughout.
- **Region authoring:** `addTextureAtlasRegion` (scalars), `addTextureAtlasRegionRectangle` (`RectangleLike` + optional `Vector2Like` pivot), `addTextureAtlasRegionRectangleXY` (corner pair), `addTextureAtlasRegionVector2` (two `Vector2Like` corners), `setTextureAtlasRegion` (in-place mutation of x/y/width/height/pivot).
- **Queries:** `getTextureAtlasRegionById`, `getTextureAtlasRegionByName` (documented case-sensitive linear scan), `getTextureAtlasRegionSequence` (prefix match, insertion order — the `walk_NNN` animation-frames idiom).
- **UV math:** `getTextureAtlasRegionUv(region, imageWidth, imageHeight, out)` — out-param, alias-safe (reads inputs into locals first), zero-rect sentinel on zero dimensions, rotated-region semantics documented in a durable comment.

Tests are thorough for the surface that exists: defaults, pre-set values, hidden-class notes, sentinel paths, alias behavior, sequence ordering. Types (`TextureAtlas`, `TextureAtlasRegion`, `TextureAtlasRegionLike`) live in `@flighthq/types`, header-first, as required.

## Gaps vs an authoritative texture-atlas library

Compare libGDX `TextureAtlas`, PixiJS `Spritesheet`, Phaser `TextureManager`, Starling's atlas class:

- **Multi-page / multipack atlases.** `TextureAtlas.image` is a single nullable `ImageResource`. TexturePacker multipack, libGDX multi-page `.atlas` files, and any 4K-budget production pipeline emit multiple pages with each region bound to a page index. There is no `pages` concept and no `pageIndex` on `TextureAtlasRegion`; the libGDX parser in `textureatlas-formats` silently concatenates all pages into one image-less region list, losing which image each region samples from. This is the single largest structural gap.
- **Nine-slice / nine-patch metadata.** libGDX regions carry `split` and `pad` values (from `.9` sources); TexturePacker exports borders for scale-9. Nothing on `TextureAtlasRegion` can represent a nine-slice region, so UI atlas workflows have no home.
- **Indexed lookup.** Every query is a documented linear scan. An authoritative atlas offers an O(1) name→region index (built explicitly, per the SDK's no-hidden-work rule — e.g. `buildTextureAtlasRegionIndex` / a runtime-slot cache) once atlases hit hundreds of regions.
- **Region management is append-only.** No `removeTextureAtlasRegion`, no `clearTextureAtlasRegions`, no rename; `addTextureAtlasRegion` assigns `id = regions.length`, so ids silently collide after any manual splice. `setTextureAtlasRegion` only writes 6 of the 14 fields (and coerces pivot `null → 0`), leaving `rotated`/`trimmed`/`source*`/`original*`/`name`/`id` stale — a partial setter that is easy to misuse.
- **Draw-placement math.** `getTextureAtlasRegionUv` covers sampling, but there is no companion computing where the trimmed rect sits inside the original frame for drawing (`getTextureAtlasRegionFrame(region, out)` from `sourceX/Y` + `originalWidth/Height`), and no rotated-UV quad helper (four UV corners for a `rotated` region) — every renderer or user re-derives both.
- **libGDX-style index queries.** `findRegion(name, index)` — name plus ordinal — is the canonical animation lookup; here the libGDX parser bakes the index into the name (`walk_3`), which works but makes the ordinal unrecoverable as data.
- **No teardown.** No `disposeTextureAtlas` releasing the image reference/regions, even though `@flighthq/image` has a dispose story. Minor, but the entity quartet is incomplete.
- **Counting/predicates:** `getTextureAtlasRegionCount`, `hasTextureAtlasRegion(atlas, name)` — trivial but expected surface.
- Runtime atlas *packing* (maxrects/skyline) is missing-by-design — the packages register marks `atlas-packer` as a future bedrock package — and is not counted against this package.

## Naming / API-shape notes

- Naming discipline is excellent: every export carries the full `TextureAtlas`/`TextureAtlasRegion` type word, `create*`/`load*`/`add*`/`get*`/`set*` verbs are used correctly, `out` params and `Readonly<>` inputs follow the constraints, sentinel returns (`null`, `0`) are used instead of throws.
- `getTextureAtlasRegionUv` returning `RectangleLike` for chaining while writing to `out` is the house style; good.
- `setTextureAtlasRegion(out, x, y = 0, ...)` — defaulting everything after `x` to `0` is an odd signature (a caller passing only `x` is surely a bug); requiring all four rect values would be safer. Its pivot default of `0` also disagrees with `createTextureAtlasRegion`'s `null`, so the same "no pivot" intent round-trips differently.
- `addTextureAtlasRegionRectangleXY` — the `XY` suffix abbreviates "corner coordinates" and is the one name in the package that needs explanation; `addTextureAtlasRegionCorners` would self-identify.
- The package.json description still says "Texture atlases and tilesets: …" though tilesets now live in `@flighthq/tileset` — stale text from the extraction.

## Recommendation

The bones are right; grow the data model to production-atlas reality. Priority order: (1) multi-page support — `pages: ImageResource[]` (or a `TextureAtlasPage` entity carrying size + image) plus `pageIndex` on `TextureAtlasRegion`, threaded through the formats package; (2) draw-placement helpers (`getTextureAtlasRegionFrame`, rotated-UV quad writer) so renderers stop re-deriving trim/rotation math; (3) nine-slice fields (`splits`/`pads` or a nullable `TextureAtlasRegionNineSlice`); (4) region management symmetry (`removeTextureAtlasRegion`, `clearTextureAtlasRegions`, a full-field `setTextureAtlasRegion`, stable id allocation) and an explicit name-index builder; (5) `disposeTextureAtlas` + count/has predicates. With multipage and placement math in place this moves to solid; without them it remains a well-made single-page subset.
