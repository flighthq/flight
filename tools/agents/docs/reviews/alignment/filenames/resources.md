# Filename Alignment: @flighthq/resources

**Verdict:** Single-implementation domain package (no backend variant), so no backend token prefix applies — and every filename is a clean domain/object name. Fully aligned; the only soft note is the bare `From` modifier on the sourcing files, which carries its object prefix and stays within convention.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `*From.ts` (audioResourceFrom, fontFrom, fontResourceFrom, imageResourceFrom, textureAtlasFrom, tilesetFrom, videoResourceFrom) | Soft note, not a flag. `From` is a trailing modifier rather than a domain word, so the bare basename reads as an unfinished phrase ("imageResource from…what?"). It is acceptable because the object prefix carries the domain and each file is a coherent group of `create*From*`/`load*From*` constructors over one object (an entity-vs-sourcing domain split, not a one-function-per-file split). No rename required; flagged only for awareness. | (optional) keep as-is, or a fuller modifier such as `imageResourceSources.ts` / `imageResourceLoad.ts` if the team wants the basename to state the action |

## Clean

The base entity files all name a real domain object and pass the "remove the folder" test on their own:

- `audioResource.ts`, `audioResourceFrom.ts`
- `font.ts`, `fontFrom.ts`
- `fontResource.ts`, `fontResourceFrom.ts`
- `imageResource.ts`, `imageResourceFrom.ts`
- `textureAtlas.ts`, `textureAtlasFrom.ts`
- `textureAtlasRegion.ts`
- `tileset.ts`, `tilesetFrom.ts`
- `videoResource.ts`, `videoResourceFrom.ts`
- `index.ts` (thin barrel, pure re-exports — not a dumping ground)

No generic/no-domain names (`data.ts`, `format.ts`, `utils.ts`, `helpers.ts`, etc.). No single-function files: each base file holds the object's `create*` plus its utility cluster (`imageResource.ts` carries clone/dispose/invalidate/has*/is*/set*; `textureAtlasRegion.ts` carries create + the add*/set\* family; `tileset.ts` carries create + `buildTilesetRegions`). Tests are colocated `<source>.test.ts` and mirror every source filename one-to-one (15 source files, 15 test files).
