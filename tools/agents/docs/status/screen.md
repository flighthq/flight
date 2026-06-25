# @flighthq/screen — status

## 2026-06-25 — builder R2-4 second-pass recovery

Re-checked after the parallel pass that recovered ~94 lost types into `@flighthq/types`, in case modules were previously parked for a now-present type. Diffed the build output (`dist/`) against live source (`src/`) again.

**Result: nothing lost, nothing parked to revisit. No recovery needed.**

- The first pass parked nothing, so there was no "needs type X" module to reconsider.
- `src/screen.ts` remains a strict superset of `dist/screen.d.ts`/`dist/screen.js`: all 30 dist exports are present in src, plus `onScreenDetailPermissionChange` (and its colocated test `describe`), which the dist build artifact never contained. No `dist/<m>.js` lacks a `src/` counterpart; no exported function in the build output is absent from source.
- `index.ts` (`export * from './screen'`) already matches `dist/index.js`.
- No dropped-concept fossils (cacheAsBitmap, Loader, Stage setters, etc.) are present in this package's dist; none applied.

- Recovered: none.
- Skipped-fossil: none.
- Parked: none.
- Tests: `npm run test --workspace=packages/screen` — 1 file, 59 passed.

## 2026-06-25 — builder R2-4 lost-source recovery

Checked for source lost to the integration curation by diffing the build output (`dist/`) against live source (`src/`).

**Result: nothing lost. No recovery needed.**

The package is a single module (`screen`). Comparing exported functions and test `describe` blocks:

- Every function in `dist/screen.d.ts` (30 exports) is present in `src/screen.ts`.
- `src/screen.ts` additionally has `onScreenDetailPermissionChange`, which is NOT in the dist build output — so `src/` is a strict superset of `dist/`. The live source is newer/more complete than the committed build artifact; the curation did not prune this package.
- Test `describe` blocks match the same pattern: `src/screen.test.ts` mirrors all dist test blocks plus `onScreenDetailPermissionChange`.

No `dist/<m>.js` had a missing `src/` counterpart, and no exported function in the build output was absent from source. The `index.ts` barrel (`export * from './screen'`) already matches `dist/index.js`.

- Modules recovered: none.
- Fossils skipped: none.
- Parked: none.
- Tests: `npm run test --workspace=packages/screen` — 1 file, 59 passed.
