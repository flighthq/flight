---
package: '@flighthq/dialog'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - source
  - dist/*.d.ts
  - changes.patch
  - 'types: Dialog.ts, FileDialogHandle.ts'
---

# dialog — Review

> Evidence: `incoming/builder-67dc46d64/head/packages/dialog/`, the bundle `changes.patch`, and the realized `dist/*.d.ts`. The prior depth review (`reviews/depth/dialog.md`) does **not** exist — the status doc's "previous score 88" has no committed predecessor to supersede, so this is the first survey of record. The charter is a stub (only "What it is" seeded); the rest of this review falls back to the codebase-map AAA standard and flags each charter silence as a candidate Open direction.

## Verdict

**solid — 86/100.** A clean, well-bounded platform-suite command cell. Every dialog surface OpenFL/Lime exposes (file open / save / directory pick, message / info / warning / error / confirm / prompt) is present as a flat free function over a swappable `DialogBackend`, the web backend now prefers the File System Access API with honest `<input>` fallbacks, and the I/O-ownership line (dialog yields a `FileDialogHandle`; `@flighthq/filesystem` owns the bytes) is enforced in code. It loses points only on charter emptiness, a thin web-backend test surface (the File System Access API paths are not exercised), and a handful of small contract/symmetry nits — none structural.

The status.md is **AS-CLAIMED → verified**: every cumulative API claim, the two WeakMap registries, the `toFileSystemAccessStartIn` filter, the I/O-ownership decision, and the cross-package `filesystem → dialog` dependency (`getWebFileSystemHandle` imported at `filesystem.ts:1`, dep in `package.json`) all check out against the bundle source. No fabricated claims found.

## Present capabilities

Grounded in `dialog.ts` and `dist/dialog.d.ts` (15 exported functions, alphabetized):

- **Seam:** `createWebDialogBackend()`, `getDialogBackend()` (lazy web default — "there is always a backend"), `setDialogBackend(backend | null)` (install native host / reset to web). Matches the platform-suite command shape (`get*`/`set*`/`createWeb*`).
- **Message family:** `showMessageDialog`, `showInfoDialog`, `showWarningDialog`, `showErrorDialog` (kind-forcing convenience over `message`), `showErrorBox(title, content)` (Electron-idiom convenience), and `showConfirmDialog`. All return `MessageDialogResult` (`buttonIndex`, `cancelled`, `checkboxChecked`) except confirm → `boolean`.
- **Prompt:** `showPromptDialog(options)` — options-bag, aligned with siblings (status notes this was promoted from a positional signature).
- **Pickers:** `showOpenFileDialog`, `showOpenDirectoryDialog` (a first-class directory call, distinct from `openFile({ directory: true })`), `showSaveFileDialog`. Return `FileDialogHandle[]` / `… | null`.
- **Web FS-Access bridge accessors:** `getWebFileSystemHandle(handle)` and `getWebDirectorySystemHandle(handle)` retrieve the live `FileSystemFileHandle` / `FileSystemDirectoryHandle` stashed in two module-private `WeakMap` registries, so `@flighthq/filesystem` can do byte I/O without dialog owning it.
- **Web backend quality:** File System Access API is the primary path for open (`openFileSystemAccessPicker`), save (`saveWebFile`), and directory (`openDirectoryPickerAccessApi`); legacy `<input type=file>` / `<input webkitdirectory>` are explicit fallbacks. `buildFileSystemAccessTypes` / `buildAcceptAttribute` translate `FileDialogFilter`s; `toFileSystemAccessStartIn` filters `FileDialogStartIn` to the six API-allowed tokens, silently dropping the rest.
- **Hardening:** every API guards `window`/`document`/method existence for jsdom and non-document hosts and resolves to a sentinel (`false`/`null`/`[]`/`{ buttonIndex: 0, … }`); `AbortError`/`SecurityError` from the FS-Access pickers both collapse to the sentinel inside `try/catch`. Sentinel-not-throw is honored throughout.
- **Types** (`@flighthq/types`, correctly homed): `FileDialogHandle`(+`Kind`), `FileDialogFilter`, `FileDialogStartIn` (sharing `FileSystemPathKind` vocabulary), the three picker option bags, `MessageDialogOptions`/`Kind`/`Result`, `PromptDialogOptions`, and the `DialogBackend` interface. `parentWindow?: ApplicationWindow` is carried for native modality. `package.json` is correct: `sideEffects: false`, single `.` export, `@flighthq/types` the only dependency.

## Gaps

A mature dialog cell, measured against the AAA/OpenFL bar, still wants:

- **Web-backend behavior is barely tested.** Every File System Access API path (`openFileSystemAccessPicker`, `saveWebFile`, `openDirectoryPickerAccessApi`), the two registry stashes, and the three filter/startIn translators are **untested** — the suite only asserts "returns a Promise" / "returns null in jsdom" plus delegation through a fake backend. A fake `window` with injected `showOpenFilePicker`/`showSaveFilePicker` would let the registry round-trip (`getWebFileSystemHandle(handle) === nativeHandle`), the `startIn` mapping, and the `types`/`accept` builders be asserted directly. This is the single largest hole; the helper functions are pure and trivially testable in isolation.
- **`buildFileSystemAccessTypes` MIME edge case.** When `filter.mimeTypes` is `['image/png']` and `extensions` is empty (all `'*'`), the `accept` map is left empty, producing `{ accept: {}, description }` — the FS-Access API rejects an empty `accept`. Untested and a likely runtime reject for an all-wildcard filter group. Worth a guard or a test that pins the intended behavior.
- **No native `startIn` resolution.** `FileDialogStartIn` is honored on web but the status notes the Electron backend still uses `defaultPath`; a `startIn`→path resolver is a cross-package follow-up (host-electron / host-tauri), not a dialog-internal gap, but it leaves the option half-wired.
- **No directory-handle filesystem bridge.** `getWebDirectorySystemHandle` exposes the directory handle, but no `readDialogHandleDirectory` / `walkDialogHandleDirectory` consumes it yet (status suggestion #1). The accessor exists ahead of its consumer — a small completeness gap, lives in `@flighthq/filesystem`.
- **No Rust `flighthq-dialog` crate** (`crate: flighthq-dialog` is declared but unbuilt). The web/native `path` divergence (`null` vs `PathBuf`) needs a conformance-map entry. Out of scope for this TS worktree; noted for the port.
- **No lifecycle signals.** No `enableDialogSignals` / `onDialogOpen` / `onDialogResult`. Status flags this as a real decision (a `@flighthq/signals` dep most sibling platform cells avoid) — a candidate Open direction, not a defect.

## Charter contradictions

**None** — the charter has no North star, Boundaries, or Decisions to contradict (only a seeded "What it is" line). Nothing in the code conflicts with the seeded identity ("native host dialogs over a swappable web/native backend seam"); the implementation is exactly that. Once the charter gains a North star, re-check the cross-package `filesystem → dialog` dependency direction against any stated cellular boundary, but on the current text there is no conflict.

## Contract & docs fit

**Package living up to the contract — strong:**

- Types-first: all cross-package shapes in `@flighthq/types` (`Dialog.ts`, `FileDialogHandle.ts`); the package defines only the FS-Access API stub interfaces inline, which is correct (they are lib.dom.d.ts gap-fillers, not cross-package contracts).
- Full unabbreviated names (`showOpenDirectoryDialog`, `getWebDirectorySystemHandle`), sentinels-not- throws everywhere, single `.` export, `sideEffects: false`, `get*`/`set*`/`createWeb*` command shape, exported functions alphabetized, loose module state (`_backend`, the two registries) below the public API, `import type` on its own lines. Comments carry ownership/aliasing rules (registry comments explain why dialog holds them). This is contract-clean.

**Small nits (not blockers):**

- `getWebFileSystemHandle(handle: Readonly<FileDialogHandle>)` then immediately casts `handle as FileDialogHandle` to index the `WeakMap<FileDialogHandle, …>`. The cast is harmless (WeakMap keys by identity) but the `Readonly` is cosmetic here; fine, but worth noting the param type and the registry key type are deliberately mismatched.
- Source order places the loose `let _backend` and the two `const` registries **between** exported functions (`_backend` after `showWarningDialog`'s neighbors, registries mid-file) rather than fully at the bottom — `order:fix` may already accept this, but the style rule prefers all loose state after the last export. `showWarningDialog` itself appears far down the file, after the private helpers, breaking the "exports first, then private/loose" scan order. Verify against `npm run order`.

**Where the docs/contract may need revising (candidate revisions — user's gate, not mine):**

- The Package Map line for `@flighthq/dialog` ("file open/save and message/confirm/prompt dialogs") is accurate but predates the `FileDialogHandle` cross-cell-currency model and the `filesystem → dialog` bridge. A one-clause addition noting that pickers return handles consumed by `@flighthq/filesystem` would make the I/O-ownership seam discoverable from the map.
- The `host-electron` Package Map entry lists the dialog seam among those it implements; the status claims `electronDialog.ts` now returns real `path`s and a full `MessageDialogResult`. That is a host-electron review concern, but the line is consistent with the work.

## Candidate open directions

Each is a charter silence this review had to assume past; surface to the charter, do not act on:

1. **North star — is dialog a pure command cell, or does it own a lifecycle?** The `enableDialogSignals` question (open/result signals) turns on whether a `@flighthq/signals` dependency is acceptable here when most sibling platform cells avoid it. Needs a blessed answer.
2. **Boundary — the `filesystem → dialog` dependency direction.** The status decided filesystem imports from dialog (handle-source domain ← I/O domain). Sound, but it is a real coupling between two platform cells and deserves to be a recorded Decision rather than an implicit one.
3. **Boundary — handle as cross-cell currency.** "Dialog never gains `readFile`/`writeFile`; the handle is the currency" is a load-bearing rule the whole I/O story rests on. It reads like a Decision, not an assumption — promote it.
4. **Scope — `@flighthq/dialog-formats`?** Status parks named filter presets ("Images"/"Audio"/"Video"). Per structural-forks' plurality guard this is correctly _not_ split now (no plurality, would overlap `resources` formats). Worth a one-line non-goal in Boundaries so a later agent does not re-litigate.
5. **Native `startIn` and the directory bridge** — cross-package follow-ups (host backends; filesystem directory enumeration) that the charter should name as in-scope completeness work vs. parked.
