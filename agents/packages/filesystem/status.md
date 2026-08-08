---
package: '@flighthq/filesystem'
updated: 2026-08-08
by: principal
---

# filesystem — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/filesystem/src/` on 2026-08-08. A file:line here is
a claim about this tree, not about a session.

- **`watchPath` is a bare command-style callback** (`filesystem.ts:536`), not the suite's event
  capability (`create*` / `attach*` / `detach*` / `dispose*` over a signal entity). Reshaping is
  cheap now and expensive once a native `host-*` backend commits to `watch(path, listener)`; it needs
  a ruling, not a guess.
- **There is no directory-level move or copy.** `renameFile` and `copyFile` resolve a *file* handle on
  web and remove files only (`:167-171`, `:175`, and `writeWebRemove(from, false)`), so both return
  `false` for a directory, and no `copyDirectory` / `moveDirectory` / `emptyDirectory` /
  `getDirectorySize` / `walkFileTree` exists anywhere in `packages/`. Removal is the only directory
  verb that ships.
- **`findFiles` cannot bound its walk.** It calls `readDirectoryRecursive(rootPath)` with no options
  (`:318-319`) even though `FileWalkOptions.maxDepth` exists
  (`packages/types/src/FileSystem.ts:41-43`), so a `*.txt` glob always walks the entire tree.
- **`readTextFile(path)` takes no encoding** (`:497`) — UTF-8 only, with no BOM handling and no
  parallel option on `writeTextFile`.
- **No advisory locking or sync access.** `lockFile` / `releaseFileLock` and OPFS
  `createSyncAccessHandle` are absent from `packages/`; high-throughput worker contexts have no path.
- **`openFileWriteStream` launders the OPFS writable through a double cast** —
  `(await handle.createWritable()) as unknown as WritableStream<Uint8Array>` (`:211`). OPFS's own type
  does not structurally extend the Web Streams type, so the boundary is asserted, not checked.
- **`writeFileAtomic` is not atomic on web.** It writes `path.__atomic_tmp__`, copies into the
  destination, and removes the temp (`:219`); OPFS has no rename, so this is partial-write protection
  under normal conditions, not crash safety.
- **`directoryExists('')` returns `true` on web** — an empty path resolves to zero segments and hands
  back the always-present OPFS root (documented at `:303-305`). A caller passing an unvalidated
  string gets a false positive.
- **No `getFileSystemCapabilities`.** Every native-only operation degrades to a `false`/`null`
  sentinel with no way to ask up front which of them the active backend actually implements.
- **Two structural proposals are unresolved.** Extracting the pure path helpers to a sibling package
  has no second consumer yet, and the obvious name is taken — `packages/path` is the vector-path
  geometry kernel. `@flighthq/filesystem-formats` (mount a zip/tar as a virtual `FileSystemBackend`)
  does not exist and stretches the host-capability-seam framing; surface before building.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two claims checked out **false**: the
  `renameFile` naming concern rested on "the function moves directories too (OPFS copy+remove is
  generic)", but the web `rename` resolves a file handle and calls `writeWebRemove(from, false)`
  (`filesystem.ts:167-171`), so it is file-only and the premise is gone; and "`followSymlinks` in
  `FileWalkOptions` is a stub on web" names a field that no longer exists —
  `packages/types/src/FileSystem.ts:41-43` carries `maxDepth` alone. Rust-mirror items were dropped
  as unverifiable here (no `crates/` directory in this repo).
- **2026-06-24** — Streaming I/O landed: `openFileReadStream`, `openFileWriteStream`,
  `writeBinaryFileChunks`, plus `writeFileAtomic`.
- **2026-06-24** — Symlink and permission seams added (`createFileSymlink`, `readFileSymlink`,
  `getFileRealPath`, `get`/`setFilePermissions`, `canAccessFile`) — native-only, web sentinels.
- **2026-06-24** — `getFileSystemUsage` wired to `navigator.storage.estimate()`; `findFiles` added
  over `readDirectoryRecursive` with an internal glob-to-regexp (`*`, `**`, `?`, case-sensitive).
- **2026-06-24** — First pass: path helpers, `directoryExists`, `removeDirectory`,
  `readDirectoryRecursive`, `readBinaryFileRange`.
