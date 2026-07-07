---
package: '@flighthq/dialog'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# dialog — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/dialog

**Session dates:** 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Previous score:** 88/100 **Estimated new score:** 93/100 (Gold)

## Implemented APIs (cumulative across both passes)

### Types in `@flighthq/types`

**`packages/types/src/FileDialogHandle.ts`**:

- `FileDialogHandleKind` — `'File' | 'Directory'`
- `FileDialogHandle` — `{ kind, name, path: string | null }` — cross-cell currency produced by open/save pickers

**`packages/types/src/Dialog.ts`** (updated in passes 1 and 2):

- `FileDialogFilter` — `{ extensions, mimeTypes?, name }` — file extension group for open/save dialogs
- `FileDialogStartIn` — `FileSystemPathKind | 'music' | 'pictures' | 'videos'` — well-known starting directory hint shared across all picker APIs
- `OpenDirectoryDialogOptions` — `{ defaultPath?, multiple?, parentWindow?, startIn?, title? }`
- `OpenFileDialogOptions` — `{ buttonLabel?, defaultPath?, directory?, filters?, multiple?, parentWindow?, showHiddenFiles?, startIn?, title? }`
- `SaveFileDialogOptions` — `{ buttonLabel?, defaultName?, defaultPath?, filters?, parentWindow?, startIn?, title? }`
- `MessageDialogOptions` — full options bag including `buttons`, `cancelId`, `checkboxChecked`, `checkboxLabel`, `defaultId`, `detail`, `kind`, `message`, `parentWindow`, `title`
- `MessageDialogResult` — `{ buttonIndex, cancelled, checkboxChecked }`
- `PromptDialogOptions` — `{ defaultValue?, message, placeholder?, title? }`
- `MessageDialogKind` — `'info' | 'warning' | 'error' | 'question'`
- `DialogBackend` — full interface: `confirm`, `message`, `openDirectory`, `openFile`, `prompt`, `saveFile`

### Exports in `@flighthq/dialog`

**`packages/dialog/src/dialog.ts`**:

- `createWebDialogBackend()` — web backend using File System Access API + `<input>` fallbacks
- `getDialogBackend()` — lazy-initializes web default; returns the active backend
- `getWebDirectorySystemHandle(handle)` — retrieves the `FileSystemDirectoryHandle` stashed by `showDirectoryPicker`; returns null for legacy `<input webkitdirectory>` handles
- `getWebFileSystemHandle(handle)` — retrieves the `FileSystemFileHandle` stashed for open/save handles; returns null for legacy `<input>` handles
- `setDialogBackend(backend)` — installs native host backend or resets to web default
- `showConfirmDialog(options)` — yes/no confirm
- `showErrorBox(title, content)` — convenience over `message({ kind: 'error' })`
- `showErrorDialog(options)` — forces `kind: 'error'`
- `showInfoDialog(options)` — forces `kind: 'info'`
- `showMessageDialog(options)` — multi-button message dialog
- `showOpenDirectoryDialog(options)` — directory picker; uses `window.showDirectoryPicker` (File System Access API) when available, falls back to `<input webkitdirectory>`
- `showOpenFileDialog(options)` — file picker; uses `window.showOpenFilePicker` when available, falls back to `<input type=file>`
- `showPromptDialog(options)` — text prompt
- `showSaveFileDialog(options)` — save picker; uses `window.showSaveFilePicker` when available
- `showWarningDialog(options)` — forces `kind: 'warning'`

### Updated in `@flighthq/host-electron`

**`packages/host-electron/src/electronDialog.ts`**:

- `openFile` — returns `FileDialogHandle[]` with real `path` fields
- `saveFile` — returns `FileDialogHandle | null` with real `path`
- `message` — returns full `MessageDialogResult` including `cancelled: true` when `response === cancelId`
- `openDirectory` — maps paths to `FileDialogHandle[]` (kind: 'Directory')
- `prompt` — accepts `Readonly<PromptDialogOptions>`
- `buttonLabel` support for open/save dialogs

### New bridge functions in `@flighthq/filesystem`

**`packages/filesystem/src/filesystem.ts`** (dialog-bridge additions):

- `readDialogHandleBinaryFile(handle)` — reads bytes from a `FileDialogHandle`; uses native path on Electron/Tauri, falls back to `getWebFileSystemHandle` on web
- `readDialogHandleTextFile(handle)` — reads text from a `FileDialogHandle`; same path logic
- `writeDialogHandleBinaryFile(handle, data)` — writes bytes to a save-file dialog handle; uses `FileSystemFileHandle.createWritable` on web
- `writeDialogHandleTextFile(handle, data)` — writes text to a save-file dialog handle; same path logic

The filesystem package now depends on `@flighthq/dialog` (added to `package.json` and `tsconfig.json` references).

## Design decisions made

**I/O ownership line:** Dialog returns `FileDialogHandle`; `@flighthq/filesystem` owns byte I/O. Dialog never gains `readFile`/`writeFile`. The handle is the plain-data cross-cell currency.

**Web handle registries:** Two WeakMaps in `@flighthq/dialog`:

- `_fileSystemHandleRegistry`: `WeakMap<FileDialogHandle, FileSystemFileHandle>` — for open/save file picks
- `_fileSystemDirectoryHandleRegistry`: `WeakMap<FileDialogHandle, FileSystemDirectoryHandle>` — for directory picks via `showDirectoryPicker` Both registries live in `@flighthq/dialog` since dialog is the only party that creates and observes the File System Access API handle lifecycle.

**`window.showDirectoryPicker` as primary path:** File System Access API `showDirectoryPicker` (Chrome/Edge 86+) is the preferred directory picker path. It yields a real `FileSystemDirectoryHandle`, requests `readwrite` access mode, and supports `startIn`. Legacy `<input webkitdirectory>` is the fallback for browsers without the API. This is a significant improvement over the first-pass which used only the legacy path.

**`startIn` option:** Added `FileDialogStartIn` type (`FileSystemPathKind | 'music' | 'pictures' | 'videos'`) to all three picker option interfaces. Unsupported values (`'home'`, `'temp'`, `'appData'`, `'cache'`) are silently dropped since the File System Access API only accepts `desktop`, `documents`, `downloads`, `music`, `pictures`, `videos`. The mapping function `toFileSystemAccessStartIn` handles this filtering.

**Cross-package dependency direction (filesystem → dialog):** `@flighthq/filesystem` imports `getWebFileSystemHandle` from `@flighthq/dialog` for the bridge functions. This is intentional: the bridge functions are the feature that makes dialog handles useful for I/O. With `sideEffects: false` on both packages, tree-shaking ensures users who don't call `readDialogHandleTextFile` etc. don't pull in any dialog code. The dependency direction (filesystem imports from dialog) is preferred over the reverse because filesystem is the I/O domain and dialog is the handle-source domain.

**`FileSystemPathKind` vocabulary shared with `FileDialogStartIn`:** `FileDialogStartIn` extends `FileSystemPathKind` with media-directory values (`'music'`, `'pictures'`, `'videos'`) that the File System Access API supports but OPFS doesn't need. This creates a shared vocabulary between the two packages without coupling the types — both depend only on `@flighthq/types`.

**`FileSystemBackend` expansion:** The `FileSystemBackend` interface in `@flighthq/types` was expanded (by a previous session) with new methods: `openFileReadStream`, `openFileWriteStream`, `writeFileAtomic`, `createFileSymlink`, `readFileSymlink`, `getFileRealPath`, `getFilePermissions`, `setFilePermissions`, `canAccessFile`, `getFileSystemUsage`. All methods are now implemented in `createWebFileSystemBackend()` and the `fakeBackend()` test fixture. New free functions were added to `@flighthq/filesystem` to expose these capabilities: `canAccessFile`, `createFileSymlink`, `findFiles`, `getFilePermissions`, `getFileRealPath`, `getFileSystemUsage`, `openFileReadStream`, `openFileWriteStream`, `readFileSymlink`, `setFilePermissions`, `writeBinaryFileChunks`, `writeFileAtomic`.

**MIME type catch-all:** When a `FileDialogFilter` has no `mimeTypes`, `application/octet-stream` is used as the key in the File System Access API `types` accept map. This is a reasonable heuristic for the API's requirement.

## Remaining deferred items and why

**Gold — `@flighthq/host-tauri` / `@flighthq/host-capacitor` dialog backends:** Cross-package work dependent on those host packages maturing. Out of scope.

**Gold — `@flighthq/dialog-formats` neighbor package:** Not warranted until filter presets (named bundles: "Images", "Audio", "Video") grow and genuinely overlap `@flighthq/resources` formats. Premature to split now.

**Gold — `enableDialogSignals` opt-in group:** Provides `onDialogOpen`/`onDialogResult` signals for apps wanting to observe dialog lifecycle. Not implemented — requires a `@flighthq/signals` dependency which would add weight to the package. Decision needed: is a signals dependency acceptable for this platform cell? Most sibling platform packages do not have it.

**Gold — multi-thousand-file directory selection performance:** WeakMap + lazy handle approach already avoids eager byte reads. No O(n) DOM churn for `<input>` directories. Further optimization deferred until profiling shows a real issue.

**Gold — Rust `flighthq-dialog` crate:** 1:1 mirror. Depends on `flighthq-types` carrying `FileDialogHandle` (done) and on the conformance map entry. Uses `rfd` (native file dialogs) behind the `native` feature. Conformance divergence: web returns `path: null`, native returns real `PathBuf`. Not in scope for TS worktree.

**Gold — full `AbortError`/`SecurityError` signal distinction:** Currently both cancel paths return the sentinel. A future `enableDialogSignals` opt-in could emit a signal on `SecurityError` for analytics; deferred.

**Gold — `getWebDirectorySystemHandle` filesystem bridge:** `getWebDirectorySystemHandle` exposes the `FileSystemDirectoryHandle` from `showDirectoryPicker`, but `@flighthq/filesystem` does not yet have bridge functions for reading directory contents through a dialog handle (only file handles are bridged). `readDialogHandleDirectory` / `findFilesInDialogHandle` are future candidates.

## Concerns and surprises

- The `FileSystemBackend` interface in `@flighthq/types` had grown significantly since the first pass; `createWebFileSystemBackend()` was only partially implementing it. All new methods are now implemented.
- `FilePermissions` and `FileSystemUsage` types exist in `@flighthq/types` but were not being exported at first-pass time; they are now correctly exported and the types dist was stale.
- A `globToRegExp` helper was needed for the new `findFiles` function (added by the linter from a previous session). Implemented a simple one supporting `*`, `**`, and `?`.
- The `@flighthq/filesystem` dependency on `@flighthq/dialog` is a real cross-package dependency. It's tree-safe because both packages have `sideEffects: false`, but it is a coupling. The alternative (registering a bridge function at the call site) was considered and rejected as over-engineering given Flight's cellular design.

## Suggestions for future sessions

1. **`getWebDirectorySystemHandle` filesystem bridge:** Add `readDialogHandleDirectory(handle)` and `walkDialogHandleDirectory(handle)` to `@flighthq/filesystem` that use `getWebDirectorySystemHandle` to enumerate directory contents through the native `FileSystemDirectoryHandle`, bypassing the path-based OPFS layer entirely.
2. **`enableDialogSignals` decision:** Decide whether a `@flighthq/signals` dependency is acceptable for the platform cell. If yes, implement `onDialogOpen`/`onDialogResult` opt-in signals.
3. **`startIn` on native (Electron/Tauri):** Map `FileDialogStartIn` values to native start directories in the Electron and Tauri backends. The Electron backend currently uses `defaultPath` for starting directory; a `startIn`-to-path resolver would complete the feature.
4. **Rust `flighthq-dialog`:** The types now include `FileDialogHandle` with `path: string | null` that maps cleanly to `Option<PathBuf>`. The conformance map should record the web/native path divergence as intentional.
5. **`FileSystemBackend` `openFileReadStream` / streaming API:** The streaming additions to `FileSystemBackend` lay the groundwork for efficient large-file I/O. A future session should add examples demonstrating the streaming path.
