---
package: '@flighthq/textureatlas-formats'
status: partial
score: 62
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# textureatlas-formats — Review

**Verdict:** partial — 62/100. Four solid parsers, a clean registry/dispatch layer, good detection disambiguation, and thorough tests. Still read-only (no serializers), still missing the declared Cocos plist format, still discards page/meta data, and the Starling options are dead surface.

## Present capabilities

### Format registry and dispatch

The package now implements the full open-registry pattern using `@flighthq/registry` `KeyedTable`:

- **`registerTextureAtlasFormat(kind, { detect, parse })`** — binds a custom format for detection and parsing. Last-write-wins; vendor-prefixed kinds recommended.
- **`unregisterTextureAtlasFormat(kind)`** — removes a format binding.
- **`getTextureAtlasFormat(kind)`** — returns the detect/parse entry for a kind, or `null`.
- **`getTextureAtlasFormatKinds()`** — sorted snapshot of all bound kinds.
- **`parseTextureAtlas(content, atlas, formatKind?, options?)`** — auto-detect-and-parse dispatcher. Returns `atlas` on success, `null` on unrecognised content (sentinel, never throws). Accepts an explicit `formatKind` to skip detection.
- **`detectTextureAtlasFormat(content)`** — iterates the registry's detectors in registration order; returns the matching `TextureAtlasFormatKind` or `null`.

Built-in formats are lazily seeded on first registry access, not at import time, preserving `"sideEffects": false`. The four built-in detectors are mutually exclusive by construction (the test suite proves this with a corpus-level exclusivity assertion in `textureAtlasDetect.test.ts`), so detection is order-independent for the built-ins.

### Parsers

All parsers clear `atlas.regions` before populating, return `atlas` for chaining, use `createTextureAtlasRegion` from `@flighthq/textureatlas/contract`, and guard against partial documents (missing `frame`, `sourceSize`, `spriteSourceSize` are handled with fallback rather than throwing).

- **TexturePacker JSON** (`textureAtlasPackerParse.ts`): `parseTextureAtlasPackerJson(json, atlas, options?)` and `parseTextureAtlasPackerDocument(doc, atlas, options?)`. Hash and array frame shapes. Pivot, rotation (with the packed w/h swap: `width = rotated ? frame.h : frame.w`), trim with `sourceX/Y` and `originalWidth/Height`. Optional `stripPathPrefix` name normalization. JSON.parse failure returns atlas unchanged (sentinel).
- **Aseprite JSON** (`textureAtlasAsepriteParse.ts`): `parseTextureAtlasAsepriteJson(json, atlas)` and `parseTextureAtlasAsepriteDocument(doc, atlas)`. Hash and array shapes. Trim, rotation, no pivot (Aseprite does not export one). JSON.parse failure returns atlas unchanged.
- **Starling/Sparrow XML** (`textureAtlasStarlingParse.ts`): `parseTextureAtlasStarlingXml(xml, atlas, _options?)`. `SubTexture` elements from a `<TextureAtlas>` root or child. Handles `frameX/Y/Width/Height` trim (correctly negated into `sourceX/Y`), `rotated`, source-space `pivotX/Y`. Tolerant of `TextureAtlas` as root or child element. Uses `@flighthq/xml` `parseXmlDocument`.
- **libGDX/Spine text** (`textureAtlasLibgdxParse.ts`): `parseTextureAtlasLibgdxAtlas(text, atlas)`. Hand-rolled line parser: page headers with key:value pairs, region blocks with `xy`/`size`/`orig`/`offset`/`rotate`/`index`. Multi-page files supported (regions from all pages concatenated). Index >= 0 folded into name as `name_index`. Trim inferred from `orig` vs `size`.

### Detection disambiguation

`detectTextureAtlasFormat` in `textureAtlasDetect.ts` is structural, never extension-based:

- Starling: content starts with `<` and contains `<TextureAtlas`.
- libGDX: not XML or JSON, matches both a header keyword (`size`/`format`/`filter`/`repeat`) and a region keyword (`xy`/`orig`).
- Aseprite vs TexturePacker (both `{frames, meta}` JSON): disambiguated by `meta.app` string (`aseprite` vs `texturepacker`/`codeandweb`), falling back to the Aseprite-only per-frame `duration` field. Each detector calls the shared `readJsonAtlasKind` and answers only for itself.

Returns `null` for unknown, empty, corrupt, or non-string input.

### Package shape and conventions

- Two export lanes: `.` (`index.ts`) re-exports from `./contract`; `./contract` (`contract.ts`) barrel-exports all four parser modules and `textureAtlasDetect.ts`. Correct per the export-lanes convention.
- All types live in `@flighthq/types`: `TextureAtlasFormatKind` and its constants, `TextureAtlasParseOptions` (intersection of `TextureAtlasPackerParseOptions` and `TextureAtlasStarlingParseOptions`), and the Aseprite/Packer document/frame schemas. No local type definitions.
- `"sideEffects": false` declared and honored. Registry seeds lazily, not at import.
- Dependencies: `@flighthq/registry`, `@flighthq/textureatlas`, `@flighthq/types`, `@flighthq/xml`. All legitimate.
- Consumers: `@flighthq/spritesheet-formats` delegates its TexturePacker/Aseprite/Starling/libGDX geometry to this package. `@flighthq/sdk` re-exports it.

### Test coverage

77 tests across 5 files (all passing), one test file per source file. Coverage includes:

- Per-parser: hash vs array shapes, trim fields, pivot, rotation, sequential IDs, region clearing, chaining return, malformed JSON sentinel behavior.
- Detection: each built-in format, array-shaped Aseprite, `meta.app` fallback to per-frame duration, null/empty/garbage input.
- Registry: `getTextureAtlasFormat` for built-ins and unknown kinds, `getTextureAtlasFormatKinds` enumeration, `registerTextureAtlasFormat` custom format, `unregisterTextureAtlasFormat`, mutual exclusivity proof across a corpus.
- Partial documents: missing `sourceSize`/`spriteSourceSize`, missing `frame` rect, null `frame`, mixed good/bad frames.

## Gaps

### Cocos plist: declared but absent

`TextureAtlasFormatKindCocosPlist` is declared in `@flighthq/types` with no parser in this package. The Cocos plist geometry parser (`parseCocosPlistSpritesheet` and `parseCocosPlistSpritesheetDocument`) lives only in `@flighthq/spritesheet-formats`, doing its own geometry inline. This is the one format where the two-tier geometry/animation layering is inverted: `spritesheet-formats` delegates to `textureatlas-formats` for the other four formats but handles Cocos plist entirely on its own.

### No serialization

Zero `serializeTextureAtlas*` functions. The package is read-only. Its sibling `spritesheet-formats` has serializers for every format it parses. Atlas-editing tools, repacking pipelines, and any atlas round-trip workflow have no support at this layer.

### Multipack not modeled

TexturePacker multipack emits one JSON per page plus `meta.related_multi_packs`; libGDX `.atlas` files carry multiple pages with per-page image names, filters, and repeat modes. The libGDX parser discards the page image filename and concatenates all regions. The TexturePacker schema and types omit `related_multi_packs`. This is partially blocked upstream by `TextureAtlas` being single-image, but the format layer silently loses page names rather than surfacing them.

### Meta data not surfaced

`meta.image`, `meta.size`, and `meta.scale` are present in the parsed JSON but never returned or applied. Loaders cannot recover the atlas image filename from a parse result. TexturePacker `scale: 0.5` atlases get no coordinate rescaling. The Starling XML `imagePath` attribute is similarly discarded.

### Starling options are dead surface

`TextureAtlasStarlingParseOptions` declares `imageWidth` and `imageHeight` fields. `parseTextureAtlasStarlingXml` accepts them as `_options` and never reads them. This is dead API surface that promises UV computation support it does not deliver.

### libGDX nine-patch keys ignored

`split:` and `pad:` lines are silently skipped by the libGDX parser. No schema or region field exists to receive them. This pairs with the absence of nine-slice fields on `TextureAtlasRegion`.

### Naming: "Packer" abbreviates "TexturePacker"

`parseTextureAtlasPackerJson`, `parseTextureAtlasPackerDocument`, and all `*Packer*` type names use "Packer" rather than the full product name "TexturePacker". This disagrees with the kind constant value `'texturePacker'`, the sibling package's naming (`parseTexturePackerSpritesheet`), and the codebase rule against abbreviating type names in function names. A reader searching "TexturePacker" misses these functions.

### Missing format families

Beyond the five declared kinds, an authoritative atlas-format library would cover Spine 4.x `.atlas` keys (`bounds`/`offsets` shorthand), Unity sprite atlas, Godot `.tres`, Egret/LayaAir JSON, and Zwoptex XML plist variants. Not all are table stakes, but Spine 4.x and Unity are common.

## Charter contradictions

The charter is a stub (North star, Boundaries, and Decisions are all TODO), so there are no charter principles to contradict. The "What it is" section describes the package's purpose accurately: parsing industry atlas formats into the SDK's `TextureAtlas` region model, with serialization as a maturity target.

## Contract and docs fit

**Package to contract:**

- Types are correctly housed in `@flighthq/types`. No inline exported types in the package.
- Export lanes correct: `.` and `./contract` only.
- `"sideEffects": false` declared and honored.
- Function names are fully unabbreviated except for the "Packer" abbreviation noted above.
- Sentinel return (`null`) used for detection failure and unrecognised parse content, never throws on expected failures.
- `import type` discipline observed throughout.
- Uses `@flighthq/registry` `KeyedTable` for the open registry pattern.

**Candidate admin-doc revisions:**

- The Package Map in `AGENTS.md` lists `textureatlas-formats` under "Resources: codecs" which is accurate.
- The prior review (2026-07-03) noted schema duplication with `spritesheet-formats`: that issue has been resolved by moving all schema types to `@flighthq/types`. No schema source files remain in this package.
- The prior review noted that `detectTextureAtlasFormat` was a closed hardcoded function. This has been resolved: detection now iterates the registry, and custom formats participate in sniffing.

## Candidate open directions

These are questions the charter does not answer that this review had to assume:

1. **Should this package round-trip?** The charter says "(and, in a mature library, writing)" — is serialization in scope for this package, and if so, which formats first?
2. **Where should page/meta data land?** Should parsed page image names, scale, and size be returned alongside regions (e.g. as a structured result or via the atlas object), or does that wait for `TextureAtlas` to grow a pages model?
3. **Is the Cocos plist geometry parser expected here?** The kind constant is declared, `spritesheet-formats` does its own geometry for this format, and the two-tier layering is inverted for exactly this one format.
4. **Is the "Packer" abbreviation intentional?** If the stutter `TextureAtlasTexturePacker*` is unacceptable, what is the blessed form — `parseTexturePackerAtlasJson`, `parseTextureAtlasTexturePackerJson`, or keeping "Packer"?
5. **Should Starling parse options be removed or implemented?** `imageWidth`/`imageHeight` are accepted and ignored. Either implement UV computation or remove the dead surface.
6. **What additional format families are in scope?** Spine 4.x shorthand, Godot `.tres`, Unity sprite atlas, or is the current set (TexturePacker, Aseprite, Starling, libGDX, plus the pending Cocos) the target?
