---
package: '@flighthq/filesystem'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - status.md
  - charter.md
  - source (packages/filesystem/src)
  - packages/types/src/FileSystem.ts + Dialog.ts
---

# filesystem — Review

> Depth review of the live tree (2026-07-13). Supersedes the 2026-06-25 merge-gate review of `integration-b2824e3d8`, whose REVISE verdict (58) scored a snapshot where the `@flighthq/types` header half of the change was missing. **That blocker is resolved**: `packages/types/src/FileSystem.ts` now carries `FilePermissions`, `FileSystemUsage`, `FileWalkOptions`, and the full extended `FileSystemBackend` (streams, ranged read, recursive walk, atomic write, symlink/permissions/real-path, usage), and `packages/types/src/Dialog.ts` defines `FileDialogHandle`. Source, tests, and header are in sync; the June "as-claimed, not landed" status finding no longer describes this tree.

## Verdict

`solid — 82/100`. The largest and most complete cell in the platform suite: 43 exported free functions covering every row of the textbook filesystem rubric — text/binary read/write/append, ranged read, directory CRUD (list, create, remove with the POSIX file/directory verb split), recursive walk with `maxDepth`, glob `findFiles`, streaming I/O plus chunked write, atomic write, stat/metadata, watch seam, six pure path utilities, permissions/symlink/real-path native seams, disk-usage, and the sanctioned `@flighthq/dialog` handle bridge (4 functions). The web (OPFS) default implements everything OPFS can express and returns honest sentinels for the rest; every API touch is guarded. 97 colocated tests mirror the exports 1:1, including jsdom sentinel coverage per function. What separates it from authoritative: the `watchPath` shape is below the suite's event-capability convention (web no-op bare callback), bulk directory operations and locking are absent, and the path utilities do not resolve `..` segments or Windows `\` separators.

## Present capabilities

Verified against `packages/filesystem/src/filesystem.ts` (765 lines) and `filesystem.test.ts` (909 lines, 97 tests):

- **Files**: `readTextFile` / `writeTextFile` / `appendTextFile`, `readBinaryFile` / `writeBinaryFile`, `readBinaryFileRange` (empty-array for out-of-range, null for missing), `copyFile`, `renameFile`, `removeFile` (strictly file-only — web verifies a file handle before removal), `fileExists`, `statFile`, `writeFileAtomic` (temp-sibling then replace; documented best-effort/not-crash-safe on OPFS).
- **Directories**: `makeDirectory` (creates parents), `readDirectory`, `readDirectoryRecursive(path, FileWalkOptions)` with `maxDepth`, `directoryExists` (documented `''`→OPFS-root edge), `removeDirectory(path, recursive?)`, `findFiles` glob (`*` / `**` / `?`, case-sensitive) composed over the recursive walk.
- **Streaming**: `openFileReadStream` (OPFS `File.stream()`), `openFileWriteStream` (`createWritable()`), `writeBinaryFileChunks` (async-iterable chunked write, never holds the payload; aborts the writer on failure).
- **Native seams (web sentinels)**: `createFileSymlink` / `readFileSymlink` / `getFileRealPath`, `getFilePermissions` / `setFilePermissions`, `canAccessFile('readable' | 'writable' | 'executable')` (web probes handles / `createWritable` for readable/writable, false for executable), `getFileSystemUsage` (web via `navigator.storage.estimate()`), `watchPath` (web no-op unsubscribe), `getFileSystemPath` (web `''`).
- **Path utilities (pure, no backend)**: `getFileBaseName`, `getFileDirectoryName`, `getFileExtensionName`, `isAbsoluteFilePath` (POSIX `/` + Windows drive letter), `joinFilePath`, `normalizeFilePath`.
- **Dialog bridge**: `readDialogHandleBinaryFile` / `readDialogHandleTextFile` / `writeDialogHandleBinaryFile` / `writeDialogHandleTextFile` over `FileDialogHandle` — native path delegation, live web `FileSystemFileHandle` via `getWebFileSystemHandle`, OPFS-by-name fallback.
- **Seam discipline**: `getFileSystemBackend` lazily creates the OPFS default (no import-time side effect), `setFileSystemBackend(null)` restores it; `package.json` keeps `"sideEffects": false` and the single `.` export; module state and helpers sit below the exports.

## Gaps

Ordered by distance-to-authoritative:

1. **`watchPath` is below the suite's event-capability convention.** A bare `(path, listener) → unsubscribe` callback, web no-op. The suite convention for event capabilities is a signal entity (`create*`/`attach*`/`detach*`/`dispose*`); recursive watch, debounce/coalesce are unaddressed. Chartered as Open direction #1 — a design decision, not a sweep.
2. **Bulk directory operations absent**: `copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`. `renameFile` on web moves single files only (copy+remove); there is no directory mover.
3. **Path utilities do not resolve `..`** — `normalizeFilePath('a/b/../c')` preserves the `..` literally (`splitWebPath` filters only `''` and `.`), and `\` is never treated as a separator. A textbook normalize resolves parent segments; Windows-awareness is a separate design call.
4. **No locking / sync-access-handle tier**: advisory `lockFile`/`releaseFileLock` brackets and OPFS `createSyncAccessHandle` (high-throughput worker I/O) are unbuilt.
5. **Text I/O is UTF-8-only** — no encoding parameter, no BOM handling.
6. **Naming reshape window still open** (charter Open direction #2): `findFiles` returns directory entries too (filters `name || path` match with no `isDirectory` filter); `renameFile` is the only mover and moves directories on native. `findPaths` / `renamePath` candidates before native hosts commit.
7. **No diagnostics layer** — the many silent sentinels (`null`/`false`/`[]`) have no `explain*` queries or `enable*Guards`; suite-wide condition shared by every platform cell.
8. **Rust mirror `flighthq-filesystem` unstarted** (the pure path utilities are the clean first slice).

## Charter contradictions

None. The tree matches both 2026-07-02 Decisions: the six path utilities live in-package, and the `@flighthq/dialog` dependency stands as the suite's only sanctioned sibling import. The POSIX file/directory verb split (`removeFile` strictly file-only, `removeDirectory` the directory verb) that the June review flagged as "likely intended Decision; worth recording" is implemented but still not recorded as a charter Decision — a candidate for the next direction session.

## Contract & docs fit

- Types-first is now satisfied: the full `FileSystemBackend` seam, `FilePermissions`, `FileSystemUsage`, `FileWalkOptions` live in `@flighthq/types`; `FileDialogHandle` in `Dialog.ts`. The June status entry's "as-claimed, not landed" annotation is resolved — the claims are true of this tree.
- Sentinels throughout, never throws; `Readonly<>` on data/handle/options params; no `dispose*`/`destroy*` needed (nothing owns a non-GC resource); exports alphabetized; tests mirror exports in order.
- Package Map line ("read/write files and directory access") undersells the cell — streams, glob, atomic write, permissions seam, dialog bridge. A doc widen behind the user's gate.

## Candidate open directions

1. Record the file/directory verb split as a charter Decision (it is implemented and load-bearing for native backends).
2. Bulk directory operations tier (`copyDirectory` / `moveDirectory` / `emptyDirectory` / `getDirectorySize`) — additive free functions over the existing seam, but each needs a seam-method decision (backend-native vs composed-over-walk).
3. Locking + OPFS sync-access-handle tier — gates high-throughput worker use.
4. `@flighthq/filesystem-formats` archive-as-backend (zip/tar mounted through `FileSystemBackend`) — held at the plurality guard until a second virtual backend is real.
