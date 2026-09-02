---
package: '@flighthq/spritesheet-formats'
status: partial
score: 62
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source (packages/spritesheet-formats/src/, 22 files, 3248 lines)
  - packages/types/src/SpritesheetParseDiagnostic.ts
---

# spritesheet-formats -- Review

## Verdict

`partial` -- 62/100. A functioning format-interop layer with five parsers, four serializers, a well-designed open registry, and 142 tests. The foundation is sound: the registry is the canonical fork-B shape, types are in `@flighthq/types`, sentinels are used correctly, and round-trip coverage is thorough for the four serializable formats. The score reflects three concrete structural deficits that keep it from `solid`: (1) no diagnostics path despite a defined `SpritesheetParseDiagnostic` type, (2) a systematic import routing violation (`SpritesheetData` and friends imported from `@flighthq/spritesheet/contract` rather than `@flighthq/types/contract`), and (3) the libGDX format breaks the round-trip fidelity principle with no serializer and no document-preserving parse variant.

## Present capabilities

**Five format parsers**, all producing `SpritesheetData`:

- `parseAsepriteSpritesheet` / `parseAsepriteSpritesheetDocument` (`asepriteParse.ts`) -- JSON hash and array variants, per-frame durations, `frameTags` animation mapping, delegates region geometry to `@flighthq/textureatlas-formats`.
- `parseTexturePackerSpritesheet` / `parseTexturePackerSpritesheetDocument` (`texturePackerParse.ts`) -- JSON hash and array variants, `frameTags` animation mapping, pivot support, delegates region geometry to `@flighthq/textureatlas-formats`.
- `parseStarlingSpritesheet` / `parseStarlingSpritesheetDocument` (`starlingParse.ts`) -- Starling/Sparrow XML, hand-rolled regex XML parser for `SubTexture` attributes, `baseName_NNN` animation inference, pivot normalization to 0..1, delegates region geometry to `@flighthq/textureatlas-formats`.
- `parseLibgdxAtlasSpritesheet` (`libgdxAtlasParse.ts`) -- line-based `.atlas` parser, handles single/multi-page (collapses to first page), `baseName_NNN` animation inference, delegates region geometry to `@flighthq/textureatlas-formats`. **Parse-only**: no document-preserving variant, no serializer.
- `parseCocosPlistSpritesheet` / `parseCocosPlistSpritesheetDocument` (`cocosPlistParse.ts`) -- Cocos2d-x/Cocos Creator plist XML, rotation w/h swap, supports both old-style and new-style keys. **Does not delegate to `textureatlas-formats`** -- does its own geometry parsing via `@flighthq/xml`.

**Four serializers** (Aseprite, TexturePacker, Starling, Cocos plist):

- `serializeAsepriteSpritesheet` (`asepriteSerialize.ts`) -- hash/array variants via option, preserves per-frame durations, layer metadata, tag colours through document pass-through.
- `serializeTexturePackerSpritesheet` (`texturePackerSerialize.ts`) -- hash/array variants, preserves pivot, `frameTags`, scale, app/format/version metadata.
- `serializeStarlingSpritesheet` (`starlingSerialize.ts`) -- XML output, denormalizes pivot from 0..1 back to source pixels, emits optional `frameX`/`frameY`/`rotated` only when needed.
- `serializeCocosPlistSpritesheet` (`cocosPlistSerialize.ts`) -- plist XML output with `escapeXml`, preserves metadata format version.

**Registry and detection** (`spritesheetDetect.ts`):

- `detectSpritesheetFormat` -- iterates registered entries in insertion order, returns first match.
- `parseSpritesheet` -- auto-detect + parse in one call, optional `formatKind` override, returns `null` on unrecognized.
- `registerSpritesheetFormat` / `unregisterSpritesheetFormat` -- open registry, last-write-wins, vendor-prefix convention documented.
- `getSpritesheetFormat` / `getSpritesheetFormatKinds` -- introspection accessors.
- Lazy init with `sideEffects: false` compliant seeding -- built-in formats self-register inside `getRegistry()`, not at module top level.
- Detection overlap pinned by test: Aseprite registered before TexturePacker because Aseprite exports satisfy the TexturePacker detector.

**Export lanes**: `index.ts` (public lane) explicitly enumerates 20 exports; `contract.ts` re-exports everything via `export *`. Two-lane structure is correct.

**Test coverage**: 142 test cases across 11 files (one test file per source file). Coverage spans parse, serialize, round-trip, malformed input, variant detection, registry, detection overlap. `JSON.parse` calls are guarded with try/catch returning empty `SpritesheetData` sentinels.

## Gaps

**Diagnostics path is absent.** `SpritesheetParseDiagnostic` (`packages/types/src/SpritesheetParseDiagnostic.ts`) is defined as a type but has zero consumers in this package or anywhere in `packages/`. The package has no dependency on `@flighthq/importdiagnostics`. Concrete cost: Starling documents do not carry atlas dimensions by design, so `parseStarlingSpritesheet` silently writes `imageWidth: 0, imageHeight: 0` (`starlingParse.ts:133-134`) with nothing reported to the caller. A malformed JSON input yields an empty `SpritesheetData` with no indication that data was lost. The charter North star says "tolerant by default" -- the tolerant half works (best-effort data), but the structured-diagnostics half does not exist.

**libGDX serializer missing.** The other four formats have parse+serialize round-trips. libGDX is parse-only: no `serializeLibgdxAtlasSpritesheet`, no `parseLibgdxAtlasSpritesheetDocument`. This directly contradicts the charter North star: "a format that parses must serialize back."

**libGDX schema field-naming inversion.** `orig` / `origSize` semantics in the internal `LibgdxRegion` type are backwards relative to the libGDX format's real vocabulary. The charter (Open direction 9) flags this; it remains unfixed.

**`inferAnimations` duplicated.** Identical `inferAnimations` function (same signature, same body, same `baseName_NNN` regex) exists in both `starlingParse.ts:88` and `libgdxAtlasParse.ts:189`. This is a shared utility that should be extracted to a single location.

**Cocos plist does not delegate to `textureatlas-formats`.** Aseprite, TexturePacker, Starling, and libGDX all delegate region geometry to `@flighthq/textureatlas-formats` parsers. Cocos plist does its own geometry parsing via `@flighthq/xml` and plist-specific helpers. This is an asymmetry: if there is a Cocos atlas parser in `textureatlas-formats`, this package should use it for consistency; if there is not, that is a gap in `textureatlas-formats`.

**Multi-page atlas support limited.** `SpritesheetData` carries a single `imageFile`/`imageWidth`/`imageHeight`. libGDX multi-page atlases are parsed but collapsed to the first page. Per-frame `pageIndex` is lost. This is gated on a cross-package `SpritesheetData` model change (charter Open direction 1).

**Polygon/mesh trim unparsed.** TexturePacker's Phaser/Pixi `vertices`/`verticesUV`/`triangles` fields are not parsed anywhere in `src/`. Mesh-trim data degrades to the bounding rect.

**Aseprite binary `.ase` unsupported.** Only the JSON export is handled.

**`FormatEntry` shape not in `@flighthq/types`.** The `{ detect, parse }` shape callers must construct for `registerSpritesheetFormat` is defined as a local `interface FormatEntry` in `spritesheetDetect.ts:24`, re-spelled inline in `getSpritesheetFormat`'s return type (`:116-119`), and again in `registerSpritesheetFormat`'s parameter (`:156-159`). This crosses the package boundary and belongs as a named type in `@flighthq/types` per the header-layer rule.

## Charter contradictions

**Round-trip fidelity (North star).** "A format that parses must serialize back without silently dropping data." libGDX parses but cannot serialize. This is not a gap in scope -- it contradicts a stated principle.

**Tolerant by default (North star).** "Parsing returns best-effort data plus structured diagnostics." The best-effort half is implemented (try/catch on `JSON.parse`, null pivots, fallback defaults). The structured diagnostics half is entirely absent: `SpritesheetParseDiagnostic` is a dead type, no parse function returns diagnostics, and there is no dependency on `@flighthq/importdiagnostics`. The Starling `imageWidth: 0` case is the standing example: the caller gets data that looks valid but carries meaningless dimensions with no signal that anything was lost.

**Honest, unabbreviated names (North star).** The libGDX `orig`/`origSize` naming inversion is flagged by the charter itself (Open direction 9) and remains in the internal `LibgdxRegion` type. The public API names are honest and unabbreviated.

## Contract and docs fit

**Package-to-contract compliance:**

- Two-lane exports (`.` and `./contract`): correct.
- `sideEffects: false`: correct and enforced -- no top-level registration calls.
- Sentinels not throws: correct -- `detectSpritesheetFormat` and `parseSpritesheet` return `null`; JSON parsers return empty data on malformed input.
- `Readonly<T>` on inputs: applied on serializer `data` parameters, `getSpritesheetFormat` return. Not applied on `frameFromRegion`'s `region` parameter in some files (has the annotation in others).
- Full unabbreviated names: yes -- `parseAsepriteSpritesheet`, `serializeTexturePackerSpritesheet`, etc.
- Types in `@flighthq/types`: format-specific document types (`AsepriteDocument`, `TexturePackerDocument`, `StarlingDocument`, `CocosPlistDocument`, etc.) and `SpritesheetFormatKind` constants are in `@flighthq/types`. `FormatEntry` is not (see Gaps).

**Import routing violation.** Every source file imports `SpritesheetData`, `SpritesheetFrameData`, and `SpritesheetAnimationData` from `@flighthq/spritesheet/contract` (11 import lines across all non-test source files). These types are canonically defined in `@flighthq/types` (`packages/types/src/SpritesheetData.ts`); `@flighthq/spritesheet` merely re-exports them. Per the export-lanes convention, intra-SDK type imports should resolve to `@flighthq/types/contract`, not to the implementation package. Additionally, the `createSpritesheet*` factory functions are also imported from `@flighthq/spritesheet/contract` -- these are value imports and may legitimately live there, but the type imports alongside them should be separated and sourced from `@flighthq/types/contract`.

**Structural divider comments.** 21 `// ───` banner comments across non-test source files (`asepriteParse.ts:18,94`, `asepriteSerialize.ts:12,92`, `texturePackerParse.ts:17,77`, `texturePackerSerialize.ts:12,80`, `starlingParse.ts:17,61,143`, `starlingSerialize.ts:4,54`, `libgdxAtlasParse.ts:11,34,166,219`, `cocosPlistParse.ts:12,57,133,174`). Source style rule: "Avoid structural divider comments ... Use names, file boundaries, and package boundaries instead."

**Package Map listing.** The charter (Open direction 10) notes that `agents/index.md` has no dedicated line for this package. The Package Map in AGENTS.md does list it under "Animation and simulation: `spritesheet` / `spritesheet-formats`."

**Internal interfaces.** `LibgdxPage` and `LibgdxRegion` in `libgdxAtlasParse.ts` are internal (not exported) so they correctly stay in the source file rather than `@flighthq/types`. `FormatEntry` and `RegisteredFormatEntry` in `spritesheetDetect.ts` are also internal but `FormatEntry`'s shape is re-spelled at the public API boundary (see Gaps).

## Candidate open directions

Questions the charter does not answer that this review had to assume:

1. **Should Cocos plist delegate to `textureatlas-formats`?** The other four formats delegate region geometry parsing. Is the Cocos asymmetry intentional (because plist parsing is XML-specific and does not share document shapes with the atlas layer) or a gap that should be closed?

2. **Where should the shared `inferAnimations` utility live?** It is duplicated in `starlingParse.ts` and `libgdxAtlasParse.ts`. Candidates: a private module in this package, or in `@flighthq/spritesheet` if animation inference from frame names is a general capability.

3. **What is the diagnostics golden path?** Open direction 6 asks whether `parseSpritesheetWithDiagnostics` should be canonical. The answer matters because no diagnostics path exists at all yet -- the decision shapes whether diagnostics are threaded through the existing parse functions (adding an optional diagnostics collector parameter) or exposed as separate `*WithDiagnostics` variants.
