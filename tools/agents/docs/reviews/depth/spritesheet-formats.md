# Depth Review: @flighthq/spritesheet-formats

**Domain**: Import/export of sprite-atlas / spritesheet descriptor files from industry-standard authoring and packing tools — a format-interop layer that maps third-party atlas files to and from Flight's internal `SpritesheetData`.

**Verdict**: solid — 68/100

The package does its core job well for the three formats it claims, with a clean, symmetric, and genuinely round-trip-capable API. It falls short of "authoritative" only because the universe of spritesheet/atlas formats a mature interop library is expected to cover is meaningfully larger than three, and a couple of supported formats are parsed with shortcuts that limit robustness.

## Present capabilities

Three formats, each with a consistent five-piece surface (schema types, light parse, document parse, serialize, tests):

- **Texture Packer JSON** — both the Hash (dict-keyed `frames`) and Array (`filename`-per-entry) variants; `meta.frameTags` → animations; pivot, `rotated`, `trimmed`, `spriteSourceSize` → offsets, numeric-or-string `scale`. Serialize infers/overrides variant and reconstructs `trimmed`.
- **Aseprite JSON** — Hash and Array variants; per-frame `duration` is the standout, correctly folded into `animation.frameDurations` only when non-uniform (and written back on serialize so durations survive a reload); `frameTags` with `direction`; `layers`/tag `color` preserved through the round-trip `existing` document but not modeled in `SpritesheetData`.
- **Starling / Sparrow XML** — `SubTexture` attributes including `frameX/Y/Width/Height` (trim), `pivotX/Y` (absolute → normalized), `rotated`; animations inferred from the `baseName_NNN` naming convention; configurable default `frameDuration`.

Cross-cutting strengths:

- Clean two-tier API per format: a single-pass `parseFooSpritesheet(...) → SpritesheetData` and a `parseFooSpritesheetDocument(...) → { data, document }` that retains the original document so `serializeFooSpritesheet(data, existing)` can preserve fields that do not round-trip through `SpritesheetData` (app string, format, layer list, tag colours, scale). This "lossy data / lossless document" split is a thoughtful, correct design for format interop.
- `Readonly<SpritesheetData>` inputs, free functions, no hidden state, `sideEffects: false`. Fits the SDK style precisely.
- Solid test depth (877 lines across 3 files), with explicit round-trip serialize tests per format.

## Gaps vs an authoritative spritesheet-format library

The single biggest gap is **breadth of supported formats**. A canonical atlas-interop library (libgdx, Phaser's atlas parsers, Pixi's loaders, OpenFL/Starling tooling, Cocos) collectively reads/writes a much larger set. Notably absent:

- **libGDX / Spine `.atlas`** (the `pack.atlas` text format: `size`, `format`, `filter`, `repeat` page headers; `rotate`, `xy`, `size`, `orig`, `offset`, `index` regions; multi-page atlases). This is arguably the most ubiquitous open atlas format and its omission is the largest hole.
- **JSON-Array vs JSON-Hash are covered, but not the broader Texture Packer export family**: Phaser 3 multi-pack, Phaser/Pixi `multipack` (`meta.related_multi_packs`), the `pixi.js` / `phaser` exporter presets' polygon trim data (`meta` triangulation / `vertices` / `verticesUV` for mesh-trimmed sprites). Polygon/mesh trim is entirely unmodeled.
- **Cocos Creator `.plist`** (Apple plist XML atlas — `frames`/`metadata`/`textureFileName`, `spriteOffset`, `spriteSourceSize`, `textureRect`, `spriteTrimmed`, `textureRotated`). The cocos/SpriteFrame plist is a recognized standard absent here.
- **Unity sprite atlas / Spritesheet metadata** and **GodotTextureAtlas (`.tres`)** — secondary but expected in an exhaustive set.
- **Generic grid slicing** (uniform NxM grid → frames with margin/spacing) — the simplest and most common "spritesheet without a descriptor" case has no helper here at all; it is a canonical convenience an authoritative library always provides.

Robustness gaps within the formats that _are_ supported:

- **Starling XML uses a regex parser**, not a real XML parse. It will mis-handle attribute order edge cases it doesn't expect, single-quoted attributes (`name='x'`), entity-escaped values (`&amp;`, `&quot;` in names/paths), comments, namespaced/extra elements, and CDATA. For an "industry-standard format" import path this is a correctness liability, not just a stylistic one.
- **Starling import discards image dimensions** (`imageWidth/Height` hard-coded to 0) because the Starling format genuinely lacks them — but there is no option to supply or infer them, leaving consumers with a partially-populated `SpritesheetData`.
- **No validation / error reporting.** Malformed input either throws raw `JSON.parse` errors or silently produces empty/garbage data (e.g. missing `meta.size`, missing required attributes). An authoritative importer typically offers a tolerant mode and/or structured diagnostics (which frame failed, which field was missing).
- **No format auto-detection** (`detectSpritesheetFormat(text) → 'texturePacker' | 'aseprite' | 'starling' | ...`) and **no umbrella `parseSpritesheet(text)`** dispatcher. Callers must already know the format. A mature library offers sniffing.
- **Texture Packer/Aseprite `frameTags` direction values** are passed through to `animation.direction`, but `pingpong_reverse` handling and reverse-range semantics are not normalized/validated against what the spritesheet animator expects.
- **Animation `frameDuration` for Texture Packer is hard-coded to 100ms** — TP frame tags carry no duration, which is correct, but there is no option to override it (Starling exposes `frameDuration`; TP does not, an asymmetry).

## Naming / API-shape notes

- Naming is strong and consistent: `parseFooSpritesheet` / `parseFooSpritesheetDocument` / `serializeFooSpritesheet`, full unabbreviated type words, alphabetized exports. This matches the SDK's design constraints cleanly.
- The `(data, existing?, options?)` serialize signature with an `existing` document for lossless round-trips is a good, discoverable pattern and is symmetric across all three formats.
- Minor asymmetry: Starling exposes `StarlingParseOptions.frameDuration` but Texture Packer and Aseprite parse take no options object. If grid-slicing or duration overrides were added, a uniform `ParseOptions` per format would tidy this.
- The package description names exactly three formats, so the _labeled_ scope is honest — but the project's "AAA completeness" rule judges against the domain, not the label, and the domain is broader.

## Recommendation

Treat this as a **solid foundation that is two or three formats short of authoritative**. To reach AAA for "spritesheet formats":

1. Add **libGDX/Spine `.atlas`** (text, multi-page) — highest-value missing format.
2. Add **Cocos/`.plist`** atlas import/export.
3. Add a **generic grid-slice** helper (`parseGridSpritesheet(cols, rows, {margin, spacing, frameWidth, frameHeight})`) — the most common descriptor-less case.
4. Add **format auto-detection** + an umbrella `parseSpritesheet(text)` dispatcher.
5. Replace the **Starling regex XML parser** with a real (small) XML parse, or harden it against quotes/entities/comments, and add structured parse diagnostics.
6. Model **polygon/mesh trim** data (Texture Packer Pixi/Phaser presets) if the sprite renderer supports mesh sprites.

These are additive and tree-shakable; none disturb the existing clean per-format shape. The existing code is missing-by-omission (more formats), not missing-by-design — nothing in the SDK style precludes the broader set.
