---
package: '@flighthq/filesystem'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/filesystem/src
  - changes.patch (packages/filesystem slice)
  - head/packages/types/src/FileSystem.ts + types/src/index.ts
  - head/packages/dialog/src/dialog.ts
  - MANIFEST.json
  - charter.md
---

# filesystem — Merge Review (integration b2824e3d8 vs approved origin/main eb73c3d74)

Evidence: `incoming/integration-b2824e3d8/head/packages/filesystem/` + the `packages/filesystem/` slice of `changes.patch`, judged as a merge gate against the approved base `incoming/integration-b2824e3d8/base/packages/filesystem/`. Findings reference `b2824e3d8:<path>`. The score grades the _delta's fitness to merge_, not the package's distance to authoritative.

## Verdict

`partial — 58/100`. **REVISE — do not merge as-is.** The design of the delta is strong: it roughly triples the API (streaming I/O, ranged read, recursive walk + glob, atomic write, the symlink/permissions/real-path native seam, disk-usage, pure path utilities, and a dialog-handle bridge), and on its own merits the new surface is well-named, sentinel-disciplined, tree-shakable, and exhaustively tested. But the integration snapshot is **internally inconsistent and will not typecheck**: `b2824e3d8:packages/filesystem/src/filesystem.ts` imports four `@flighthq/types` symbols (`FileDialogHandle`, `FilePermissions`, `FileSystemUsage`, `FileWalkOptions`) and calls eleven new `FileSystemBackend` methods that **do not exist in this integration's `@flighthq/types` head**. The filesystem + dialog work landed without its required header-layer change. That is a hard merge blocker independent of any design opinion.

## The blocker: the `@flighthq/types` header dependency is missing from the integration head

This is the dominant finding and it is fully grounded:

- `b2824e3d8:packages/filesystem/src/filesystem.ts:1-12` imports:
  ```ts
  import { getWebFileSystemHandle } from '@flighthq/dialog';
  import type {
    FileDialogHandle,
    FileEntry,
    FilePermissions,
    FileStat,
    FileSystemBackend,
    FileSystemPathKind,
    FileSystemUsage,
    FileWalkOptions,
    FileWatchEvent,
  } from '@flighthq/types';
  ```
  and the OPFS backend object implements `readBinaryFileRange`, `directoryExists`, `removeDirectory`, `readDirectoryRecursive`, `openFileReadStream`, `openFileWriteStream`, `writeFileAtomic`, `createFileSymlink`, `readFileSymlink`, `getFileRealPath`, `getFilePermissions`, `setFilePermissions`, `canAccessFile`, `getFileSystemUsage`.
- But the integration **head** `incoming/integration-b2824e3d8/head/packages/types/src/FileSystem.ts:28-44` still carries the _base_ 15-method `FileSystemBackend` interface — none of the eleven new methods, no `FilePermissions`/`FileSystemUsage`/`FileWalkOptions` import. A tree-wide grep finds **no definition** of `FileDialogHandle`, `FilePermissions`, `FileSystemUsage`, or `FileWalkOptions` anywhere under `head/packages/types/src/`.
- `head/packages/types/src/index.ts` exports no `FilePermissions`/`FileSystemUsage`/`FileWalkOptions`/`FileDialogHandle`; `changes.patch` contains **no diff hunk for `packages/types/src/FileSystem.ts`**, and the only `types/src` files it touches are `FontMetrics`, `GlyphExtents`, `Notification`, `RenderViewport2D`, `ShapedRun`, `SpritesheetFormat`, `TextShaper`, `index.ts` (MANIFEST: `types changedFiles 8` — all unrelated to filesystem).
- The same gap hits the sibling: `head/packages/dialog/src/dialog.ts:78` (`getWebFileSystemHandle(handle: Readonly<FileDialogHandle>)`) and its import also reference `FileDialogHandle`, which is **not** defined in `head/packages/types/src/Dialog.ts` (that file defines `FileDialogFilter`, `OpenFileDialogOptions`, `SaveFileDialogOptions`, `MessageDialog*`, `DialogBackend` — no `FileDialogHandle`).
- The status doc shipped with the bundle (`b2824e3d8:agents/packages/filesystem/status.md`) **claims** these types and the eleven methods were added to `@flighthq/types` — they are as-claimed, not present. The charter already warned to "verify against `dist/*.d.ts`, not the report"; verification here says the header change was never committed to this branch.

Net: `@flighthq/filesystem`, `@flighthq/dialog`, and `@flighthq/types` are out of sync in this integration head. `tsc -b` on the filesystem package cannot resolve its imports; `filesystem.ts` and `filesystem.test.ts` both fail to compile. This must be resolved before merge — it is not a pre-release-latitude waiver (latitude covers back-compat, not a non-compiling tree).

## Axis-by-axis (the 7 standards), judging the delta

1. **Composition / bedrock — PASS (with one surfaced fork).** Each new export is a thin free function delegating to the backend (`b2824e3d8:filesystem.ts:15-619`); no config-gated mega-function, no fused subjects. The pure path utilities (`getFileBaseName`/`DirectoryName`/`ExtensionName`, `isAbsoluteFilePath`, `joinFilePath`, `normalizeFilePath`, `b2824e3d8:filesystem.ts:326-408`) are value-typed leaves that _could_ extract to a `@flighthq/path` cell — a real decomposition fork, already charter Open direction #2. Not a blocker; surfaced.
2. **Naming clarity — PASS, two pre-release nits.** Full, unabbreviated, self-identifying names throughout. (a) `findFiles` (`b2824e3d8:filesystem.ts:318-323`) filters on `re.test(entry.name) || re.test(entry.path)` with **no `isDirectory` filter**, so it returns directory entries too — its name over-promises "files." (b) `renameFile` (`b2824e3d8:filesystem.ts:514-516`) is the only mover; on native it moves directories as well. Both are charter Open direction #6 reshape candidates, cheap pre-release — open questions, not blockers.
3. **Tree-shaking / bundle invariant — PASS.** `b2824e3d8:packages/filesystem/package.json` keeps `"sideEffects": false` and the single `"."` export; no per-file subpaths added. Module state (`let _backend`) and all helpers (`getWebRoot`, `walkWebDirectory`, `globToRegExp`, …) sit at file bottom after the exports (`b2824e3d8:filesystem.ts:622-765`); no top-level execution, no eager OPFS touch (`getFileSystemBackend` lazily creates, `:358-361`). New surface is additive free functions — no new hot-loop branch taxing existing importers.
4. **Registry vs closed union (fork B) — N/A / PASS.** No `kind` switch in the delta; `canAccessFile`'s `'readable' | 'writable' | 'executable'` mode is a closed tri-state argument, correctly a tight closed set, not a growing handler family.
5. **Subject triad + plurality guard — PASS, one cross-cell fork.** No misplaced `-formats`/`-backend` code. The new `@flighthq/dialog` dependency (`b2824e3d8:package.json` adds `"@flighthq/dialog": "*"`; `filesystem.ts:1` imports `getWebFileSystemHandle`) makes `filesystem` the first platform-suite cell to import a _sibling_ cell — charter Open direction #1 (structural fork A). The four bridge functions (`read/writeDialogHandle{Binary,Text}File`, `:437-608`) are a real cross-cell coupling whose home is undecided. Surface, do not block.
6. **Contract hygiene — FAIL (the blocker) + otherwise good.** Types-first is **violated in this snapshot**: the implementation references a `@flighthq/types` surface that does not exist here (see above) — the header was not landed first (or at all) on this branch. Setting that aside, the rest is clean: sentinels not throws everywhere (`null`/`[]`/`false`), `Readonly<>` on `FileDialogHandle`/`FilePermissions`/`Uint8Array` params, `dispose*`/`destroy*` correctly absent (nothing owns a non-GC resource), and the OPFS backend guards every API touch. No `out`-param functions in the delta, so alias-safety is moot. Rust mirror `flighthq-filesystem` is unstarted (charter-acknowledged).
7. **Tests & honesty — STRONG design, but cannot compile.** `b2824e3d8:filesystem.test.ts` is colocated, alphabetized, and mirrors the exports 1:1, with both fake-backend behavior and jsdom-web-sentinel coverage for every new function (e.g. `createWebFileSystemBackend` asserts all eleven new sentinels at `:265-292`; `writeBinaryFileChunks`, `writeFileAtomic`, the dialog-handle round-trips all covered). This is genuinely thorough. But it imports `FileDialogHandle`/`FilePermissions` from `@flighthq/types` (`test:1-8`) and so fails to compile for the same reason as the source. No dead exports; every export has a test.

## Charter contradictions / confirmations

- Confirms North-star #2 (sentinels, never throws) and #1 (lazy in-crate OPFS default) — the delta upholds both.
- Confirms Open direction #5: the POSIX file/directory split landed cleanly — `removeFile` (`:509-511`) is now strictly file-only (web verifies a file handle via `writeWebRemove(path, false)`, `:687-705`), `removeDirectory(path, recursive?)` is the directory verb (`:503-505`, `:92-106`). This is the likely intended Decision; worth recording.
- Open directions #1 (dialog coupling), #2 (`@flighthq/path` extraction), #6 (`renameFile`/`findFiles` naming) are all live in this delta and routed to the assessment's charter-forks section.

## Notes for status verification (as-claimed → verified)

The bundled `status.md` self-scores 93/100 and claims the `@flighthq/types` additions as done. **Verified false against the tree:** the type definitions and `FileSystemBackend` method additions are absent from `head/packages/types/src/` and from `changes.patch`. Treat the status doc's "Implemented APIs › New types in `@flighthq/types`" section as _not landed on this branch_.
