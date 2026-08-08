---
package: '@flighthq/dialog'
updated: 2026-08-08
by: principal
---

# dialog — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/dialog/src/`, `packages/filesystem/src/filesystem.ts`,
and the `host-*` packages on 2026-08-08. A file:line here is a claim about this tree, not a session.

- **`startIn` is a web-only hint that native silently drops.** `toFileSystemAccessStartIn`
  (`dialog.ts:191`) maps the supported subset for the File System Access API and drops `'home'`,
  `'temp'`, `'appData'`, `'cache'` by design. But no native backend reads the field at all — the token
  appears nowhere in `electronDialog.ts`, `tauriDialog.ts`, or `capacitorDialog.ts` — so on every
  native host the option is accepted and discarded. Electron would need a `startIn`-to-`defaultPath`
  resolver.
- **The directory handle has no consumer and cannot enumerate.** `getWebDirectorySystemHandle`
  (`dialog.ts:71`) is exported and reached only by its own test; `@flighthq/filesystem` bridges file
  handles only (`filesystem.ts:437`, `:459`, `:571`, `:594`). The local stub the getter returns
  declares just `kind` and `name` (`dialog.ts:409`), so a `readDialogHandleDirectory` /
  `walkDialogHandleDirectory` bridge needs the stub widened before it can traverse anything.
- **`enableDialogSignals` is unbuilt, and it is what the cancel paths are waiting on.** The package has
  no `@flighthq/signals` dependency, and all three pickers collapse user-cancel (`AbortError`) and
  permission-denied (`SecurityError`) into the same sentinel (`dialog.ts:270-273`, `:347-350`,
  `:380-382`), so the distinction is unobservable to a caller. Whether a platform cell may take a
  signals dependency is the open decision; most siblings do not.
- **Two web option groups reach no surface.** `createWebDialogBackend.message` always returns
  `buttonIndex: 0` with `cancelled: false` and shows the text through `alert` (`dialog.ts:28-41`), so
  `buttons`, `defaultId`, `cancelId`, and `checkboxLabel` are honored on native hosts only — stated at
  `:29-30`, and worth keeping visible because they are accepted, not rejected.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

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
