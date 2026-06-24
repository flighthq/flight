---
package: '@flighthq/filesystem'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/filesystem.md
  - reviews/maturation/depth/filesystem.md
  - source
  - changes.patch (builder-67dc46d64)
---

# Review: @flighthq/filesystem

## Verdict

**solid — 88/100.** A clean, near-complete realization of the platform-suite command-capability pattern: a flat free-function surface delegating to a swappable `FileSystemBackend`, with a fully implemented OPFS web default that guards every API touch and returns sentinels in jsdom. This pass (builder-67dc46d64) widened the package from 17 → 43 exports — recursive traversal, ranged read, streaming I/O, atomic write, the symlink/permissions seam, disk-usage introspection, public path utilities, and glob — landing essentially the whole Bronze and Silver tier of the maturation roadmap. It is now competitive with Node `fs/promises` / Deno / Tauri for the web-implementable subset. The deductions are not depth gaps but a few shape questions the status report left unflagged: an undisclosed `@flighthq/dialog` dependency, two naming asymmetries (`renameFile`/`findFiles`), and a charter that is still a stub so most of "good" is being inferred rather than measured.

## Present capabilities

Grounded in `67dc46d64:packages/filesystem/src/filesystem.ts` (every export has a colocated `describe` in `filesystem.test.ts` — 43 exports, 43 describes, alphabetized, `exports:check`- and `order`-clean).

**File CRUD + metadata** (pre-existing): `readTextFile`, `writeTextFile`, `appendTextFile`, `readBinaryFile`, `writeBinaryFile`, `fileExists`, `copyFile`, `renameFile`, `removeFile`, `statFile` (`FileStat` { size, isDirectory, modifiedTime, createdTime, isSymlink }), `makeDirectory`, `readDirectory`, `getFileSystemPath` over `FileSystemPathKind`, `watchPath`, and the backend seam (`getFileSystemBackend` lazy default, `setFileSystemBackend` null-resets, `createWebFileSystemBackend`).

**New this pass** — the headline expansion:

- **Directory verbs split.** `directoryExists` (companion to `fileExists`) and `removeDirectory(path, recursive?)`. The POSIX split actually landed in the web backend: `removeFile` now verifies the target is a file handle before `removeEntry({ recursive: false })`, and `removeDirectory` verifies a directory parent — the depth review's "`removeFile` recursively deletes directories" conflation is resolved.
- **Recursive traversal + glob.** `readDirectoryRecursive(path, options?)` over a `FileWalkOptions` ({ maxDepth?, followSymlinks? }) plain type, depth-first via `walkWebDirectory` with `maxDepth` honored; `findFiles(rootPath, pattern)` composes a `globToRegExp` (`*` / `**` / `?`, other regex metachars escaped, case-sensitive) over the recursive walk.
- **Ranged + streaming I/O.** `readBinaryFileRange` (OPFS `file.slice`, empty `Uint8Array` for out-of-range), `openFileReadStream`/`openFileWriteStream` returning standard Web Streams (no bespoke handle type), and `writeBinaryFileChunks(path, AsyncIterable)` that never holds the full payload.
- **Atomic write.** `writeFileAtomic(path, Uint8Array | string)` — temp-sibling-then-copy-replace, honestly documented as best-effort (not crash-safe) on OPFS.
- **Symlink + permissions seam** (native-only, web sentinels): `createFileSymlink`, `readFileSymlink`, `getFileRealPath`; `getFilePermissions`/`setFilePermissions` over `FilePermissions` ({ readable, writable, executable, mode? }), `canAccessFile(path, mode)` with a best-effort web probe.
- **Usage.** `getFileSystemUsage` → `FileSystemUsage` ({ usedBytes, quotaBytes }) over `navigator.storage.estimate()`.
- **Path utilities** (pure strings, no backend): `joinFilePath`, `getFileBaseName`, `getFileDirectoryName`, `getFileExtensionName`, `normalizeFilePath`, `isAbsoluteFilePath`.
- **Dialog-handle bridges** (not in the status report — see Contract & docs fit): `readDialogHandleBinaryFile`, `readDialogHandleTextFile`, `writeDialogHandleBinaryFile`, `writeDialogHandleTextFile`, importing `getWebFileSystemHandle` from `@flighthq/dialog`.

Sentinel discipline remains exemplary and matches both the project rule and the `FileSystemBackend` interface JSDoc: reads → `null`/`[]`, writes → `false`, never throws for missing/denied. Types are correctly homed in `@flighthq/types` (`FileSystem.ts`, `FilePermissions.ts`, `FileSystemUsage.ts`, `FileWalkOptions.ts`), defined first then implemented against — the header-layer rule is honored.

## Gaps

Against an authoritative fs library, the remaining gaps are exactly the roadmap's Gold tier (the status report's own deferral list, verified accurate):

- **File-watch is still a bare command callback.** `watchPath(path, listener) → unsubscribe`, web-no-op. No `FileSystemWatch` event entity, no recursive watch, no debounce/coalesce, no rename-as-`moved` detection. This is the one capability whose _shape_ (not just coverage) is below the platform suite's event-capability convention.
- **No locking / sync-access.** No `lockFile`/`releaseFileLock` advisory bracket, no OPFS `createSyncAccessHandle` fast path for worker contexts.
- **No bulk directory ops.** `copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`, callback-style `walkFileTree` for huge trees are absent.
- **No archive-as-backend.** A `@flighthq/filesystem-formats` zip/tar virtual backend is unbuilt (correctly — it is a design fork, see below).
- **Edge sweep incomplete.** Windows path normalization (`\`, UNC, drive letters beyond the `isAbsoluteFilePath` regex), symlink-loop detection in the recursive walk, text-encoding options beyond UTF-8, BOM handling, and a `getFileSystemCapabilities()` matrix are all deferred.
- **No Rust mirror.** `flighthq-filesystem` (std::fs native default + the path leaf as a mixing candidate) is unstarted.

These are all _Gold_ and all require either user design decisions or significant scope — consistent with the status report's residual −1.

## Charter contradictions

None — but only because the charter is silent. `charter.md` carries the seeded "What it is" line and `North star` / `Boundaries` / `Decisions` are all `TODO`. There is no stated principle for the code to contradict. The one place worth watching against the _codebase map_ (not the charter): the new `@flighthq/dialog` dependency makes `filesystem` the first platform-suite cell that imports a _sibling platform cell_ rather than only `@flighthq/types`. The map describes each suite capability as "a self-contained cell"; this coupling is defensible (reading the bytes behind a save-dialog handle is a real seam) but it is a deviation from the cell-isolation framing that the charter has not yet sanctioned. Not a contradiction of a _stated_ rule, but a candidate Decision (below).

## Contract & docs fit

**Lives up to the contract:** `@flighthq/types`-first types ✓; full unabbreviated names ✓ (`getFileSystemUsage`, `readDirectoryRecursive`, `createFileSymlink` — globally self-identifying); sentinels-not-throws ✓; single root `.` export with `index.ts` thin re-export ✓; `"sideEffects": false` with lazy backend creation (no eager OPFS touch) ✓; loose helpers + `_backend` at file bottom ✓; `Readonly<>` on write inputs and walk options ✓. The crate is mapped (`flighthq-filesystem`, native-default-over-std::fs per the Rust host-layer rule) though unbuilt.

**Status-report accuracy (AS-CLAIMED → verified):** the report's API inventory, design choices, and deferral list all check out against the diff. **One material omission:** the report never mentions the four `*DialogHandle*` functions or the new `@flighthq/dialog` dependency, even though they are the largest single shape change in the delta (base had no `@flighthq/dialog` dep; head adds it plus four exports). A future ingest should not trust the report's export list as exhaustive — verify against `dist/*.d.ts`, which is what surfaced this.

**Naming asymmetries (candidate contract-fit revisions):**

- `renameFile` moves directories too (OPFS copy+remove is type-agnostic), yet the name says `File`. The report flags this itself ("Consider `renamePath` or a parallel `renameDirectory`"). Pre-release, cheap to fix.
- `findFiles` filters _all_ `FileEntry` results including directories — its `**/*` test even matches a `sub` directory path — so the name over-promises. Either filter to `!isDirectory` or rename to `findPaths` / `findFileEntries`.
- `removeFile`'s JSDoc and behavior now correctly say "use removeDirectory for directories," resolving the prior conflation — a clean fit.

**Admin-doc drift (candidate revisions, user-gated):**

- The Package Map line for `@flighthq/filesystem` ("file read/write/list/stat and standard directory paths") now badly undersells the package — it predates streaming, atomic write, glob, symlink/perm seam, and the dialog bridge. Worth widening.
- `@flighthq/host-electron`'s map entry says filesystem (node `fs`) is "out of scope here — a future host-capacitor / a node-fs injection covers those." The widened `FileSystemBackend` interface is now the concrete seam such a node-fs backend would implement; the map could name `filesystem` among the seams a host fills.

## Candidate open directions

The charter is a stub, so each of these is an assumption a reviewer had to make — they feed `charter.md › Open directions` and the SDK-wide forks:

1. **Cross-cell dependency policy (the `@flighthq/dialog` coupling).** Is a platform-suite cell importing another suite cell sanctioned, or should the dialog-handle bridge live elsewhere (in `dialog`, or a thin `@flighthq/dialog-filesystem` seam)? This is the most consequential undecided question and wants an explicit Decision. Touches structural-fork A (where a capability's data lives vs. its participation).
2. **`@flighthq/path` extraction (decomposition fork).** Path utilities are pure value-typed leaves currently homed in `filesystem`. The roadmap's step-1 decision — ship-here vs. sibling `@flighthq/path` — is unresolved and gated on a second consumer (`resources`, `loader`). A clean Wasm-mixable leaf (fork D). Surface, don't assume.
3. **File-watch: command → event capability (forks B/F).** Promoting `watchPath` to a `FileSystemWatch` event entity adds a `@flighthq/signals` dependency and reshapes a contract no native host has committed to yet. Decide before any `host-*` backend hardens the bare-callback `watch`. The web no-op means there is no live web consumer to break.
4. **`filesystem-formats` archive-as-backend (triad forks B/D, bedrock test E).** Mounting zip/tar through `FileSystemBackend` is elegant but bends "host capability seam" toward a virtual-fs abstraction. Run it through the bedrock/plurality guard before building.
5. **`removeFile` strictness.** The POSIX file/directory split landed; confirm `removeFile` should stay strictly file-only (current) rather than reverting to the old convenience recursion. Likely already the intended Decision — worth recording.
6. **Naming reshape window.** `renameFile`→`renamePath` (+ maybe `renameDirectory`) and `findFiles` directory-filtering are pre-release-cheap reshapes that need a yes/no before native hosts exist.
