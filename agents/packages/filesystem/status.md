---
package: '@flighthq/filesystem'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# filesystem — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/filesystem

**Session date**: 2026-06-24 **Starting score (first pass)**: 83/100 **Estimated new score (second pass)**: 93/100

## Implemented APIs (cumulative, both passes)

### New types in `@flighthq/types` (this session)

- **`FilePermissions`** (`packages/types/src/FilePermissions.ts`) — POSIX-style permission flags: `readable`, `writable`, `executable`, optional `mode?: number`. Exported from the types index.

- **`FileSystemUsage`** (`packages/types/src/FileSystemUsage.ts`) — disk/quota usage descriptor: `usedBytes`, `quotaBytes`. Exported from the types index.

- **`FileSystemBackend` interface additions** (`packages/types/src/FileSystem.ts`) — eleven new methods added to the seam:
  - `openFileReadStream(path): Promise<ReadableStream<Uint8Array> | null>` — streaming read
  - `openFileWriteStream(path): Promise<WritableStream<Uint8Array> | null>` — streaming write
  - `writeFileAtomic(path, data): Promise<boolean>` — temp-then-rename atomic write
  - `createFileSymlink(target, linkPath): Promise<boolean>` — create symlink (native-only)
  - `readFileSymlink(path): Promise<string | null>` — read symlink target (native-only)
  - `getFileRealPath(path): Promise<string | null>` — resolve canonical path (native-only)
  - `getFilePermissions(path): Promise<FilePermissions | null>` — read permissions
  - `setFilePermissions(path, permissions): Promise<boolean>` — set permissions (native-only)
  - `canAccessFile(path, mode): Promise<boolean>` — access check (native-only for executable)
  - `getFileSystemUsage(): Promise<FileSystemUsage | null>` — disk/quota introspection
  - `removeFile` JSDoc clarification: "Must not remove directories — use removeDirectory for that."

### New types in `@flighthq/types` (first pass)

- **`FileWalkOptions`** (`packages/types/src/FileWalkOptions.ts`) — `maxDepth?: number`, `followSymlinks?: boolean`.
- **`FileSystemBackend` first-pass additions**: `readBinaryFileRange`, `directoryExists`, `removeDirectory`, `readDirectoryRecursive`.

### New free functions in `@flighthq/filesystem` (this session)

Streaming I/O:

- `openFileReadStream(path)` — delegates to backend; OPFS via `File.stream()`
- `openFileWriteStream(path)` — delegates to backend; OPFS via `FileSystemFileHandle.createWritable()`
- `writeBinaryFileChunks(path, chunks)` — convenience chunked write over `openFileWriteStream`; never holds full payload in memory; `false` sentinel if stream unavailable
- `writeFileAtomic(path, data)` — write to temp sibling then copy-replace into destination; best-effort on web (OPFS rename is copy+remove, not OS-atomic)

Symlink operations (seam additions; native-only):

- `createFileSymlink(target, linkPath)` — web always returns false
- `readFileSymlink(path)` — web always returns null
- `getFileRealPath(path)` — web always returns null

Permissions:

- `getFilePermissions(path)` — web always returns null; native returns `FilePermissions`
- `setFilePermissions(path, permissions)` — web always returns false; native implements chmod
- `canAccessFile(path, mode)` — web returns false for executable; readable/writable are best-effort via OPFS probes

Disk/quota:

- `getFileSystemUsage()` — web via `navigator.storage.estimate()`; native via statvfs

Pattern matching:

- `findFiles(rootPath, pattern)` — glob filter over `readDirectoryRecursive`; supports `*`, `**`, `?`

### New free functions from first pass

Path utilities (pure strings, no backend):

- `getFileBaseName`, `getFileDirectoryName`, `getFileExtensionName`, `isAbsoluteFilePath`, `joinFilePath`, `normalizeFilePath`

Directory/existence:

- `directoryExists`, `removeDirectory`, `readDirectoryRecursive`

Binary I/O:

- `readBinaryFileRange`

### Web backend (`createWebFileSystemBackend`) — full implementation

All interface methods implemented with OPFS backing or documented no-ops:

- `openFileReadStream`: `handle.getFile()` → `File.stream()`
- `openFileWriteStream`: `getWebFileHandle(true)` → `createWritable()`
- `writeFileAtomic`: writes to `path.__atomic_tmp__`, copies content to destination, removes temp
- `createFileSymlink`: returns false (OPFS has no symlinks)
- `readFileSymlink`: returns null
- `getFileRealPath`: returns null
- `getFilePermissions`: returns null (OPFS has no permissions model)
- `setFilePermissions`: returns false
- `canAccessFile`: false for executable; readable via handle probe; writable via createWritable probe
- `getFileSystemUsage`: `navigator.storage.estimate()` → `FileSystemUsage`

### Earlier cumulative backend additions (first pass)

- `readBinaryFileRange`: `file.slice(offset, offset + length)`
- `directoryExists`: `getWebDirectoryHandle` walk
- `removeDirectory`: resolves parent, `removeEntry({ recursive })`
- `readDirectoryRecursive`: `walkWebDirectory` recursive helper

### Tests

97 tests pass across all describe blocks.

New describes added this session:

- `canAccessFile` — readable/executable/missing/jsdom
- `createFileSymlink` — backend delegation, jsdom sentinel
- `findFiles` — `*.txt` glob, `**/*.txt` path glob, jsdom sentinel
- `getFilePermissions` — null when unset, round-trip with setFilePermissions, jsdom sentinel
- `getFileRealPath` — identity delegation, jsdom sentinel
- `getFileSystemUsage` — returns usage, jsdom sentinel
- `openFileReadStream` — reads bytes, missing returns null, jsdom sentinel
- `openFileWriteStream` — writes data on close, jsdom sentinel
- `readFileSymlink` — null for regular file, target after createFileSymlink, jsdom sentinel
- `setFilePermissions` — round-trip, jsdom sentinel
- `writeBinaryFileChunks` — multi-chunk write, jsdom sentinel
- `writeFileAtomic` — binary and text, jsdom sentinel
- `createWebFileSystemBackend` — expanded to cover all new sentinel methods

## Design choices

### glob-to-regexp helper

`findFiles` composes with `readDirectoryRecursive` and uses an internal `globToRegExp` function. Glob rules: `*` matches any characters within a segment (no `/`), `**` matches across segments, `?` matches one non-`/` character. Other regex special chars are escaped. Case-sensitive (matches POSIX fs convention).

### `writeFileAtomic` on web

OPFS has no OS-level atomic rename. The web implementation uses a temp file (`path.__atomic_tmp__`), copies content, then overwrites the destination. This is best-effort — it protects against partial writes under normal conditions but is not crash-safe. This is documented in the JSDoc and the interface contract.

### Symlink / permissions seam

Symlink and permission operations are native-only capabilities. They are now present on the `FileSystemBackend` interface (so native backends like `host-electron` can implement them) with web backends returning sentinels. The value is unlocking native backends, not the web default.

### `openFileReadStream` / `openFileWriteStream` return types

Uses the standard `ReadableStream<Uint8Array>` / `WritableStream<Uint8Array>` Web Streams API. This avoids a bespoke handle type and keeps the boundary plain. `null` sentinel when unavailable (file missing, access denied, or backend does not support streaming).

### `canAccessFile` on web

`executable` always returns false. `readable` checks whether a file or directory handle can be resolved. `writable` probes `createWritable()` (and immediately aborts the writable to avoid side effects).

## Deferred items and why

### Gold items (not yet implemented)

- **File-watch as a first-class event capability**: Today `watchPath` is a bare command-style callback. The Gold roadmap promotes this to the suite's event-capability shape (`FileSystemWatch` entity of signals with `create*`/`attach*`/`detach*`/`dispose*`). This requires a `@flighthq/signals` dependency and a careful design decision about the existing `watchPath` callback contract. Deferred — needs explicit user decision before starting.

- **Locking / sync-access-handle**: `lockFile` / `releaseFileLock` (advisory locks, `acquire`/`release` bracket semantics) and OPFS `createSyncAccessHandle` for high-throughput worker contexts. Medium effort; deferred.

- **Bulk directory operations**: `copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`, `walkFileTree` callback-style traversal. Deferred to Gold.

- **`@flighthq/filesystem-formats` neighbor**: zip/tar as a virtual `FileSystemBackend` (mount an archive through the same free-function surface). The design is elegant but stretches the "host capability seam" framing toward a virtual-fs abstraction — surface as a proposal before building.

- **Full edge-case + error sweep**: Windows path normalization (`\` vs `/`, UNC paths), symlink-loop detection in recursive walks, encoding options on text I/O (`readTextFile(path, encoding)` beyond UTF-8), BOM handling, `getFileSystemCapabilities()` capability matrix. Deferred.

- **Rust-port mirror (`flighthq-filesystem`)**: The path utilities (pure value-typed, no backend) are a clean mixing candidate. Should track the TS seam after Silver fully settles. Deferred.

### Design decisions still needing user input

1. **`watchPath` command → `FileSystemWatch` event reshape (Gold)**: The current bare-callback `watchPath` is web-no-op. Before any native `host-*` backend commits to the old `watch(path, listener)` contract, decide whether to promote it to the event-capability shape. Inexpensive to reshape pre-release.

2. **`@flighthq/path` extraction**: Path utilities are currently in `@flighthq/filesystem`. If `resources` or `loader` needs them, extraction to a sibling `@flighthq/path` (Silver) becomes worthwhile. No second consumer has appeared yet.

3. **`@flighthq/filesystem-formats` archive-as-backend (Gold)**: Mounting a zip/tar through `FileSystemBackend` is design-decision territory — surface before building.

4. **`renameFile` naming**: The function moves directories too (OPFS copy+remove is generic), yet the name says `File`. Consider `renamePath` or add a parallel `renameDirectory`. Pre-release, low cost. Not changed here to avoid scope creep.

## Concerns and surprises

- **`directoryExists('')` OPFS root edge case**: Passing an empty string resolves to 0 segments and returns the OPFS root handle (always non-null), so `directoryExists('')` returns `true` on web. Documented in JSDoc. Use an explicit non-empty path to avoid ambiguity.

- **`writeFileAtomic` on web is not crash-safe**: The web implementation uses copy+remove, not an OS rename. Partial-write protection is best-effort. Documented in JSDoc and interface contract.

- **`followSymlinks` in `FileWalkOptions` is a stub on web**: OPFS has no symlinks; the field exists on the seam so native backends can implement it. The web backend ignores the flag.

- **Streaming `openFileWriteStream` on OPFS**: Returns the OPFS `FileSystemWritableFileStream` cast as `WritableStream<Uint8Array>`. This works in spec-compliant browsers but the cast bypasses TypeScript's structural check. The narrowest safe path given OPFS's own types not extending the Web Streams WritableStream directly.

## Score estimate

**93/100**

Breakdown vs. previous pass (83/100):

- +4 pts: Streaming I/O (openFileReadStream, openFileWriteStream, writeBinaryFileChunks) — Silver requirement fully landed
- +2 pts: Atomic write (writeFileAtomic) — canonical durability primitive
- +2 pts: Symlink seam (createFileSymlink, readFileSymlink, getFileRealPath) — seam now complete for native backends
- +1 pt: Permissions seam (getFilePermissions, setFilePermissions, canAccessFile, FilePermissions type) — seam complete
- +1 pt: Disk/quota (getFileSystemUsage, FileSystemUsage type) — OPFS estimate wired
- +1 pt: findFiles glob matching — composes cleanly with readDirectoryRecursive
- −1 pt residual: Gold items still outstanding (file-watch event-capability, locking, bulk dir ops, formats neighbor, full edge sweep, Rust mirror)

The package is now competitive with Node `fs/promises`, Deno `fs`, and Tauri `fs` for the capabilities that have a meaningful web-backend implementation. The remaining 7 points are Gold features that require user design decisions (file-watch reshape, archive-backend, Rust mirror) or significant scope (locking, bulk ops, edge sweep).
