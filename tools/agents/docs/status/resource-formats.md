# @flighthq/resource-formats — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `src/` down to `xmlParse` + `index`, but `dist/` proved a full texture-atlas format suite had existed and compiled. Reconstructed the lost `.ts` from `dist/<m>.js` (impl + verbatim `//` comments) merged with `dist/<m>.d.ts` (types), tests from `dist/<m>.test.js`.

One mechanical drift fix applied to every recovered module: the dist was built against a now-removed `@flighthq/resources` package. The split moved `createTextureAtlas` / `createTextureAtlasRegion` into `@flighthq/textureatlas` (verified the symbols live there via its barrel), so all imports were repointed `@flighthq/resources` → `@flighthq/textureatlas`. Added `@flighthq/textureatlas` and `@flighthq/types` to this package's `dependencies` (both already workspace-symlinked in `node_modules`).

### Recovered (src + colocated test, re-exported from index.ts)

- `textureAtlasAsepriteSchema` — Aseprite JSON document interfaces (types-only; package-local, not cross-package, so kept in-package, not in `@flighthq/types`).
- `textureAtlasPackerSchema` — TexturePacker JSON document interfaces (types-only, package-local).
- `textureAtlasAsepriteParse` — `parseTextureAtlasAsepriteDocument`, `parseTextureAtlasAsepriteJson`.
- `textureAtlasPackerParse` — `parseTextureAtlasPackerDocument`, `parseTextureAtlasPackerJson` (+ `TextureAtlasPackerParseOptions`).
- `textureAtlasLibgdxParse` — `parseTextureAtlasLibgdxAtlas`.
- `textureAtlasStarlingParse` — `parseTextureAtlasStarlingXml` (+ `TextureAtlasStarlingParseOptions`); consumes the local `parseXmlDocument`.

### Skipped fossils

- None. No recovered module implements a deliberately-dropped concept.

### Parked

- `textureAtlasDetect` (`detectTextureAtlasFormat`, `parseTextureAtlas`, `registerTextureAtlasFormat`) — needs `TextureAtlasFormatKind` and the `TextureAtlasFormatKind{Aseprite,LibgdxAtlas,Starling, TexturePacker}` kind consts in `@flighthq/types`; none exist there and the hard boundary forbids editing `@flighthq/types`.
- `textureAtlasLoad` (`loadTextureAtlasWithMetadataFromUrl` + `TextureAtlasLoadWithMetadataOptions`) — depends transitively on the parked `parseTextureAtlas` (detect registry) and on `loadImageResourceFromUrl`, which does not exist anywhere in the current workspace (was part of the removed `@flighthq/resources`). Both blockers are outside this package's boundary.

### Test result

`npm run test --workspace=packages/resource-formats` — 5 files, 71 tests, all passing.
