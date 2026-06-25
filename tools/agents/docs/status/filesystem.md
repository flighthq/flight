# @flighthq/filesystem — status

## 2026-06-25 — builder R2-4 lost-source recovery

Ran the lost-source recovery sweep against `packages/filesystem/dist/` vs `packages/filesystem/src/`.

**Result: nothing lost. No recovery needed.**

- Only one module exists: `filesystem` (plus `index.ts` barrel). `dist/index.js` and `src/index.ts` are identical (`export * from './filesystem';`).
- Compared the full exported-function set from `dist/filesystem.d.ts` (the type signatures) against `src/filesystem.ts`. After accounting for `export async function` (an initial naive `export (function|const)` grep produced a false "6 missing" signal — `findFiles`, `readDialogHandleBinaryFile`, `readDialogHandleTextFile`, `writeBinaryFileChunks`, `writeDialogHandleBinaryFile`, `writeDialogHandleTextFile` — all of which are in fact present in src as `export async function`), the export sets are identical. `diff` of the normalized names returns empty.
- Verified each of the six suspected functions individually: each has exactly one definition in `src/filesystem.ts`.
- Test parity: `dist/filesystem.test.js` and `src/filesystem.test.ts` have the same 43 `describe` blocks.
- `npm run test --workspace=packages/filesystem`: **97 passed (97)**.

### Recovered

None.

### Fossils skipped

None.

### Parked

None.

### Notes

The curation did not prune this package. src/ already contains the full implementation that dist/ proves compiled, including the dialog-handle read/write helpers, `writeBinaryFileChunks`, and `findFiles`/`globToRegExp`. Module-level helpers (`globToRegExp`, `splitWebPath`, etc.) are present at the bottom of the file per convention. No edits were made to any source file.

## 2026-06-25 — builder R2-4 second-pass recovery

Re-ran the recovery sweep after the parallel `@flighthq/types` recovery pass (the one that restored ~94 lost types), to catch any module the first pass had to park for "needs type X". For filesystem there was nothing parked, so nothing to unpark.

**Result: still nothing lost. No recovery needed, no module unparked.**

- Exported-function sets are identical across all three views: `src/filesystem.ts` (42), `dist/filesystem.js` (42), and `dist/filesystem.d.ts` (42, after normalizing `export async function`). Diff is empty.
- Test parity holds: `src/filesystem.test.ts` and `dist/filesystem.test.js` each have 43 `describe` blocks (alphabetized, mirroring exports) and 97 `it` cases.
- `index.ts` is complete and matches `dist/index.js` (`export * from './filesystem';`).
- Confirmed every type the module imports is now present in `@flighthq/types`: `FileDialogHandle` (src/Dialog.ts) and `FileEntry`, `FilePermissions`, `FileStat`, `FileSystemBackend`, `FileSystemPathKind`, `FileSystemUsage`, `FileWalkOptions`, `FileWatchEvent` (all src/FileSystem.ts). No import points at a missing type, so the hard-boundary park condition does not apply.
- `npm run test --workspace=packages/filesystem`: **97 passed (97)**.

### Recovered

None.

### Fossils skipped

None.

### Parked

None.

### Notes

No edits to any `packages/filesystem/` source file — the package was already whole from the first pass. The dropped-concept list (DisplayObject cacheAsBitmap/scrollRect, the OpenFL Loader, Stage setters, Bitmap pixelSnapping, displayobject lifecycle signals, traversal wrappers) is not relevant to filesystem; none of those concepts appear in `dist/`.
