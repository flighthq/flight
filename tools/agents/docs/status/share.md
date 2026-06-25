# @flighthq/share — status

## 2026-06-25 — builder R2-4 lost-source recovery

No lost source found. The package `src/` is complete and is a superset of the gitignored `dist/` build output.

Investigation:

- `dist/` contains exactly two modules: `index` and `share` (plus `share.test`).
- Every exported function in `dist/share.js` (`attachShareSignals`, `canShareContent`, `createWebShareBackend`, `detachShareSignals`, `disposeShareSignals`, `enableShareSignals`, `getShareBackend`, `isShareAvailable`, `isShareContentValid`, `setShareBackend`, `shareContent`, `shareContentWithResult`, `shareText`, `shareUrl`) is already present in `src/share.ts`.
- Every `describe` block in `dist/share.test.js` is already present in `src/share.test.ts`.
- `src/share.ts` (211 lines) is larger than `dist/share.js` (201 lines), and `src/share.test.ts` (460 lines) is larger than `dist/share.test.js` (395 lines) — the source is richer than the build, not pruned from it.
- `src/index.ts` matches `dist/index.js` (`export * from './share';`).

Result: nothing recovered, no fossils skipped, nothing parked.

Tests: `npm run test --workspace=packages/share` — 44 passed (1 file).

## 2026-06-25 — builder R2-4 second-pass recovery

Re-checked after the parallel type-recovery pass restored ~94 lost types into `@flighthq/types`. Nothing changed for this package — it was already complete in the first pass and nothing was parked for "needs type X", so there was nothing for the type recovery to unblock.

Verification:

- `dist/` still contains exactly the `index`, `share`, and `share.test` modules. No additional lost modules appeared.
- All 14 exported functions in `dist/share.d.ts`/`dist/share.js` are present in `src/share.ts`, plus both internal helpers (`shareContentToNavigatorData`, `shareFileToDomFile`).
- All 14 `describe` blocks and all 44 `it` cases in `dist/share.test.js` are present in `src/share.test.ts` (counts match exactly).
- All five imported types (`ShareBackend`, `ShareContent`, `ShareOptions`, `ShareResult`, `ShareSignals`) resolve in `@flighthq/types` (`Share.ts` + `ShareSignals.ts`; `ShareFile.ts` also present), so no module is blocked on a missing type.
- No dropped/fossil concepts apply to this package (no DisplayObject/Stage/Bitmap/Loader surface here).

Result: nothing recovered, no fossils skipped, nothing parked.

Tests: `npm run test --workspace=packages/share` — 44 passed (1 file).
