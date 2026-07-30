---
package: '@flighthq/dialog'
status: solid
score: 78
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - prior review (2026-06-25 merge gate)
---

# dialog — Review

## Verdict

**Solid — 78/100.** The 2026-06-25 merge-gate rejection no longer describes the live package. Its missing
type-layer blocker is fully resolved: `@flighthq/types` carries the complete dialog backend, option,
result, and handle shapes, and the package passes its compile, API, export, type-home, portability, and
test gates. The implementation now delivers a coherent native/web command cell: message dialogs,
open/save/directory pickers, opaque file handles, File System Access API bridges, legacy input fallbacks,
and a swappable backend without taking ownership of byte I/O. Remaining distance is predominantly
behavioral proof and the limitations of browser fallback surfaces.

## Present capabilities

- Fifteen exported functions form a symmetrical command seam: `createWebDialogBackend`,
  `getDialogBackend`, and `setDialogBackend`; the message/confirm/prompt family; three picker calls; and
  two web-handle bridge queries. Backend installation is lazy, resettable, and side-effect-free at import.
- `FileDialogHandle` is plain cross-cell currency. Native hosts carry real paths; web File System Access
  results retain live file/directory handles in identity-keyed `WeakMap`s that `@flighthq/filesystem`
  consumes through the bridge queries. Dialog never reads or writes bytes.
- The web backend prefers `showOpenFilePicker`, `showSaveFilePicker`, and `showDirectoryPicker`, then
  degrades to `<input type=file>` / `webkitdirectory` or a sentinel where no viable fallback exists.
  Picker cancellation, denied permission, absent APIs, and window-dialog failures do not throw.
- File filters normalize extensions for both File System Access and legacy input paths. The July 2 guard
  skips wildcard-only groups and omits `types` when every group is empty, avoiding the browser-rejected
  `{ accept: {} }` shape; the public backend path now pins that exact behavior.
- Public and `/contract` lanes are intentional: application-facing show/bridge calls are promoted, while
  backend creation and installation remain contract-only. All exported types live in `@flighthq/types`,
  the package has only its declared type-layer dependency, and `sideEffects` is false.

## Remaining depth

- File System Access behavior is still lightly tested. The wildcard regression now captures the options
  sent to `showOpenFilePicker`, but successful open/save/directory results, `startIn` filtering, suggested
  save names, failure sentinels, and both native-handle registry round trips lack direct behavioral proof.
- Legacy input cancellation is not deterministic on browsers that emit neither `change` nor the newer
  `cancel` event; in that environment the returned Promise can remain pending. A focus-return fallback or
  an explicit browser-support contract needs careful event-lifecycle handling.
- `OpenDirectoryDialogOptions.multiple` cannot be honored by `showDirectoryPicker`, which selects one
  directory, and is inconsistently supported by the `webkitdirectory` fallback. The type comment currently
  overstates web support and should be reconciled when the cross-host multiple-directory contract is set.
- Web `confirm`/`alert`/`prompt` necessarily ignore most native options: title/detail/button arrays,
  checkbox presentation, parent window, prompt placeholder, and severity. These are honest degradation
  points, but there is no capability query for callers that need to choose their own web UI.
- The package catches every File System Access error into the same sentinel. That matches suite policy for
  expected cancellation/absence, but it cannot distinguish cancellation, permission denial, and an invalid
  picker option if a future filter regression escapes tests.

## Charter and boundary conclusion

The live implementation matches the charter's core boundary: selection belongs here, I/O remains in
`@flighthq/filesystem`, and native hosts replace the web backend through the shared platform-suite seam.
The charter's July 2 empty-accept decision is implemented and regression-tested. Its two remaining
directions—promoting handle-as-currency and recording the filesystem-to-dialog dependency—describe
already-shipped architecture and should be formalized in a future direction session rather than changed
by a sweep.
