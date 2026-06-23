# Filename Alignment: @flighthq/spritesheet

**Verdict:** Single-implementation package (not a backend-variant — no `*-canvas/-dom/-gl/-wgpu` token, so plain domain/object names are correct and no backend prefix applies). Filenames are nearly all clean, descriptive `spritesheet*` object names; one file (`spritesheetFrom.ts`) is named after a function fragment rather than a domain/object.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `spritesheetFrom.ts` | Named after a function fragment, not a domain/object. The bare name "spritesheet from" reads as a cut-off sentence, not a thing — it carries no object. Holds only `createSpritesheetFromTileset`. Fails the function-name test. | `spritesheetFromTileset.ts` (names the conversion source object); if more `from*` constructors are expected, `tilesetSpritesheet.ts` |

## Clean

All remaining files name a concrete object/domain in the spritesheet feature area; remove the folder and each is self-describing. Tests are colocated as `<source>.test.ts` mirroring each source file.

- `index.ts` — barrel; thin re-export only, not a dumping ground.
- `spritesheet.ts` — the `Spritesheet` entity (`createSpritesheet`, `getSpritesheetAnimation`).
- `spritesheetAnimation.ts` — the `SpritesheetAnimation` object.
- `spritesheetData.ts` — the serializable `SpritesheetData` family (data, animation-data, frame-data). A legitimate domain name, not a generic `data.ts`: it is prefixed with the owning object (`spritesheet`) so the bare filename still names the spritesheet-data domain.
- `spritesheetFrame.ts` — the `SpritesheetFrame` object.
- `spritesheetPlayer.ts` — the `SpritesheetPlayer` object and its playback verbs.
- `spritesheetTimelineSource.ts` — the `TimelineSource` adapter for a spritesheet.
