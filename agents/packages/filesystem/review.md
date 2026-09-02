---
package: '@flighthq/filesystem'
status: solid
score: 85
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source (packages/filesystem/src)
  - packages/types/src/FileSystem.ts
  - packages/types/src/Host.ts (HasStorageFileSystem)
  - packages/host-web/src/webFilesystem.ts
---

# filesystem — Review

> Re-review of the live tree (2026-09-02), superseding the 2026-07-13 review (score 82). The major intervening change is a complete architectural reshape: the ambient `getFileSystemBackend`/`setFileSystemBackend`/`enableHostWebFileSystem` state machine has been removed. Every backend-dependent function now takes an explicit `HasStorageFileSystem` host witness as its first argument, and host-web OPFS operations have been extracted to `webFileSystemBackend` in `@flighthq/host-web`. The seven absence-sentinel functions (`createFileSymlink`, `readFileSymlink`, `getFileRealPath`, `getFilePermissions`, `setFilePermissions`, `watchPath`, `getFileSystemPath`) are no longer backed by inert host methods; the package owns their documented results directly. Additionally, `AbortSignal` threading has been added to 15 async functions, with pre-abort rejection on all read/write paths. The charter records this as Decision [2026-08-30].

## Verdict

`solid -- 85/100`. Improved from 82. The package now fully exemplifies the explicit-dependency model: no module-scoped mutable state, no `set*Backend` singleton, no import side effects. The `HasStorageFileSystem` host witness makes the backend a compile-time type constraint, and every absence-sentinel function carries its result directly rather than delegating to an inert host method -- a cleaner separation that the charter's 2026-08-30 Decision names "honest provider shapes." AbortSignal support across all I/O is a genuine completeness gain. The source file is 380 lines (down from 765), 34 exported functions (down from 43 after removing the 9 ambient-state functions), 40 `describe` blocks with 49 `it` blocks in the 333-line test file. What holds it from authoritative: the same structural gaps as before (`watchPath` shape, bulk directory operations, `..`-resolution in path utilities, locking), none of which has been addressed, but the architecture beneath them is now clean enough that each is a straightforward additive pass.

## Present capabilities

Verified against `packages/filesystem/src/filesystem.ts` (380 lines) and `filesystem.test.ts` (333 lines):

- **Files**: `readTextFile`, `writeTextFile`, `appendTextFile`, `readBinaryFile`, `writeBinaryFile`, `readBinaryFileRange`, `copyFile`, `renameFile`, `removeFile`, `fileExists`, `statFile`, `writeFileAtomic`. Every read/write function accepts an optional `AbortSignal` and rejects immediately on pre-aborted signals.
- **Directories**: `makeDirectory`, `readDirectory` (with signal), `readDirectoryRecursive(path, FileWalkOptions)` with `maxDepth` and signal via `FileWalkOptions.signal`, `directoryExists`, `removeDirectory(path, recursive?)`, `findFiles` (glob `*`/`**`/`?`, case-sensitive, composed over recursive walk, now passes `options` through to `readDirectoryRecursive`).
- **Streaming**: `openFileReadStream`, `openFileWriteStream` (both with signal), `writeBinaryFileChunks` (async-iterable chunked write with abort listener, writer abort on failure, listener cleanup in `finally`).
- **Native-absence sentinels (package-owned, no host delegation)**: `createFileSymlink` returns `false`, `readFileSymlink` returns `null`, `getFileRealPath` returns `null`, `getFilePermissions` returns `null`, `setFilePermissions` returns `false`, `watchPath` returns a no-op unsubscribe, `getFileSystemPath` returns `''`. Each carries a comment naming the absence: "outside the honest host-provider surface until a real provider exists."
- **Host-delegated with optional-chaining sentinels**: `canAccessFile`, `getFileSystemUsage` -- these use `host.storage.fileSystem.method?.() ?? sentinel` so they degrade gracefully when a backend omits the method.
- **Path utilities (pure, no backend)**: `getFileBaseName`, `getFileDirectoryName`, `getFileExtensionName`, `isAbsoluteFilePath` (POSIX `/` + Windows drive letter `C:`), `joinFilePath`, `normalizeFilePath`. Six functions, zero dependencies.
- **Dialog bridge**: `readDialogHandleBinaryFile`, `readDialogHandleTextFile`, `writeDialogHandleBinaryFile`, `writeDialogHandleTextFile` -- four functions consuming `FileDialogHandle` from `@flighthq/dialog/contract`, with native-path delegation and retained-handle-operations fallback. All accept signal.
- **Host-web backend** (`packages/host-web/src/webFilesystem.ts`): `webFileSystemBackend` implements every `FileSystemHostBackend` member that OPFS can express (21 operations). The seven absence operations are structurally absent from the backend type, matching the charter's "honest provider shapes" decision.

## Gaps

Ordered by distance-to-authoritative:

1. **`watchPath` is below the suite's event-capability convention.** A bare `(host, path, listener) => unsubscribe` callback returning a no-op. The suite convention for event capabilities is a signal entity (`create*`/`attach*`/`detach*`/`dispose*`); recursive watch, debounce/coalesce are unaddressed. Chartered as Open direction #1.
2. **Bulk directory operations absent**: `copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`, `walkFileTree`. `renameFile` on web delegates to `copy`+`removeFile` at the host level; there is no directory mover or copier anywhere in `packages/`.
3. **Path utilities do not resolve `..` segments** -- `normalizeFilePath('a/b/../c')` preserves the `..` literally (`splitPath` filters only `''` and `'.'`). Textbook normalize resolves parent segments (without escaping a relative root). Windows `\` separator handling is also absent. The assessment already placed `..`-resolution in Recommended; it remains unimplemented.
4. **No locking / sync-access-handle tier**: advisory `lockFile`/`releaseFileLock` brackets and OPFS `createSyncAccessHandle` are absent.
5. **Text I/O is UTF-8-only** -- no encoding parameter on `readTextFile`/`writeTextFile`, no BOM handling.
6. **Naming reshape window** (charter Open direction #2): `findFiles` returns directory entries too (glob tests `entry.name` and `entry.path` with no `isDirectory` filter); `renameFile` is file-only on web but the name implies file scope while a native backend might move directories. `findPaths`/`renamePath` are candidates before native hosts commit.
7. **No diagnostics layer** -- the many silent sentinels (`null`/`false`/`[]`/`''`) have no `explain*` queries or `enableFilesystemGuards`. Suite-wide pattern shared by every platform cell.
8. **Test depth is shallow for edge cases.** Every exported function has at least one test, and `describe` blocks are alphabetized and match exports 1:1. However, many tests verify only a single happy path (e.g., `getFileBaseName` has one case, `joinFilePath` one case). The `findFiles` glob test covers `**/*.bin` but not `*`, `?`, or edge patterns. `AbortSignal` pre-abort rejection is tested for `readBinaryFile` and `writeBinaryFileChunks` but not systematically for all 15 signal-accepting functions.
9. **Rust mirror `flighthq-filesystem` unstarted** (the pure path utilities are the clean first slice).

## Charter contradictions

None found. The tree matches all three recorded Decisions:

- **[2026-07-02] Path utils stay in filesystem.** The six pure path utilities remain in-package with zero backend dependency. Confirmed.
- **[2026-07-02] The `@flighthq/dialog` dependency is acceptable.** `package.json` lists `@flighthq/dialog` as the sole package dependency besides `@flighthq/types`. The four bridge functions import only `getFileDialogHandleOperations` from `@flighthq/dialog/contract`. Confirmed.
- **[2026-08-30] Host selection is explicit and provider shapes are honest.** No `getFileSystemBackend`, `setFileSystemBackend`, `enableHostWeb*`, or module-scoped state exists anywhere in the package. Every backend-dependent function takes `host: HasStorageFileSystem` as its first argument. The seven absence-sentinel functions carry their results directly with no host delegation. `webFileSystemBackend` in `host-web` structurally omits those seven members. Confirmed.

## Contract & docs fit

- **Types-first satisfied.** `FileSystemHostBackend`, `FileSystemBasicBackend`, `FileEntry`, `FileStat`, `FilePermissions`, `FileSystemUsage`, `FileWalkOptions`, `FileWatchEvent`, `FileSystemPathKind`, `HasStorageFileSystem` all live in `@flighthq/types`. `FileDialogHandle` in `@flighthq/types`. The package exports functions only.
- **Export lanes correct.** `index.ts` selectively re-exports from `./contract` (the curated public lane). `contract.ts` re-exports `./filesystem`. The `package.json` `exports` field exposes `.` and `./contract` only. No stray subpaths.
- **`sideEffects: false`** declared and upheld -- no module-level side effects, no top-level registration. This is a genuine improvement: the previous review noted `getFileSystemBackend` lazily creating an OPFS default as module state; that is entirely gone.
- **Sentinels throughout, never throws** for expected failures. `AbortSignal` pre-abort rejection is the correct behavior (programmer-error class -- the caller already aborted).
- **`Readonly<>` applied** on `FileDialogHandle`, `Uint8Array` data params, `FileWalkOptions`, `FilePermissions`, `FileWatchEvent`.
- **Exports alphabetized** in both `index.ts` and within `filesystem.ts`. Tests alphabetized and mirror exports 1:1.
- **Package Map line** (`@flighthq/filesystem`: file read/write/list/stat and standard directory paths (web backend over OPFS)) is now partially inaccurate: the web backend no longer lives in this package. It should read something like "file read/write/list/stat, streaming I/O, directory walk, path utilities, and dialog-handle bridge over an explicit `HasStorageFileSystem` host." Candidate revision behind the user's gate.

## Candidate open directions

1. **Record the file/directory verb split as a charter Decision.** `removeFile` is strictly file-only; `removeDirectory` is the directory verb. This is implemented and load-bearing for native backends but still unrecorded in the charter's Decisions.
2. **Bulk directory operations** (`copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`, `walkFileTree`) -- additive free functions over the existing seam, but each needs a seam-method decision: backend-native method vs composed-over-walk.
3. **Locking + OPFS sync-access-handle tier** -- gates high-throughput worker use.
4. **`getFileSystemCapabilities` introspection.** Every native-only operation degrades to a sentinel with no way to ask up front which operations the active backend supports. A capabilities query returning a plain data object would let callers branch without trial-and-error. The status.md names this; the charter does not.
5. **Diagnostic layer scope.** Whether `explainFilesystemResult` / `enableFilesystemGuards` should be per-package or coordinated as a single platform-suite decision.
