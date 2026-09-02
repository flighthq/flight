---
package: '@flighthq/spritesheet-formats'
updated: 2026-09-01
by: manager
---

# spritesheet-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/spritesheet-formats/src/` and `packages/types/src/` on 2026-09-01,
after the import-diagnostics work landed in `8ea132749`.

- **A parsed sheet is one page.** `SpritesheetData` (`packages/types/src/SpritesheetData.ts`)
  carries a single `imageFile` / `imageWidth` / `imageHeight` and no per-frame page index, so libGDX
  multi-page atlases collapse onto the first page.
- **Detector order is load-bearing and protected only by a test.** Aseprite must be registered
  before TexturePacker because an Aseprite export satisfies the TexturePacker detector too; the
  `registry ordering` describe block in `spritesheetDetect.test.ts` is the only thing that catches a
  reorder. A `FormatEntry`-shaped registration that carried its own precedence would make the
  constraint structural instead of conventional.
- **Serializers are asymmetric with parsers.** Aseprite, Starling, TexturePacker, and Cocos plist
  round-trip; libGDX parses only — there is no `serializeLibgdxAtlasSpritesheet`.
- **Cocos parsing is not delegated.** The Cocos plist path is implemented here rather than routed
  through a shared plist reader, so its structure diverges from the other parsers.
- **Frame-inference logic is duplicated across parsers** rather than shared, so a fix to one
  parser's inference does not reach the others.
- **Aseprite binary `.ase` is unsupported** — only the JSON export is read.
- **Polygon/mesh trim is unparsed**: no `vertices`, `verticesUV`, or `triangles` appear anywhere in
  `src/`, so TexturePacker's Phaser/Pixi polygon presets degrade to their bounding rect.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-01** — Import diagnostics landed in `8ea132749`. Three items here died: the package now
  routes through `@flighthq/importdiagnostics` with five codes
  (`spritesheet.aseprite.malformed-json`, `spritesheet.cocos-plist.unrecognized-frame`,
  `spritesheet.libgdx-atlas.missing-page-header`, `spritesheet.starling.missing-dimensions`,
  `spritesheet.texture-packer.malformed-json`), so the Starling zero-dimensions case reports instead
  of writing `imageWidth: 0` in silence; the banned structural divider comments are gone from every
  source file; and types now come from `@flighthq/types` — the remaining
  `@flighthq/spritesheet/contract` imports are the `createSpritesheetData` family of value
  constructors, which is the correct home for those. No charter Decision: this is stage state, and
  the direction the work followed was already blessed.

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
