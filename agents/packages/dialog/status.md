---
package: '@flighthq/dialog'
updated: 2026-08-30
by: builder4
---

# dialog — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against the explicit Host file-picker slice on 2026-08-30.

- **Two web option groups reach no surface.** `webMessageDialogBackend.message` always returns
  `buttonIndex: 0` with `cancelled: false` and shows the text through `alert` (`dialog.ts:28-41`), so
  `buttons`, `defaultId`, `cancelId`, and `checkboxLabel` are honored on native hosts only — stated at
  `:29-30`, and worth keeping visible because they are accepted, not rejected.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — File dialogs split into explicit fileOpen/directoryOpen/fileSave slots; outcomes,
  common options, Entity runtime operations, Web provider ownership, legacy settlement, and IPC mapping
  now live in `types/Dialog.ts`, `dialog/fileDialog.ts`, and each host's dialog provider.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: the Gold item
  "`@flighthq/host-tauri` / `@flighthq/host-capacitor` dialog backends — cross-package work dependent
  on those host packages maturing. Out of scope." Both exist
  (`host-tauri/src/tauriDialog.ts`, `host-capacitor/src/capacitorDialog.ts`), which is also what makes
  the `startIn` drop above a three-host gap rather than a hypothetical. Also dropped the
  `FileSystemBackend`/`filesystem` expansion notes (they are that cell's status, not this one) and the
  score bookkeeping.
- **2026-07-30** — Proved the empty-accept regression on the public path: an all-wildcard filter sends
  no `types` property to `showOpenFilePicker`.
- **2026-06-24** — Gold landing: File System Access API paths for open/save/directory with the two
  handle registries, `FileDialogHandle` as the cross-cell currency, `startIn` on all three picker
  option bags, full `MessageDialogResult`, and the `@flighthq/filesystem` read/write bridges.
