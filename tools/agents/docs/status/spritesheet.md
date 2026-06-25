# @flighthq/spritesheet — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered genuine lost work from `dist/*.js` + `dist/*.d.ts` (camera pattern) into `src/`. The curation had pruned `src/` down to thin stubs; the build output proved richer implementations existed and compiled.

### Recovered

- **spritesheet.ts** — `cloneSpritesheet` (deep-copies frames incl. pivot/rotated, shallow-copies the animations record, passes atlas through). + tests.
- **spritesheetFrame.ts** — enriched `createSpritesheetFrame` to emit `pivotX`/`pivotY`/`rotated` (defaults `null`/`null`/`false`), which `cloneSpritesheet` and `createSpritesheetFromData` depend on.
  - tests for pivot/rotated.
- **spritesheetAnimation.ts** — enriched `createSpritesheetAnimation` to emit `direction` (default `'forward'`) and `frameDurations` (default `null`); added `createSpritesheetAnimationFromFrameNames` (selects frames by exact name / prefix / RegExp against atlas region names, in region-index order; returns null on no-atlas or no-match). + tests.
- **spritesheetPlayer.ts** — full module restored. Added `acquireSpritesheetPlayer`, `cloneSpritesheetPlayer`, `disposeSpritesheetPlayer`, `getSpritesheetPlayerFrameAt`, `pauseSpritesheetPlayer`, `releaseSpritesheetPlayer`, `resumeSpritesheetPlayer`, `seekSpritesheetPlayerToFrame`, `seekSpritesheetPlayerToTime`, `stopSpritesheetPlayer`; enriched `createSpritesheetPlayer` (`paused`/`speed`) and `updateSpritesheetPlayer` (speed scaling, pause gate, direction support — reverse/pingpong/pingpong_reverse — and variable per-frame durations via a lazily built cumulative-duration WeakMap cache + binary search). Pool at file bottom. + full tests.
- **spritesheetFrom.ts** — added `createSpritesheetFromData` (hydrates a runtime `Spritesheet` from a `SpritesheetData` descriptor + a `TextureAtlas`; resolves frame names to region ids with positional fallback, carries pivot/rotated/direction/frameDurations, builds the animations record by name).
  - tests.

### API drift adapted (mechanical, not behavioral)

- `dist` player imported `disconnectAllSlots` from `@flighthq/signals`; that name no longer exists. Used the current equivalent `clearSignal` (resets `emit` to the null emitter and clears slot data) — the dispose/release "no fire after teardown" tests confirm equivalence.
- `dist` tests imported atlas/tileset constructors from `@flighthq/resources`; that package no longer hosts them. Repointed test imports to `@flighthq/textureatlas` (`createTextureAtlas`, `createTextureAtlasRegion`) and `@flighthq/tileset` (`createTileset`, `buildTilesetRegions`), matching the existing `spritesheetFrom.test.ts` / `spritesheetTimelineSource.test.ts` import style and this package's declared deps.

### Type-field gap (noted, not edited — HARD BOUNDARY: do not edit @flighthq/types)

The recovered code writes/reads fields that the current `@flighthq/types` interfaces do not declare: `SpritesheetFrame.{pivotX,pivotY,rotated}`, `SpritesheetAnimation.{direction,frameDurations}`, `SpritesheetPlayer.{paused,speed}`. The type _files_ exist (so not a PARK trigger), only the fields are absent. Tests run under vitest/esbuild (no typecheck) and pass. A follow-up should add these fields to the three type files in `@flighthq/types` so `tsc -b` agrees with the runtime — surfaced as a suggestion, not actioned (cross-package, outside this worktree's boundary).

### Parked

- **createSpritesheetFromGrid** (in `dist/spritesheetFrom.js`) — needs type `GridSliceOptions` in `@flighthq/types`; no `GridSliceOptions.ts` exists there. Recovering it requires editing `@flighthq/types` (forbidden). Its `dist` test block was omitted from the reconstructed `spritesheetFrom.test.ts`.
- **spritesheetValidation.ts** (whole module: `validateSpritesheet`, `validateSpritesheetData`) — needs type `SpritesheetValidationDiagnostic` in `@flighthq/types`; no `SpritesheetValidationDiagnostic.ts` exists there. Parked entirely; not added to `index.ts`.

### Fossils skipped

- None. Nothing recovered or seen here implements a deliberately-dropped concept (no cacheAsBitmap / scrollRect / Loader / Stage-setter / Bitmap-pixelSnapping / Video-smoothing surface in this package).

### Tests

`npm run test --workspace=packages/spritesheet` → 7 files, **113 tests, all passing**.
