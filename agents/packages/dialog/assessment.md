---
package: '@flighthq/dialog'
updated: 2026-07-30
basedOn: ./review.md
---

# dialog — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

No open sweep-safe items. The previously approved empty-accept fix landed in `e115beddd`, and the File
System Access public path now has a regression test proving an all-wildcard filter omits `types` instead
of sending `{ accept: {} }`.

## Approved

1. **[2026-07-30 · completed] Fix `buildFileSystemAccessTypes` empty-accept edge case.** Guard landed in
   `e115beddd`; live-tree regression proof added through `createWebDialogBackend().openFile`.

## Backlog

- Deterministic legacy file-input cancellation on browsers without the `cancel` event.
- Cross-host semantics for `OpenDirectoryDialogOptions.multiple`, which the File System Access API cannot
  honor.
- Broader File System Access behavior tests: successful open/save/directory options, handle registry
  round trips, and failure sentinels.
- Promote handle-as-currency and the filesystem-to-dialog dependency direction from shipped architecture
  to dated charter Decisions.
