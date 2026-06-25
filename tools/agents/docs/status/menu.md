# @flighthq/menu — status

## 2026-06-25 — RECOVERY RESOLUTION (flat command shape) — supersedes the R2-4 note below

The red-tree recovery (`_recovery-green-baseline.md`) resolved menu definitively: the rich/OOP surface the R2-4 note below argued to restore was ruled **interrupted-run drift**. The blessed shape is the platform-suite **flat command API**, pulled DOWN to host-electron's real seam. The R2-4 analysis below (which advocated extending `Menu.ts` UP to a rich `MenuBackend`/`MenuItemTemplate`) is **superseded** — do not act on it.

Final state (green: `tsc -b` = 0, `npm run check` exits 0, menu 33 tests pass):

- **`MenuItemRole`** = OPEN: `WellKnownMenuItemRoleValue | (string & {})` (autocomplete for known roles, any string accepted; unknown → backend sentinel/no-op).
- **`MenuItemTemplate`** = `{ id?, label?, type?, role?, accelerator?, enabled?, checked?, submenu? }` — no `visible`, `onSelect`, or the phantom Electron fields (`toolTip`/`icon`/`sublabel`/ `acceleratorWorksWhenHidden`/`registerAccelerator`).
- **`MenuBackend`** = host-electron's 3-method seam: `setApplicationMenu(items): boolean`, `popupContextMenu(items, x, y): Promise<string|null>`, `subscribeSelect((id: string) => void)`.
- **`menu.ts`** kept exactly: `cloneMenuTemplate`, `createMenuItemTemplate`, `createWebMenuBackend`, `enableMenuSignals`, `getMenuBackend`, `getMenuSignals`, `onMenuSelect`, `setApplicationMenu`, `setMenuBackend`, `showContextMenu`, `validateMenuItemTemplate`. Removed the rich item-mutation API and `MenuHandle` plumbing; `buildWebMenuElement` no longer reads `visible`.
- **Deleted orphan type files**: `MenuHandle.ts`, `MenuItemHandle.ts`, `MenuItemSelectEvent.ts`, `MenuContextMenuOptions.ts` (+ barrel exports). `MenuSignals.onMenuItemSelect` → `Signal<(id: string)>`.
- `host-electron`/`electronMenu.ts` now matches the seam unchanged; its 68 tests pass.

---

## 2026-06-25 — builder R2-4 lost-source recovery (SUPERSEDED by the resolution above)

The integration curation pruned `packages/menu/src/` down to 8 of the 22 exported functions the build output (`dist/`) proves existed, and dropped the entire `menu-templates` module. Recovery was tightly constrained by the HARD BOUNDARY: `@flighthq/types/src` had also been pruned to an OLD/simple menu shape, and editing types is out of scope.

### Recovered (into existing `src/menu.ts` + `src/menu.test.ts`)

- `cloneMenuTemplate(template)` — deep-clones a `MenuItemTemplate` tree (submenus recursed, callbacks by-reference). Depends only on `MenuItemTemplate`, which exists in `@flighthq/types/src`. Recovered with tests.
- `validateMenuItemTemplate(template)` — validates a template tree, returns a string sentinel or null, throws only on a cyclic submenu reference. Depends only on `MenuItemTemplate`. Recovered with tests, plus the private `_validateItem` helper at the bottom of the file. The two dead no-op `if` branches in the dist (submenu-with-no- children, checkbox/radio-without-checked — comment-only bodies) were dropped as they carried no behavior.

Both functions compile against the current pruned `MenuItemTemplate` (they touch only `type`, `label`, `accelerator`, `submenu`, `checked`). Tests restricted to fields the current type declares (no `visible`/`onSelect`).

### Skipped — fossils

None. Nothing here implements a deliberately-dropped concept.

### Parked — blocked by missing `@flighthq/types` shape (cannot edit types)

The dist `menu.js`/`menu-templates.js` prove a much richer module that the curation also pruned the _types_ for. These cannot be recovered without first restoring types in `@flighthq/types`, which is outside this task's boundary.

- `menu-templates` module (whole file: `createDefaultAppMenuTemplate`, `createDefaultEditMenuTemplate`, `createDefaultFileMenuTemplate`, `createDefaultHelpMenuTemplate`, `createDefaultViewMenuTemplate`, `createDefaultWindowMenuTemplate`) — imports the value enum `WellKnownMenuItemRole` from `@flighthq/types`, which is absent from `@flighthq/types/src` (`WellKnownMenuItemRole.ts` exists only in types' `dist/`). Also relies on the richer `MenuItemTemplate` (the `visible` field). Reason: needs `WellKnownMenuItemRole` in `@flighthq/types`.
- `appendMenuItem`, `insertMenuItemBefore`, `getMenuItemById`, `removeMenuItemById`, `destroyMenuHandle`, `setMenuItemAccelerator`, `setMenuItemChecked`, `setMenuItemEnabled`, `setMenuItemLabel`, `setMenuItemVisible` — all take/return `MenuHandle` / `MenuItemHandle`, neither of which exists in `@flighthq/types/src`. Reason: needs types `MenuHandle` and `MenuItemHandle` in `@flighthq/types`.
- `showContextMenuAt` — takes `MenuContextMenuOptions`, absent from `@flighthq/types/src`. Reason: needs type `MenuContextMenuOptions` in `@flighthq/types`.
- `enableMenuSignals`, `getMenuSignals` — return `MenuSignals` (absent from `@flighthq/types/src`) and import `createSignal`/`emitSignal` from `@flighthq/signals`, which is not even a declared dependency of `@flighthq/menu` (package.json deps = `@flighthq/types` only). Reason: needs type `MenuSignals` in `@flighthq/types` and a `@flighthq/signals` dependency.

Additionally, the richer dist forms of the already-present functions (`createMenuItemTemplate` filling `visible`, `setApplicationMenu` returning `MenuHandle | null`, `onMenuSelect` carrying a `MenuItemSelectEvent`, the full `createWebMenuBackend` DOM renderer + live-mutation backend, `showContextMenu` emitting signals) were left at their current pruned shape: upgrading them requires the same missing `@flighthq/types` shapes and would break the existing internally-consistent backend interface (`MenuBackend.setApplicationMenu` returns `boolean` in types/src). Not touched — restoring them belongs with the types restoration.

### Tests

`npm run test --workspace=packages/menu`: 1 file, 22 passed (12 prior + 10 recovered).

## 2026-06-25 — builder R2-4 second-pass recovery

The parallel types pass has since restored the menu type files into `@flighthq/types/src`: `WellKnownMenuItemRole.ts`, `MenuHandle.ts`, `MenuItemHandle.ts`, `MenuItemSelectEvent.ts`, `MenuSignals.ts`, `MenuContextMenuOptions.ts` are all now present. Everything the previous pass parked for "needs type X" is now unblocked by name, so the full richer module recorded in `dist/` was recovered.

### Recovered

- `menu-templates` module (whole file `src/menu-templates.ts` + `src/menu-templates.test.ts`): `createDefaultAppMenuTemplate`, `createDefaultEditMenuTemplate`, `createDefaultFileMenuTemplate`, `createDefaultHelpMenuTemplate`, `createDefaultViewMenuTemplate`, `createDefaultWindowMenuTemplate`. Imports `WellKnownMenuItemRole` (value) and `MenuItemTemplate` (type) from `@flighthq/types`. Added `export * from './menu-templates'` to `src/index.ts` (alphabetized after `./menu`).
- Upgraded `src/menu.ts` from the pruned 8-function shape to the full 22-function shape proven by `dist/menu.js` + `dist/menu.d.ts`: added `appendMenuItem`, `destroyMenuHandle`, `enableMenuSignals`, `getMenuItemById`, `getMenuSignals`, `insertMenuItemBefore`, `removeMenuItemById`, `setMenuItemAccelerator`, `setMenuItemChecked`, `setMenuItemEnabled`, `setMenuItemLabel`, `setMenuItemVisible`, `showContextMenuAt`. Upgraded the existing functions to their full dist forms: `createMenuItemTemplate` now fills `visible: true` and recurses into submenu children; `setApplicationMenu` returns `MenuHandle | null` and registers per-item `onSelect` callbacks; `onMenuSelect` now carries a `MenuItemSelectEvent` and dispatches per-item callbacks + the `onMenuItemSelect` signal; `createWebMenuBackend` is the full DOM context-menu renderer (`showWebContextMenu` + `buildWebMenuElement` helpers) plus the in-memory live-mutation backend; `showContextMenu` emits the open/close signals. Module-level `_backend`, `_menuSignals`, `_itemSelectCallbacks`, and private helpers kept at the bottom after exported functions.
- `src/menu.test.ts` recovered to the full 21-describe-block suite from `dist/menu.test.js` (the extended fake backend with handle/item maps, signal-group teardown, per-item callback dispatch).
- Added `@flighthq/signals` to `packages/menu/package.json` dependencies (used by `createSignal`, `emitSignal` in source and `clearSignal` in the test). It was missing — the dist code proves it was always required.

### Skipped — fossils

None. Nothing here implements a deliberately-dropped concept (the dropped-concepts list — DisplayObject cacheAsBitmap/scrollRect, the OpenFL Loader, Stage setters, Bitmap pixelSnapping, displayobject lifecycle signals, traversal wrappers — does not touch the menu package).

### Parked

None. All previously-parked menu modules are recovered now that their types exist by name.

### Notes / surfaced gaps (outside this task's boundary — `@flighthq/types`)

The recovered modules run green under vitest (which transpiles, not typechecks), but `@flighthq/types/src/Menu.ts` still carries the OLD/simplified interface _bodies_ even though all the standalone type files were restored:

- `MenuBackend` in `Menu.ts` still declares only `setApplicationMenu(): boolean`, `popupContextMenu`, `subscribeSelect((id: string) => void)`. The recovered code needs the extended contract: `setApplicationMenu(): MenuHandle | null`, `popupContextMenuAt`, `subscribeSelect((event: MenuItemSelectEvent) => void)`, `setMenuItem{Enabled,Checked,Label,Visible,Accelerator}`, `getMenuItemById`, `destroyMenuHandle`, `appendMenuItem`, `insertMenuItemBefore`, `removeMenuItemById`.
- `MenuItemTemplate` in `Menu.ts` lacks `visible`, `onSelect`, `toolTip`, `sublabel`, `icon`, `acceleratorWorksWhenHidden`, `registerAccelerator` (all used by the recovered code/tests).
- `MenuItemRole` in `Menu.ts` is a closed union missing the whole-submenu role values (`appMenu`/`editMenu`/`fileMenu`/`helpMenu`/`viewMenu`/`windowMenu`/`shareMenu`) and many of the `WellKnownMenuItemRole` entries; per the codebase convention `MenuItemRole` should be an open `string` contract whose documented values live in `WellKnownMenuItemRole`.

These three `Menu.ts` body extensions are required for `tsc -b` / `npm run check` to pass. They are inside `@flighthq/types`, which is outside this task's hard boundary, so they were NOT edited here and must be completed by a types-scoped pass before a typecheck gate will go green.
