---
package: '@flighthq/textureatlas-formats'
status: partial
score: 50
updated: 2026-07-03
ingested:
  - source
  - tests
---

# textureatlas-formats — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/textureatlas-formats.md)._

**Domain:** Texture-atlas descriptor format interchange — parsing (and, in a mature library, writing) the industry atlas metadata formats (TexturePacker JSON, Starling/Sparrow XML, libGDX/Spine `.atlas`, Aseprite JSON, Cocos plist, …) into the SDK's `TextureAtlas` region model.

**Verdict:** partial — completeness 50/100

The package (successor to the dissolved `resource-formats`) ships four parsers — TexturePacker JSON (hash + array), Aseprite JSON (hash + array), Starling/Sparrow XML, and libGDX/Spine text — plus a structural sniffer `detectTextureAtlasFormat`. What exists is well built: typed schema modules with field names as-exported and reference links, correct rotated/trimmed handling (including the TexturePacker rotated w/h swap and Starling's negated `frameX/Y`), document-object convenience variants that avoid a redundant `JSON.parse`, and solid tests. But the layer is read-only (its sibling `spritesheet-formats` has serializers for every format; this package has none), it has no registry/umbrella dispatch even though the old `resource-formats` had `registerTextureAtlasFormat`, and `TextureAtlasFormatKindCocosPlist` is declared in `@flighthq/types` with no parser behind it — the Cocos plist geometry parser lives only in `spritesheet-formats`, breaking the "geometry is owned here" layering for exactly one format.

## Present capabilities

- **TexturePacker JSON:** `parseTextureAtlasPackerJson` / `parseTextureAtlasPackerDocument` — hash and array variants, pivot, rotation (with the packed-rect w/h transpose), trim → `sourceX/Y` + `original*`, optional `stripPathPrefix` name normalization. Schema in `textureAtlasPackerSchema.ts` including `frameTags` in `meta`.
- **Aseprite JSON:** `parseTextureAtlasAsepriteJson` / `parseTextureAtlasAsepriteDocument` — hash and array variants; schema models `frameTags` (with `direction` including `pingpong_reverse`), per-frame `duration`, layers omitted by design (animation is `spritesheet-formats`' layer).
- **Starling/Sparrow XML:** `parseTextureAtlasStarlingXml` over `@flighthq/xml` — `SubTexture` rects, `frameX/Y/Width/Height` trim (correctly negated into `sourceX/Y`), `rotated`, source-space `pivotX/Y`, tolerant of the `TextureAtlas` element being root or child.
- **libGDX/Spine text:** `parseTextureAtlasLibgdxAtlas` — hand-rolled line parser handling page headers, `xy`/`size`/`orig`/`offset`/`rotate`/`index`, multi-page files (regions concatenated), index folded into the name as `name_index`, trim inferred from `orig` vs `size`.
- **Detection:** `detectTextureAtlasFormat` — structural (never extension-based), disambiguates Aseprite vs TexturePacker via `meta.app` with a per-frame-`duration` fallback, `null` sentinel on unknown/corrupt input, never throws.

All parsers clear `atlas.regions` and return the atlas for chaining; all are pure functions of their input. `spritesheet-formats` correctly delegates its TexturePacker/Aseprite/Starling/libGDX geometry to this package and layers animation metadata on top — the intended two-tier split works for four of five formats.

## Gaps vs an authoritative atlas-format library

Compare TexturePacker's own exporter matrix, libGDX's `TextureAtlas.TextureAtlasData`, PixiJS/Phaser loader format support:

- **No serialization.** A formats package should round-trip. `spritesheet-formats` exports `serializeTexturePackerSpritesheet`, `serializeStarlingSpritesheet`, `serializeAsepriteSpritesheet`, `serializeCocosPlistSpritesheet`; this package exports zero `serializeTextureAtlas*` functions. Atlas-editing tools, repacking pipelines, and the future `atlas-packer` package all need writers at this layer.
- **Cocos plist is declared but absent.** `TextureAtlasFormatKindCocosPlist` exists in `@flighthq/types`, `detectTextureAtlasFormat` does not detect it, and the only plist parser (`parseCocosPlistSpritesheet`) lives in `spritesheet-formats` doing its own geometry — the one format where the geometry/animation layering is inverted. Duplication risk realized.
- **No registry / umbrella parse.** `spritesheet-formats` has the full open-registry pattern (`registerSpritesheetFormat`, `getSpritesheetFormat`, `parseSpritesheet(text, kind?)`); this package has only the sniffer. Missing: `registerTextureAtlasFormat`, `getTextureAtlasFormat`, and a `parseTextureAtlas(content, atlas, kind?)` dispatcher — the SDK's own registry-over-switch constraint, and a regression from `resource-formats` which had the registry. `detectTextureAtlasFormat` being a closed hardcoded function (rather than iterating registered `detect` entries) also means user-registered formats could never participate in sniffing.
- **Multipack is dropped, not modeled.** TexturePacker multipack emits one JSON per page plus `meta.related_multi_packs`; libGDX `.atlas` files carry multiple pages with per-page image names, filters, and repeat modes. The libGDX parser discards the page image filename entirely and concatenates regions; the TexturePacker schema omits `related_multi_packs`. Blocked upstream by `TextureAtlas` being single-image, but the format layer should at least surface page names (e.g. a parsed-pages result or options callback) instead of silently losing them.
- **Meta is unused.** `meta.image`, `meta.size`, and `meta.scale` are parsed into the schemas but never applied — no image-filename return for loaders to fetch the page bitmap, no scale handling (TexturePacker `scale: 0.5` atlases need coordinate rescaling or at least an exposed value).
- **Dropped format families an authoritative library covers:** Spine's newer `.atlas` 4.x keys (`bounds`/`offsets` shorthand), Unity sprite atlas, Egret/LayaAir JSON, Godot `.tres`, generic grid descriptors, XML plist variants (Zwoptex). Not all are must-haves, but TexturePacker-multipack + Cocos + Spine-4 are table stakes.
- **libGDX nine-patch keys ignored:** `split:` and `pad:` lines are silently skipped (no schema/field to receive them) — pairs with the missing nine-slice fields on `TextureAtlasRegion`.
- **Starling options wart:** `TextureAtlasStarlingParseOptions` (`imageWidth`/`imageHeight`) is accepted as `_options` and completely ignored — dead API surface that promises UV support it does not deliver.
- **Schema duplication with `spritesheet-formats`:** `textureAtlasPackerSchema.ts` / `textureAtlasAsepriteSchema.ts` and `spritesheet-formats`' `texturePackerSchema.ts` / `asepriteSchema.ts` define near-identical document interfaces twice, and each package carries its own detection heuristics for the same five formats (`detectTextureAtlasFormat` vs the private `detectTexturePacker`/`detectAseprite`/… in `spritesheetDetect.ts`). The parse *code* delegates correctly; the *types and sniffers* did not follow.

## Naming / API-shape notes

- `parseTextureAtlasPackerJson` — "Packer" is an abbreviation of the product name TexturePacker, collapsed to dodge the `TextureAtlasTexturePacker` stutter. It violates the never-abbreviate rule and disagrees with both the kind value (`'texturePacker'`) and the sibling package (`parseTexturePackerSpritesheet`). If the stutter is unacceptable, the format word should still be whole (`parseTexturePackerAtlasJson` or accept `parseTextureAtlasTexturePackerJson`); a reader searching "TexturePacker" today misses these functions.
- Inconsistent parse-target convention with `spritesheet-formats`: these parsers populate a caller-supplied `atlas` (out-param style, good for reuse), while spritesheet parsers allocate and return `SpritesheetData`. Fine individually, but the asymmetry between the two formats packages is unexplained.
- `atlas.regions.length = 0` mutation + return-for-chaining, `null` sentinels in detection, schemas as `interface`-only modules, `import type` discipline, and structural detection are all correct per house rules. Test files exist per source file including the schema modules' behavior via the parsers.
- `parseTextureAtlasAsepriteJson` calls `JSON.parse` unguarded — a corrupt string throws instead of returning a sentinel, while `detectTextureAtlasFormat` carefully catches. The parse functions should state (or share) one failure posture; `parseTextureAtlasPackerJson` has the same property.

## Recommendation

Finish the layer in four moves. (1) **Adopt the registry pattern** from `spritesheet-formats`: `registerTextureAtlasFormat(kind, { detect, parse })`, `getTextureAtlasFormat`, and `parseTextureAtlas(content, atlas, kind?)`, with `detectTextureAtlasFormat` iterating the registry — restoring what `resource-formats` had and letting `spritesheet-formats` reuse the detectors instead of duplicating them. (2) **Move Cocos plist geometry here** (`parseTextureAtlasCocosPlist` + schema) and make `spritesheet-formats` delegate, closing the one inverted format and backing the already-declared kind constant. (3) **Add serializers** (`serializeTextureAtlas*` for TexturePacker JSON, Starling XML, libGDX text at minimum) so the package round-trips. (4) **Surface page/meta data** — return or expose parsed page image names, sizes, and scale (and accept libGDX `split`/`pad` once the region type can hold them), so multipack support has somewhere to land when `TextureAtlas` grows pages. The parsing quality is already there; the package is half of a formats library — the reading half.
