# Filename Alignment: @flighthq/spritesheet-formats

**Verdict:** Clean. This is a single-implementation domain package (a format import/export sub-library), **not** a backend-variant package (`*-canvas`/`*-dom`/`*-gl`/`*-wgpu`), so files take plain domain/object names with no backend prefix. Every filename names a format object (`aseprite`/`starling`/`texturePacker`) paired with a role aspect (`Parse`/`Serialize`/`Schema`) — a descriptive domain, not a single function — and tests are colocated correctly.

## Findings

| File     | Issue           | Suggested rename |
| -------- | --------------- | ---------------- |
| _(none)_ | No issues found | —                |

## Clean

- `asepriteParse.ts` — object (Aseprite format) + role (parse). Holds two exports (`parseAsepriteSpritesheet`, `parseAsepriteSpritesheetDocument`); names the parsing domain for the format, not one function.
- `asepriteSchema.ts` — Aseprite format type definitions (11 exported interfaces/types). Domain = the format's wire schema.
- `asepriteSerialize.ts` — Aseprite format serialization role.
- `starlingParse.ts` — Starling format parsing (two exports).
- `starlingSchema.ts` — Starling format type definitions.
- `starlingSerialize.ts` — Starling format serialization role.
- `texturePackerParse.ts` — Texture Packer format parsing (two exports).
- `texturePackerSchema.ts` — Texture Packer format type definitions (10 exported interfaces/types).
- `texturePackerSerialize.ts` — Texture Packer format serialization role.
- `index.ts` — thin barrel: `export *` over the nine source files only, no logic.
- `asepriteParse.test.ts`, `starlingParse.test.ts`, `texturePackerParse.test.ts` — colocated tests mirroring their source filenames.

No generic dumping-ground names (`data.ts`, `format.ts`, `utils.ts`, `helpers.ts`, `common.ts`). The bare-filename test passes: each name self-describes which format and which aspect (parse / serialize / schema) without the folder.
