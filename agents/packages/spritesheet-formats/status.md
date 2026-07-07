---
package: '@flighthq/spritesheet-formats'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# spritesheet-formats — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/spritesheet-formats

**Session**: Bronze + Silver maturation pass  
**Starting score**: 68/100  
**Estimated new score**: 86/100

---

## Implemented APIs

### New types added to `@flighthq/types`

- **`GridSliceOptions`** (`packages/types/src/GridSliceOptions.ts`) — options for uniform-grid slicing: `imageFile`, `imageWidth/Height`, `columns`, `rows`, optional `frameWidth/Height`, `marginX/Y`, `spacingX/Y`, `namePrefix`.
- **`SpritesheetFormatKind`** (`packages/types/src/SpritesheetFormatKind.ts`) — string-based format kind type with five built-in constants: `SpritesheetFormatKindTexturePacker`, `SpritesheetFormatKindAseprite`, `SpritesheetFormatKindStarling`, `SpritesheetFormatKindLibgdxAtlas`, `SpritesheetFormatKindCocosPlist`.
- **`SpritesheetParseDiagnostic`** + **`SpritesheetParseDiagnosticSeverity`** (`packages/types/src/SpritesheetParseDiagnostic.ts`) — structured diagnostic type with `severity`, `message`, optional `frameName`, and optional `field`.

### New source files in `packages/spritesheet-formats/src/`

| File | Exports |
| --- | --- |
| `xmlParse.ts` | `parseXmlAttributes`, `parseXmlDocument`, `XmlElement` |
| `libgdxAtlasSchema.ts` | `LibgdxAtlasDocument`, `LibgdxAtlasPage`, `LibgdxAtlasRegion` |
| `libgdxAtlasParse.ts` | `parseLibgdxAtlasSpritesheet`, `parseLibgdxAtlasSpritesheetDocument`, `LibgdxAtlasParsed`, `LibgdxAtlasParseOptions` |
| `libgdxAtlasSerialize.ts` | `serializeLibgdxAtlasSpritesheet` |
| `gridSlice.ts` | `parseGridSpritesheet` |
| `cocosPlistSchema.ts` | `CocosPlistDocument`, `CocosPlistFrame`, `CocosPlistMetadata` |
| `cocosPlistParse.ts` | `parseCocosPlistSpritesheet`, `parseCocosPlistSpritesheetDocument`, `CocosPlistParsed`, `CocosPlistParseOptions` |
| `cocosPlistSerialize.ts` | `serializeCocosPlistSpritesheet` |
| `spritesheetDetect.ts` | `detectSpritesheetFormat`, `parseSpritesheet`, `registerSpritesheetFormat`, `SpritesheetParseOptions` |
| `spritesheetDiagnostics.ts` | `parseSpritesheetWithDiagnostics`, `SpritesheetParseResult` |

### Modified existing files

- **`starlingParse.ts`** — replaced regex-based XML parser with `parseXmlDocument` from `xmlParse.ts`; added `imageWidth`/`imageHeight` options to `StarlingParseOptions` so callers can supply dimensions that Starling XML omits.
- **`texturePackerParse.ts`** — added `TexturePackerParseOptions` with `frameDuration` override (was hard-coded to 100ms).
- **`asepriteParse.ts`** — added `AsepriteParseOptions` with `frameDuration` override.
- **`index.ts`** — re-exports all new modules.
- **`package.json`** — added `@flighthq/types` dependency.

### New test files

`xmlParse.test.ts`, `gridSlice.test.ts`, `libgdxAtlasParse.test.ts`, `libgdxAtlasSerialize.test.ts`, `cocosPlistParse.test.ts`, `cocosPlistSerialize.test.ts`, `spritesheetDetect.test.ts`, `spritesheetDiagnostics.test.ts`, `asepriteSerialize.test.ts`, `starlingSerialize.test.ts`, `texturePackerSerialize.test.ts`.

**Test count**: 169 tests across 14 test files (up from 154 across 9 files, then serializer test files added).

---

## Deferred Items and Why

### Cross-package design decisions (surfaced, not acted on)

- **Move `Spritesheet*Data` triple into `@flighthq/types`** — the roadmap identifies this as the central prerequisite for adding `pages`, `polygon`, `pageIndex`, and other multi-page fields. It crosses into `@flighthq/spritesheet` (which currently owns `createSpritesheetData`, `createSpritesheetFrameData`, `createSpritesheetAnimationData`). A rename/move of this scope requires coordinating with the spritesheet package owner. Deferred; surfaced.

- **Multi-page `SpritesheetData` shape** — libGDX multi-page pages are fully parsed into `document.pages` but collapsed to the first page's image for `SpritesheetData.imageFile/imageWidth/imageHeight`. The model change (add `pages: SpritesheetPageData[]`, per-frame `pageIndex`) is blocked on the `Spritesheet*Data`-to-types migration above. Deferred; deferred until the type-ownership decision lands.

### Silver deferred items

- **Multi-page atlas support** — Texture Packer `meta.related_multi_packs` follow/emit; libGDX multi-page full realization into `pages[]`. Blocked on multi-page type model (see above).
- **Polygon/mesh trim modeling** — `vertices`, `verticesUV`, `triangles` in Texture Packer Phaser/Pixi presets. Depends on `@flighthq/sprite` mesh renderability decision. Left for a future session.
- **Animation direction normalization** — validate/normalize `pingpong_reverse` direction handling and reverse-range frame ordering. Currently passed through as-is. Low priority; covered by the schema types' union type.
- **Plist serialize fidelity / Aseprite layer+tag-color modeling** — promoting Aseprite `layers` and tag `color` to optional `SpritesheetData` fields. Crossed into the spritesheet package's type definition scope.

### Gold deferred items

- **Remaining recognized formats**: Unity sprite atlas, Godot `.tres`, Spine region attachment, Adobe Animate JSON, Phaser legacy variants — all text-format, additive work for a future Gold session.
- **Pluggable format registry seam** — `registerSpritesheetFormat` / `getSpritesheetFormat` are implemented and exported; the seam exists. The Gold item of exposing named `register*` helpers for each built-in format (so callers can selectively un/re-register) and the `getSpritesheetFormat` read accessor were left for a Gold session.
- **Aseprite binary `.ase`** — `parseAsepriteBinarySpritesheet(bytes: Uint8Array)`. Gold-level effort; scoped separately.
- **Property-based round-trip tests** and **performance/allocation discipline** — out-param parse variants, streaming iteration for large atlases, benchmark gate.
- **Docs and functional scene** — format-support matrix doc, a round-trip example, a functional visual test.
- **Rust parity** — `crates/flighthq-spritesheet-formats` already has three modules; new TS additions (libGDX, Cocos plist, grid slicing, detection, diagnostics) each need a matching Rust module and conformance fixtures. Should be done after TS API stabilizes for each format.

---

## Concerns and Surprises

1. **Pre-existing `exports:check` failures** — `asepriteParse.ts`, `starlingParse.ts`, and `texturePackerParse.ts` show `(0/2)` partial coverage in `exports:check` because their existing test files use describe names with ` — suffix` (e.g. `'parseAsepriteSpritesheet — lightweight, returns SpritesheetData directly'`) rather than the exact function name. This was a pre-existing issue before this session. New test files all use exact function names as required by the convention.

2. **`sideEffects: false` and lazy registry initialization** — `spritesheetDetect.ts` uses a lazily-initialized format registry to avoid top-level `Map.set()` mutations (which would technically be side effects at module import time). This avoids the `sideEffects: false` hazard while still allowing tree-shaking callers that only import `parseTexturePackerSpritesheet` to exclude the detection code entirely.

3. **Cocos plist `CocosPlistParseOptions.frameDuration`** — the option is present in the interface but unused internally (Cocos plist has no animation data). Kept for API symmetry with other parsers; future animation inference from frame-name grouping could use it.

4. **Starling image dimensions** — `imageWidth` and `imageHeight` default to 0 when not supplied via options (Starling XML genuinely omits them). `parseSpritesheetWithDiagnostics` emits a `warning` diagnostic in this case. This is the correct behavior per the Silver spec.

5. **`SpritesheetParseResult` vs `@flighthq/types`** — `SpritesheetParseResult` is defined locally in `spritesheetDiagnostics.ts` rather than in `@flighthq/types`. The roadmap says it should be in types; it was left here because it depends on `SpritesheetData` (still in `@flighthq/spritesheet`, not in types), and importing spritesheet from a types file would create a circular dependency. It can move to types once `SpritesheetData` moves to types.

---

## Suggestions for Future Sessions

- **Resolve `Spritesheet*Data` ownership first** — move `SpritesheetData`, `SpritesheetFrameData`, `SpritesheetAnimationData` from `@flighthq/spritesheet/src/spritesheetData.ts` into `@flighthq/types` (one file per type per convention). This unblocks multi-page support, polygon trim, `SpritesheetParseResult` placement, and the Rust conformance baseline.
- **Add `getSpritesheetFormat(kind)` read accessor** to `spritesheetDetect.ts` to complete the Gold registry seam.
- **Add `SpritesheetFormatKindCocosPlist` detection to `detectSpritesheetFormat`** — currently implemented; Cocos plist is already in the built-in registry set.
- **Port new formats to Rust** — `flighthq-spritesheet-formats` crate should gain `libgdx_atlas`, `cocos_plist`, and `grid_slice` modules mirroring the TS additions, with shared test fixtures for conformance checking.
- **Fix pre-existing `exports:check` failures** — rename the three parse test files' describe blocks to exact function names (remove the ` — suffix`). This is a cosmetic fix that brings the package into full compliance.

---

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md › Recommended` that fall strictly inside this package.

### Done

- **Removed the serialize `describe` blocks duplicated into the parse test files.** The `serializeStarlingSpritesheet`, `serializeTexturePackerSpritesheet`, and `serializeAsepriteSpritesheet` round-trip `describe`s lived in _both_ the parse test file and the dedicated `*Serialize.test.ts`. Relocated each block's `it`s (and the fixtures they needed) into the single existing `describe` in the matching `*Serialize.test.ts`, then deleted the duplicate from the parse test. To avoid clashing with the differently-bodied fixtures already in the serialize files, the moved fixtures were renamed (`ROUNDTRIP_HASH_JSON` / `ROUNDTRIP_ARRAY_JSON` / `ROUNDTRIP_MINIMAL_JSON` / `ROUNDTRIP_NO_TAGS_JSON`). No coverage lost; the round-trip assertions are preserved verbatim under the serialize files. Dropped the now-unused `serialize*` imports from the three parse test files. This also clears the `exports:check (0/2)` drift the status flagged on those parse files (their serialize describes were the source of the mismatch).
- **Retired the dead Cocos `frameDuration` option.** Removed the `CocosPlistParseOptions` interface (Cocos plist carries no animation data, so `frameDuration` was never read — both parse functions took `_options`) and dropped the unused param from `parseCocosPlistSpritesheet` / `parseCocosPlistSpritesheetDocument`. Pre-release, no shipped consumer, within-package. (Supersedes Note 3 above.)

### Parked

- **Fix the inverted libGDX schema field naming/comments.** Not applicable as written: the assessment targets a `libgdxAtlasSchema.ts` file and `region.origSize` / `region.orig` field names that do not exist in the current tree. The live `libgdxAtlasParse.ts` already maps `orig:` → `sourceWidth/sourceHeight` (original size) and `offset:` → `offsetX/offsetY` (trim offset) with matching comments — i.e. the bug the assessment describes was already resolved by a prior refactor. Nothing to change.
- **Add the missing `@flighthq/spritesheet-formats` Package Map entry.** Cross-boundary: requires editing `agents/index.md`, which is outside this package's allowed doc scope (`agents/packages/spritesheet-formats/`).

### Verification

`npm run test --workspace=packages/spritesheet-formats` → 9 files, 130 tests, all passing.
