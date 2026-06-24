---
package: '@flighthq/filesystem'
crate: flighthq-filesystem
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# filesystem — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Host file system access for Flight: a flat surface of free functions — read/write/append text and binary files, directory CRUD, stat/metadata, recursive traversal and glob, ranged and streaming I/O, atomic write, a symlink/permissions seam, disk-usage introspection, pure path utilities, and a file-watch callback — each delegating to a swappable `FileSystemBackend`. A fully implemented OPFS web default ships in-crate, guards every API touch, and returns sentinels (`null`/`[]`/`false`) in unsupported environments rather than throwing.

It is a member of Flight's Platform Integration Suite, not a standalone fs library: it is the _capability seam_ a native host (Electron node-`fs`, Tauri, a C/C++ shell) fills via `setFileSystemBackend`, with the web/OPFS backend as the always-available default. It ends where a _host adapter_ begins (`host-electron` and future `host-*` crates implement the backend; they are not this package) and where pure data-format work begins (a zip/tar virtual backend would be a separate cell, not folded in here). The package currently also bridges `@flighthq/dialog` file handles (`read/writeDialogHandle*File`) — a cross-cell coupling whose home is an open question below.

## North star (proposed)

1. **Backend seam, web default in-crate.** One swappable `FileSystemBackend` behind flat free functions; the OPFS web backend ships with the package and is lazily created (no eager OPFS touch), so every function works on the web and a native host swaps the seam without changing call sites.
2. **Sentinels, never throws.** Reads return `null`/`[]`, writes return `false`, missing/denied paths are expected failures — never exceptions. This discipline is exemplary today and is the contract a native backend must also honor.
3. **Full, unabbreviated, self-identifying names.** `getFileSystemUsage`, `readDirectoryRecursive`, `createFileSymlink` lead straight back to the file-system domain without context. Asymmetries (`renameFile` that also moves directories, `findFiles` that returns directory entries) are pre-release reshape candidates, not settled names.
4. **Types in `@flighthq/types` first.** `FileSystem`, `FilePermissions`, `FileSystemUsage`, `FileWalkOptions` are defined in the header layer and implemented against — the design surface is navigable without importing the implementation.
5. **Cover the web-implementable subset of a mature fs API; degrade honestly past it.** Aim at the feature target of Node `fs/promises` / Deno / Tauri for what a browser can do; native-only capabilities (symlinks, permissions, real-path) expose the seam and return sentinels on the web, and best-effort behavior (atomic write on OPFS) is documented as such rather than over-promised.

## Boundaries (proposed)

**In scope:**

- File and directory CRUD, metadata/stat, recursive traversal, glob, ranged read, streaming read/write via standard Web Streams, atomic write, disk-usage introspection.
- The symlink/permissions/real-path native seam (web sentinels).
- Pure, backend-free path string utilities (join/basename/dirname/extname/normalize/isAbsolute) — _for now_; their extraction is an open direction.
- A single `FileSystemBackend` seam plus the in-crate OPFS web default; `flighthq-filesystem` mirrors this with a `std::fs` native default per the Rust host-layer rule.

**Non-goals (proposed):**

- Being a host adapter. Native backends (node `fs`, Tauri) live in `host-*` crates that _implement_ the seam; they are not this package.
- Archive/virtual-filesystem formats. A zip/tar-as-backend belongs in a separate `-formats`/backend cell if built at all (open direction).
- Inventing a bespoke stream/handle type where a standard Web Stream suffices.
- High-level resource loading and orchestration — that is `@flighthq/resources` / `@flighthq/loader`.

## Decisions

None blessed yet.

## Open directions

These carry every candidate question from `review.md` plus the structural forks that touch this cell. An agent **asks** here rather than assuming.

1. **Cross-cell dependency policy — the `@flighthq/dialog` coupling.** `filesystem` is the first platform-suite cell to import a _sibling_ cell (for `read/writeDialogHandle*File`, via `getWebFileSystemHandle`). The codebase map frames each suite capability as "a self-contained cell." Is this coupling sanctioned, or should the dialog-handle bridge live in `dialog`, or in a thin `@flighthq/dialog-filesystem` seam? This is the most consequential undecided question and wants an explicit Decision. Touches structural fork A (a capability's data vs. its participation). _(The status report omitted this dependency and the four bridge functions entirely — verify against `dist/_.d.ts`, not the report, when ingesting.)\*

2. **`@flighthq/path` extraction (decomposition fork D / E bedrock).** The path utilities are pure value-typed leaves currently homed here. Ship-here vs. a sibling `@flighthq/path` is unresolved and gated on a second consumer (`resources`, `loader`). As a clean Wasm-mixable leaf it is a candidate `-rs` mixing seam. Surface, don't assume.

3. **File-watch: command → event capability (forks B/F).** `watchPath` is a bare callback today (web-no-op), the one capability whose _shape_ is below the suite's event-capability convention. Promoting it to a `FileSystemWatch` event entity (recursive watch, debounce/coalesce, rename-as-`moved`) adds a `@flighthq/signals` dependency and reshapes a contract no native host has committed to yet. Decide before any `host-*` backend hardens the bare-callback watch — the web no-op means there is no live consumer to break.

4. **`filesystem-formats` archive-as-backend (triad forks B/D, bedrock test E).** Mounting zip/tar through `FileSystemBackend` is elegant but bends "host capability seam" toward a virtual-fs abstraction. Run it through the bedrock/plurality guard before building.

5. **`removeFile` strictness.** The POSIX file/directory split landed — `removeFile` now verifies a file handle, `removeDirectory(path, recursive?)` a directory. Confirm `removeFile` should stay strictly file-only rather than reverting to the old convenience recursion. Likely the intended Decision; worth recording.

6. **Naming reshape window (pre-release, cheap).** `renameFile`→`renamePath` (and maybe a parallel `renameDirectory`), since OPFS copy+remove moves directories too; and `findFiles` returns _all_ `FileEntry` results including directories (its `**/*` test matches a `sub` directory), so either filter to `!isDirectory` or rename to `findPaths` / `findFileEntries`. Needs a yes/no before native hosts exist.

7. **Gold-tier coverage scope (which to pursue).** Locking / sync-access (`lockFile`/`releaseFileLock`, OPFS `createSyncAccessHandle` for workers); bulk directory ops (`copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`, callback-style `walkFileTree`); a `getFileSystemCapabilities()` matrix; and the edge sweep (Windows `\`/UNC/drive-letter normalization, symlink-loop detection in the recursive walk, non-UTF-8 encodings, BOM handling) are all deferred. Which belong on the roadmap vs. parked?

8. **Rust mirror.** `flighthq-filesystem` (`std::fs` native default + the path leaf as a Wasm-mixing candidate) is unstarted. When and in what order relative to the path-extraction decision?

9. **Admin-doc drift (user-gated).** The Package Map line for `@flighthq/filesystem` predates streaming, atomic write, glob, the symlink/perm seam, and the dialog bridge and now undersells the package; `host-electron`'s map entry could name `filesystem` among the seams a host fills, now that the widened `FileSystemBackend` is the concrete node-`fs` seam. Widen on confirmation.
