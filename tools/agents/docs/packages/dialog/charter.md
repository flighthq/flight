---
package: '@flighthq/dialog'
crate: flighthq-dialog
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# dialog — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Native host dialogs — file open / save / directory pickers and message / info / warning / error / confirm / prompt boxes — exposed as flat free functions over a swappable `DialogBackend`. A platform-suite **command** cell: it carries the standard `getDialogBackend` / `setDialogBackend` / `createWebDialogBackend` shape, with a lazily-available web backend so every function works on the web and a native host (Electron, Tauri, …) replaces it.

The package's defining line is **I/O ownership**: a picker yields a `FileDialogHandle` (an opaque reference to the chosen file/directory), never bytes. Reading or writing those bytes is `@flighthq/filesystem`'s job — it consumes the handle via the bridge accessors (`getWebFileSystemHandle` / `getWebDirectorySystemHandle`) that dialog exposes. Dialog is where a user _chooses_ a file; it is never where a file is _read_.

## North star (proposed)

_Proposed from the design + the structural forks; edit or promote to Decisions._

- **The handle is the currency, never the bytes.** Dialog ends at the selection. It yields a `FileDialogHandle` and the live-handle accessors, and stops there; `readFile`/`writeFile` belong to `@flighthq/filesystem`. This is the seam that keeps "choose a file" and "read a file" as two composable cells instead of one fused picker.
- **There is always a backend.** The web backend is lazily, always available, so every function works on the web with no host. A native host is one `setDialogBackend` call, not a coupling.
- **Sentinels, never throws.** Every API guards `window`/`document`/method existence and a cancelled or unavailable dialog resolves to a sentinel (`false` / `null` / `[]` / a zero-button result). User cancellation and a missing host are expected outcomes, not errors.
- **Prefer the modern host primitive, fall back honestly.** The web backend reaches for the File System Access API first (real handles, real save) and treats `<input type=file>` / `<input webkitdirectory>` as explicit, named fallbacks — not the default path.
- **Mirror OpenFL/Lime coverage, not its API shape.** Every dialog surface those expose is present, but as flat free functions with options-bags and packed plain data, not stateful dialog objects.

## Boundaries (proposed)

_Proposed; confirm the in-scope / non-goal split._

**In scope**

- The full dialog surface: file open, file save, directory pick (a first-class `showOpenDirectoryDialog`, not an `openFile({ directory })` flag), and the message family (message / info / warning / error / confirm / prompt, plus the `showErrorBox` Electron idiom).
- The `DialogBackend` seam and its web default; the FS-Access translators (`buildFileSystemAccessTypes` / `buildAcceptAttribute` / `toFileSystemAccessStartIn`).
- The live-handle bridge accessors that let `@flighthq/filesystem` perform byte I/O it owns.

**Non-goals (proposed)**

- **Byte I/O.** No `readFile` / `writeFile` / directory enumeration in this package — that is `@flighthq/filesystem`, consuming the handle.
- **Named filter presets / a `@flighthq/dialog-formats` split.** Filters are passed as data; there is no plurality (per the triad plurality guard) and presets would overlap `resources` formats. A proposed non-goal so a later agent does not re-litigate it.
- **Native `startIn` path resolution.** Honored on web; the path-resolving form is a host-backend concern (`host-electron` / `host-tauri`), not dialog-internal.

## Decisions

None blessed yet.

## Open directions

Every candidate question from the review, plus the structural forks that touch this cell. An agent **asks** here rather than assuming.

1. **North star — pure command cell, or does dialog own a lifecycle?** Whether to add `enableDialogSignals` / `onDialogOpen` / `onDialogResult` turns on whether a `@flighthq/signals` dependency is acceptable here, when most sibling platform cells avoid it. Needs a blessed answer before the North star "there is always a backend / sentinels" framing is treated as complete.
2. **Boundary — the `filesystem → dialog` dependency direction.** The implementation has `@flighthq/filesystem` import `getWebFileSystemHandle` from dialog (I/O domain depends on the handle-source domain). Sound, but it is a real coupling between two platform cells and should be a recorded Decision, not an implicit one.
3. **Boundary — handle as cross-cell currency, as a Decision.** "Dialog never gains `readFile`/`writeFile`; the handle is the currency" is load-bearing for the whole I/O story. It is proposed as a North star above; consider promoting it to a blessed Decision.
4. **Scope — confirm `@flighthq/dialog-formats` stays unbuilt.** Named filter presets ("Images"/"Audio"/"Video") are parked. Per the triad plurality guard this is correctly _not_ split now; confirm the non-goal so it is not re-opened.
5. **Completeness — native `startIn` + the directory bridge.** `startIn` is honored on web but the Electron backend still uses `defaultPath`; and `getWebDirectorySystemHandle` exists ahead of any `readDialogHandleDirectory` consumer. Both are cross-package follow-ups (host backends; `@flighthq/filesystem` enumeration) — name them as in-scope completeness work vs. parked.
6. **Quality — the untested web backend.** Every File System Access API path, the two WeakMap registry stashes, and the three filter/`startIn` translators are untested (the suite only asserts "returns a Promise" / "null in jsdom"). The `buildFileSystemAccessTypes` all-wildcard MIME case (`{ accept: {} }`, which the API rejects) is a likely runtime reject worth a guard or a pinning test. Not a charter question per se, but the largest concrete gap the direction should acknowledge.
7. **Rust port — `flighthq-dialog`.** Declared (`crate: flighthq-dialog`) but unbuilt; the web/native `path` divergence (`null` vs `PathBuf`) needs a conformance-map entry. Out of scope for this TS worktree; flagged for the port.
8. **Fork A (source-data vs. graph participation)** and the broader platform-suite seam pattern do not bind dialog directly, but the I/O-ownership cut here is the same "where does the data live vs. who acts on it" judgement — worth keeping consistent with how `filesystem` and the other host cells draw their lines.
