---
package: '@flighthq/dialog'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - host backends (host-web, host-electron, host-tauri, host-capacitor)
  - types (Dialog.ts, FileDialogBackend.ts, MessageDialogBackend.ts, PromptDialogBackend.ts)
---

# dialog — Review

## Verdict

**Solid — 82/100.** The package underwent a significant rework since the prior review (2026-07-30,
score 78). The 2026-08-30 refactor split file dialogs into three independent capability slots
(`fileOpen`, `directoryOpen`, `fileSave`), moved `FileDialogHandle` to Entity-backed currency with
provider-neutral runtime operations, and relocated web file-picker providers to `@flighthq/host-web`.
The result is a clean, explicit command cell that matches the platform integration suite pattern: flat
free functions over explicit host capability slots, no side effects, no module-scoped mutable state.
The prior review's description of `createWebDialogBackend`/`getDialogBackend`/`setDialogBackend` and
`WeakMap`-based handle registries no longer describes the live package. Remaining distance is the
web message/prompt backend residency, missing `startIn`/initial-directory support, and test depth for
the File System Access paths that now live in `host-web`.

## Present capabilities

### Public lane (`index.ts`) — 12 exports

Twelve functions form the public API, re-exported from `contract.ts`:

- **File-picker functions** (`fileDialog.ts`):
  `showOpenFileDialog(host: HasDialogFileOpen, options)`,
  `showOpenDirectoryDialog(host: HasDialogDirectoryOpen, options?)`,
  `showSaveFileDialog(host: HasDialogFileSave, options)` — each takes a host carrying its own
  independent capability slot (`dialog.fileOpen`, `dialog.directoryOpen`, `dialog.fileSave`). The
  host types are narrow: a caller needing only file-open does not type-require directory-open.

- **Handle utilities** (`fileDialog.ts`):
  `createFileDialogHandle(kind, name, path, operations?)` constructs a `FileDialogHandle` Entity
  with an opaque runtime carrying `FileDialogHandleOperations` (`readText`, `readBinary`,
  `writeBinary`, `writeText`). `getFileDialogHandleOperations(handle)` retrieves those operations —
  returning `null` for a deserialized DTO or forged object, enforcing that runtime authority does not
  survive serialization.

- **Message family** (`dialog.ts`):
  `showMessageDialog`, `showConfirmDialog`, `showInfoDialog`, `showWarningDialog`,
  `showErrorDialog`, `showErrorBox`, `showPromptDialog` — thin delegation wrappers over
  `host.dialog.message` and `host.dialog.prompt`. Info/warning/error variants set the `kind` field;
  `showErrorBox` is a positional convenience (`title`, `content`, `signal`).

### Contract lane (`contract.ts`)

Re-exports everything from both `dialog.ts` and `fileDialog.ts`, including the two web backend
instances (`webMessageDialogBackend`, `webPromptDialogBackend`). These are consumed by
`@flighthq/host-web/webDialog.ts` and `@flighthq/host-web/webDialogHost.ts`.

### Type surface (in `@flighthq/types`)

All types live in `@flighthq/types`, spread across four files:
- `Dialog.ts` — `FileDialogFilter`, `FileDialogHandle`, `FileDialogHandleOperations`,
  `FileDialogHandleRuntime`, option types (`OpenFileDialogOptions`, `OpenDirectoryDialogOptions`,
  `SaveFileDialogOptions`, `MessageDialogOptions`, `PromptDialogOptions`), result discriminated
  unions (`FileOpenDialogResult`, `DirectoryOpenDialogResult`, `FileSaveDialogResult`),
  `MessageDialogResult`, `MessageDialogKind`.
- `FileDialogBackend.ts` — `DirectoryOpenDialogBackend`, `FileOpenDialogBackend`,
  `FileSaveDialogBackend` (all extend `Entity`).
- `MessageDialogBackend.ts` — `MessageDialogBackend` (`confirm` + `message`).
- `PromptDialogBackend.ts` — `PromptDialogBackend`.
- `Host.ts` — five narrow host interfaces: `HasDialogDirectoryOpen`, `HasDialogFileOpen`,
  `HasDialogFileSave`, `HasDialogMessage`, `HasDialogPrompt`.

All Dialog types are in both the public and contract lanes of `@flighthq/types`.

### Host backend coverage

Four host packages provide dialog implementations:
- **`host-web`** — all five slots (message, prompt, fileOpen, directoryOpen, fileSave). File
  pickers use the File System Access API with a legacy `<input type=file>` fallback for `openFile`.
  No legacy fallback for `save` or `directoryOpen` (returns `runtime-unavailable`).
- **`host-electron`** — four slots (message, fileOpen, directoryOpen, fileSave). No prompt — the
  comment notes Electron has no native text-input prompt.
- **`host-tauri`** — four slots (message, fileOpen, directoryOpen, fileSave). Same prompt gap.
- **`host-capacitor`** — two slots (message, prompt). No file pickers — the comment notes Capacitor
  has no native file picker. This matches the charter decision that file pickers are absent on
  Capacitor.

### Dependencies

Only `@flighthq/entity` and `@flighthq/types`. The package declares `"sideEffects": false`.
`@flighthq/filesystem` imports from `@flighthq/dialog/contract` — specifically
`createFileDialogHandle` in tests and `getFileDialogHandleOperations` in implementation — confirming
the `FileDialogHandle`-as-currency architecture the charter describes.

### Tests

19 tests across two files, all passing:
- `dialog.test.ts` (10 tests) — verifies each message-family function delegates to the correct host
  slot, tests severity mapping for info/warning/error, confirms signal forwarding, tests the web
  prompt backend's abort-signal early-exit, and exercises both `webMessageDialogBackend` and
  `webPromptDialogBackend`.
- `fileDialog.test.ts` (9 tests) — verifies `createFileDialogHandle` attaches runtime operations,
  `getFileDialogHandleOperations` returns `null` for a deserialized DTO, tests all three file-picker
  functions route through their independent slots, covers distinct outcome variants
  (`runtime-unavailable`, `security-denied`, `file-save-failed`, `cancelled`), and verifies option
  forwarding.

## Gaps

1. **No `startIn` / initial-directory option.** The prior status (2026-06-24) mentioned `startIn` on
   all three picker option bags. The current types (`OpenFileDialogOptions`,
   `OpenDirectoryDialogOptions`, `SaveFileDialogOptions`) have no initial-directory field. The File
   System Access API supports `startIn`, Electron supports `defaultPath`, and Tauri supports
   `defaultPath`. This is a cross-host capability gap: the data model is missing, not just the
   implementation.

2. **Web message/prompt backends reside in the `dialog` package.** `webMessageDialogBackend` and
   `webPromptDialogBackend` are defined in `dialog/src/dialog.ts` and re-exported through the
   contract lane. The comment at `dialog.ts:12-13` acknowledges they predate the file-dialog split
   and should move to `host-web`. The file-picker web backends already live in `host-web`. This
   asymmetry means `@flighthq/dialog` carries browser-specific code (`window.alert`, `window.confirm`,
   `window.prompt`) while the charter says it should be host-agnostic selection.

3. **Legacy file-input cancellation is non-deterministic.** The `openLegacyFilePicker` in
   `host-web/webDialog.ts` uses a focus-return heuristic with a `setTimeout(..., 0)` fallback. On
   browsers that emit neither `change` nor the `cancel` event, the promise can remain pending.
   Status.md does not mention this as open; the prior assessment's Backlog does.

4. **No capability query for callers.** The web message backend always returns `buttonIndex: 0` and
   ignores `buttons`, `defaultId`, `cancelId`, `checkboxLabel`, and `detail`. There is no mechanism
   for a caller to detect whether these options will be honored, leaving callers unable to choose
   between a native-feeling dialog and a custom UI fallback.

5. **File System Access behavior paths lack direct test coverage in this package.** The File System
   Access API integration, filter building, handle operation wiring, and legacy fallback are all in
   `@flighthq/host-web`, not in `@flighthq/dialog`. The `dialog` package itself tests only its thin
   delegation layer. The host-web dialog test file exists but was not ingested by this review; the
   prior assessment noted this depth gap.

6. **`FileDialogFilter.accept` pairing asymmetry on Electron/Tauri.** The type models `accept` as
   `Record<string, string[]>` where each MIME key maps to its extensions. Electron and Tauri
   `flattenExtensions` helpers flatten all extensions from all MIME keys into a single array,
   discarding the per-MIME grouping. This is correct for those platforms (they filter by extension,
   not MIME), but worth noting as a silent lossy translation. The prior assessment item about
   `FileDialogFilter` parallel arrays is now obsolete — the restructured `accept` record resolves
   the data-model concern.

7. **`showErrorBox` parameter style.** `showErrorBox(host, title, content, signal?)` uses positional
   parameters instead of an options bag, unlike every other `show*Dialog` function. This is a
   deliberate convenience call but a minor API symmetry gap.

## Charter contradictions

No contradictions found. The live implementation matches every charter statement:

- **"File/directory selection, never byte I/O"** — confirmed. `dialog` constructs handles and
  delegates to host slots. `@flighthq/filesystem` imports `getFileDialogHandleOperations` for the
  I/O side.
- **"FileDialogHandle Entity"** — confirmed. `createFileDialogHandle` returns an Entity with runtime
  operations attached via `EntityRuntimeKey`.
- **"Web file providers live in `@flighthq/host-web`"** — confirmed for file pickers. The
  message/prompt web backends are the acknowledged exception (see Gap 2).
- **"Legacy directory surrogate is deliberately absent"** — confirmed. `host-web` returns
  `runtime-unavailable` when `showDirectoryPicker` is not available.
- **"File-picker slots and outcomes are method-tight"** (Decision 2026-08-30) — confirmed. Three
  independent slots, each with its own result discriminant. Selected results require nonempty
  handles. Cancellation, runtime-unavailable, security-denied, and operation-specific failures are
  distinct outcome literals.
- **"Picker providers own no durable descriptor"** (Decision 2026-08-30) — confirmed. No dispose or
  destroy lifecycle on providers.
- **"File pickers absent on Capacitor"** (Decision 2026-08-30) — confirmed. `host-capacitor`
  provides only message and prompt.

## Contract and docs fit

### Package conformance

- **Types-first**: all exported types in `@flighthq/types`. Confirmed.
- **Two export lanes**: `.` (public, 12 curated exports) and `./contract` (full surface). Confirmed
  in `package.json` exports map.
- **Full unabbreviated names**: all exported function names use full type names
  (`showOpenFileDialog`, `createFileDialogHandle`, `getFileDialogHandleOperations`). Confirmed.
- **`sideEffects: false`**: declared in `package.json`. Confirmed. However, `webMessageDialogBackend`
  and `webPromptDialogBackend` are top-level `const` initialized by factory calls — this is safe
  (no side effects at module scope beyond object creation), but the eagerness is atypical for the
  suite pattern which prefers `create*` functions the caller invokes.
- **Sentinels, not throws**: all host backends return discriminated result unions with failure
  outcomes; no throws on expected failures. Confirmed.
- **Explicit host dependency**: every function takes its host capability as the first argument.
  Confirmed. No `getDialogBackend`/`setDialogBackend` singleton pattern.

### Candidate revisions to admin docs

- **Prior review is stale.** The 2026-07-30 review describes a `createWebDialogBackend` /
  `getDialogBackend` / `setDialogBackend` pattern and 15 exported functions. The live package has 12
  exports, no get/set backend, and the web file-picker providers have moved to `host-web`. This
  review supersedes it.
- **Prior assessment item 1 is obsolete.** The `FileDialogFilter` parallel-array concern
  (`extensions` and `mimeTypes` as separate arrays) no longer applies. The type was restructured to
  `accept: Record<string, string[]>`, resolving the data-model limitation. The assessment should
  reflect this.
- **Prior assessment item 2 is obsolete.** The `application/octet-stream` fallback concern was tied
  to the old filter model. The new `accept` record does not have this issue — extensions are always
  paired with their declaring MIME key.

## Candidate open directions

1. **`startIn` / initial-directory capability across hosts.** The option was once present but is now
   absent from all three picker option types. The File System Access API, Electron, and Tauri all
   support it. Should this be re-added, and if so, what is the cross-host type? (A string path works
   on native; the File System Access API accepts a `FileSystemHandle` or a well-known directory
   string.)

2. **Web message/prompt backend residency.** The charter says web file providers live in `host-web`.
   Should `webMessageDialogBackend` and `webPromptDialogBackend` follow the file-picker providers
   and move to `host-web` as well, or is there a reason for them to remain in the dialog package?

3. **Message-dialog option uniformity.** The charter's Open directions note that "message and prompt
   option uniformity remains a separate capability decision." The web backend silently ignores
   `buttons`, `defaultId`, `cancelId`, `checkboxLabel`, and `detail`. Should the type surface
   distinguish options that are host-dependent from options that are universally honored?
