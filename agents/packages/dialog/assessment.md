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

1. **`FileDialogFilter` cannot express which extension belongs to which MIME type.** `extensions` and
   `mimeTypes` are parallel arrays with no correspondence, so a group like
   `{extensions:['png','jpg'], mimeTypes:['image/png','image/jpeg']}` translates to *both* MIME keys
   mapping to *both* extensions — asserting that a `.jpg` is an `image/png`. Harmless with today's
   pickers, which union the entries, but it is a data-model limitation being papered over rather than
   a translation bug: there is no information in the type to do better. Either pair them (`entries:
   [{mime, extensions}]`) or state in the type doc that the arrays are independent sets. **A type
   change in `@flighthq/types`, so a seam decision rather than a sweep.**
2. **An extension-only filter is declared as `application/octet-stream`.** With no MIME given that is
   the only available fallback, and pickers filter by extension anyway — but it does tell the platform
   a `.txt` file is an opaque binary. Worth either a comment recording it as a deliberate fallback or,
   if item 1 is taken, deriving a MIME from the extension.

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
