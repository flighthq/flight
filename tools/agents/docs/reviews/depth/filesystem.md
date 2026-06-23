# Depth Review: @flighthq/filesystem

**Domain**: Host file system access — read/write files and directories over a swappable web (OPFS) / native backend. Part of Flight's Platform Integration Suite (a capability seam, not a standalone fs library).

**Verdict**: solid — 72/100

The package is a clean, complete realization of the platform-suite "command capability" pattern for file access: a flat free-function surface delegating to a swappable `FileSystemBackend`, with a fully-implemented web (OPFS) default that guards every API touch and returns sentinels in jsdom. For its stated scope ("file read/write/list/stat and standard directory paths") it is essentially done. Judged against the broadest interpretation of an _authoritative_ file system library, it covers the canonical CRUD + metadata + watch + well-known-paths set but omits several capabilities a mature fs API typically exposes (streaming, path utilities, symlink/permission ops, recursive directory listing, byte-range reads).

## Present capabilities

File ops:

- `readTextFile`, `writeTextFile`, `appendTextFile`
- `readBinaryFile`, `writeBinaryFile`
- `fileExists`
- `copyFile`, `renameFile` (rename doubles as move)
- `removeFile` (recursive removal of files and directories)

Directory ops:

- `makeDirectory` (creates parents)
- `readDirectory` (one-level listing returning `FileEntry` { name, path, isDirectory })

Metadata / well-known paths:

- `statFile` → `FileStat` { size, isDirectory, modifiedTime, createdTime, isSymlink }
- `getFileSystemPath(kind)` over `FileSystemPathKind` = home | documents | desktop | downloads | temp | appData | cache

Watching:

- `watchPath(path, listener)` → unsubscribe; `FileWatchEvent` { type: created|modified|deleted, path }. No-op on web (OPFS has no notifications), documented as native-only.

Backend seam (matches suite convention):

- `getFileSystemBackend` (lazy web default), `setFileSystemBackend` (null resets to web), `createWebFileSystemBackend`.
- Web backend is genuinely implemented over OPFS: nested-path resolution via segment walking, `createWritable` writes, copy-then-remove rename (OPFS has no native rename), append via read-concat-rewrite, recursive `removeEntry`. Every entry point is null/secure-context guarded and try/catch-wrapped to sentinels. Solid colocated test file (~9KB) exercising the surface.

## Gaps vs an authoritative file system library

Missing-by-omission (would strengthen the package within its own scope):

- **Recursive / glob directory traversal.** `readDirectory` is single-level only; there is no recursive walk or pattern match, which most fs libraries (and OPFS apps) need. A `readDirectoryRecursive` or a `recursive` option is the obvious gap.
- **Byte-range / partial reads.** No way to read a slice of a large file; `readBinaryFile` is all-or-nothing. OPFS `getFile()` exposes `.slice()`, so a ranged read is feasible on the web backend too.
- **Streaming I/O.** No streaming read/write handles. For a graphics/app SDK loading large assets, a streaming or chunked write path is a common expectation; everything here buffers the whole payload.
- **Directory-specific removal vs file removal.** `removeFile` recursively deletes directories too, which is convenient but conflates two operations; an explicit `removeDirectory` (and a non-recursive guard) is the canonical split.
- **Path utilities.** No `join`, `dirname`, `basename`, `extname`, `resolve`, or normalization helpers exposed. The web backend normalizes internally (`splitWebPath`) but none of that is public, so callers must hand-build `'/'`-joined strings. A mature fs domain usually ships a small path module (or a sibling `path` package).
- **Symlink operations.** `FileStat.isSymlink` exists but there are no `createSymlink` / `readSymlink` / `realpath` operations to act on it — the field is read-only metadata with no write side.
- **Permissions / mode.** No chmod/access/permission querying. Reasonable to defer (web has none), but absent for native completeness.
- **Existence granularity.** `fileExists` is true only for files (it resolves a file handle); there is no `directoryExists`. `statFile` can distinguish, but a boolean directory-exists helper is a common convenience.
- **Atomic / temp-write helpers.** No "write to temp then rename" atomic-write helper, a standard durability primitive.

Missing-by-design (correct to omit here):

- Streaming, symlink, and permission ops are arguably native-host concerns that belong behind the backend rather than the web default — but they are absent from the `FileSystemBackend` _interface_ in `@flighthq/types`, so they are unreachable for native hosts too. That makes them omissions from the seam, not just the web backend.
- No Node `fs` backend in this package: the codebase map explicitly routes a node-fs injection through a future host adapter, so its absence here is by design.

## Naming / API-shape notes

- Naming is consistent with the suite and the project rule that exported names carry the full type word: `readTextFile`, `writeBinaryFile`, `getFileSystemPath`, `setFileSystemBackend`. Globally self-identifying.
- Slight asymmetry: most ops are `*File` (`copyFile`, `renameFile`, `removeFile`) but directory ops are `makeDirectory` / `readDirectory` and `removeFile` covers both. `renameFile` also moves directories despite the `File` suffix. Acceptable, but an authoritative API would likely separate file vs directory verbs more crisply.
- Sentinel discipline is exemplary and matches the project rule: reads → `null`/`[]`, writes → `false`, never throws for missing/denied. `FileSystemBackend` interface documents this contract clearly.
- Tree-shakable, `"sideEffects": false`, single root export, no top-level registration — fully compliant with the package rules. Lazy backend creation avoids eager OPFS touch.
- `getFileSystemPath` returns `''` for the empty/unavailable case rather than `null`; a minor sentinel inconsistency vs the rest of the surface (strings use `''`, which is defensible).

## Recommendation

Treat as **solid** and close to done for its declared scope. To push toward authoritative within the file-system domain, prioritize adding to the `FileSystemBackend` seam (in `@flighthq/types`) and the free-function surface: (1) recursive directory listing, (2) ranged/partial binary read, (3) an explicit `removeDirectory` distinct from file removal and a `directoryExists` helper, and (4) public path utilities (`join`/`dirname`/`basename`/`extname`) or a sibling `path` package. Streaming I/O, symlink write ops, and permissions are reasonable second-tier additions, primarily for native hosts — but they should be added to the _interface_ so native backends can implement them, not left out of the seam entirely. None of these are large; the package is well-structured to absorb them.
