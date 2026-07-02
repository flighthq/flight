---
package: '@flighthq/dialog'
crate: flighthq-dialog
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# dialog — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Native host dialogs — file open, file save, directory pick, and the message family (message / info / warning / error / confirm / prompt / error-box) — exposed as flat free functions over a swappable `DialogBackend`. The package owns file/directory _selection_, never byte I/O: a picker yields a `FileDialogHandle` (an opaque reference to the chosen file/directory), and reading or writing those bytes is `@flighthq/filesystem`'s job via the bridge accessors (`getWebFileSystemHandle` / `getWebDirectorySystemHandle`). The web backend reaches for the File System Access API first and treats `<input type=file>` / `<input webkitdirectory>` as explicit, named fallbacks.

## Decisions

- **[2026-07-02] Fix empty-accept edge case in `buildFileSystemAccessTypes`.** When all MIME types are wildcards, `buildFileSystemAccessTypes` produces `{ accept: {} }` which the File System Access API rejects. Guard against this — treat it as a bug fix.

## Open directions

1. **Handle as cross-cell currency.** "Dialog never gains `readFile`/`writeFile`; the handle is the currency" is load-bearing for the I/O story. Should be promoted to a blessed Decision.
2. **The `filesystem` -> `dialog` dependency direction.** `@flighthq/filesystem` imports `getWebFileSystemHandle` from dialog. Sound (I/O domain depends on handle-source domain), but it is a real coupling between two platform cells that should be a recorded Decision.
