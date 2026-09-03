---
package: '@flighthq/dialog'
role: package
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

Native host dialogs — file open, file save, directory pick, and the message family (message / info / warning / error / confirm / prompt / error-box) — exposed as flat free functions over explicit Host capability slots. The package owns file/directory _selection_, never byte I/O: a picker yields a `FileDialogHandle` Entity, and reading or writing those bytes is `@flighthq/filesystem`'s job through provider-neutral operations on that Entity runtime. Web file providers live in `@flighthq/host-web`; the legacy file-input fallback retains the selected `File`, while a legacy directory surrogate is deliberately absent.

## Decisions

- **[2026-07-02] Fix empty-accept edge case in `buildFileSystemAccessTypes`.** When all MIME types are wildcards, `buildFileSystemAccessTypes` produces `{ accept: {} }` which the File System Access API rejects. Guard against this — treat it as a bug fix.
- **[2026-08-30] File-picker slots and outcomes are method-tight.** `dialog.fileOpen`, `dialog.directoryOpen`, and `dialog.fileSave` are independent W/E/T slots and absent on Capacitor. Selected results are nonempty; cancellation, runtime absence, reliable security denial, and operation failure remain distinct.
- **[2026-08-30] `FileDialogHandle` is Entity currency across cells.** Provider-neutral runtime operations travel with the handle; a serialized path/name DTO is deliberately not a handle and gains no runtime authority.
- **[2026-08-30] Picker providers own no durable descriptor.** Calls settle their transient UI, and filesystem owns each writable it opens. No provider-wide destroy or handle dispose is invented.

- **[2026-09-02] One-shot media choice and capture are method-tight dialog capabilities.** `dialog.imageOpen`, `dialog.photoCapture`, and `dialog.videoCapture` are independent Host slots. The web providers live in `@flighthq/host-web`; selected images and photos carry decoded pixel dimensions, selected videos carry decoded duration in seconds, and cancellation, runtime absence, reliable security denial, and operation-specific failure remain distinct.

## Open directions

No open direction is recorded for the file-picker slice. Message and prompt option uniformity remains a
separate capability decision.
