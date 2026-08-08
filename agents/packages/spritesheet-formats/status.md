---
package: '@flighthq/spritesheet-formats'
updated: 2026-08-08
by: principal
---

# spritesheet-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/spritesheet-formats/src/` and `packages/types/src/` on 2026-08-08.

- **This importer has no diagnostics path.** It does not depend on `@flighthq/importdiagnostics`, the
  shared structured-diagnostics seam every other `*-formats` package routes through, and
  `SpritesheetParseDiagnostic` (`packages/types/src/SpritesheetParseDiagnostic.ts`) has zero consumers
  anywhere in `packages/`. The concrete cost: a Starling document omits its atlas dimensions by design,
  and `parseStarlingSpritesheet` silently writes `imageWidth: 0` (`starlingParse.ts:134`) with nothing
  reported to the caller.
- **Structural divider comments in every source file**, which the source-style rule bans outright:
  `spritesheetDetect.ts:17`, `:94`; `libgdxAtlasParse.ts:11`, `:34`, `:166`, `:219`;
  `starlingParse.ts:17`, `:61`, `:143`; `cocosPlistParse.ts:12`, `:57`, `:133`, `:174`;
  `asepriteParse.ts:18`, `:94`; `asepriteSerialize.ts:12`, `:92`; `starlingSerialize.ts:4`, `:54`;
  `texturePackerParse.ts:17`.
- **Type imports route through an implementation package.** `SpritesheetData`, `SpritesheetFrameData`,
  and `SpritesheetAnimationData` are imported from `@flighthq/spritesheet/contract`
  (`spritesheetDetect.ts:1`, `libgdxAtlasParse.ts:1`, `starlingParse.ts:1`, and the other parsers)
  although their canonical definitions are in `@flighthq/types`
  (`packages/types/src/SpritesheetData.ts`) and `packages/spritesheet/src/spritesheetData.ts:5` merely
  re-exports them.
- **A parsed sheet is one page.** `SpritesheetData` (`packages/types/src/SpritesheetData.ts`) carries a
  single `imageFile` / `imageWidth` / `imageHeight` and no per-frame page index, so libGDX multi-page
  atlases collapse onto the first page.
- **Detector order is load-bearing and protected only by a test.** Aseprite must be registered before
  TexturePacker because an Aseprite export satisfies the TexturePacker detector too
  (`spritesheetDetect.ts:71` before `:79`, reasoning at `:53-66`); `describe('registry ordering')`
  (`spritesheetDetect.test.ts:219`) is the only thing that catches a reorder.
- **Serializers are asymmetric with parsers.** Aseprite, Starling, TexturePacker, and Cocos plist
  round-trip; libGDX parses only (`libgdxAtlasParse.ts:227`, no `serializeLibgdxAtlasSpritesheet`).
- **Aseprite binary `.ase` is unsupported** — only the JSON export is read (`asepriteParse.ts:103`).
- **Polygon/mesh trim is unparsed**: no `vertices`, `verticesUV`, or `triangles` appear anywhere in
  `src/`, so TexturePacker's Phaser/Pixi polygon presets degrade to their bounding rect.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The largest false claim was the whole
  diagnostics surface: the file listed `spritesheetDiagnostics.ts` with
  `parseSpritesheetWithDiagnostics` / `SpritesheetParseResult` as implemented and then debated where
  the result type belonged — none of those three symbols exists anywhere in `packages/`. Also dropped:
  `xmlParse.ts`, `libgdxAtlasSchema.ts`, `libgdxAtlasSerialize.ts`, and `gridSlice.ts` as files of this
  package (XML parsing is `@flighthq/xml`, grid slicing is `createTextureAtlasFromGrid`); the
  `Spritesheet*Data`-to-types migration as a blocking prerequisite (the three types are in
  `@flighthq/types`); `getSpritesheetFormat` as a Gold to-do (`spritesheetDetect.ts:112`); the
  `exports:check` describe-name drift; and the `flighthq-spritesheet-formats` crate (no `crates/`
  directory in this repo).
- **2026-08-05** — Every `JSON.parse` guarded to return an empty result rather than throw, matching the
  same sweep in `textureatlas`; direction and repeat playback corrected; detector order pinned by test;
  types moved to `@flighthq/types` and atlas parsing delegated to `textureatlas-formats`.
- **2026-06-25** — Duplicate serialize `describe` blocks folded into the `*Serialize.test.ts` files;
  the dead Cocos `frameDuration` option retired.
- **2026-06-24** — libGDX atlas, Cocos plist, grid slicing, format detection, and a registry seam
  added; Starling moved off its regex XML reader.
