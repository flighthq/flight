---
package: '@flighthq/menu'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
  - '@flighthq/types Menu*'
  - host-electron/src/electronMenu.ts
---

# menu — Review

Evidence: `builder-67dc46d64:packages/menu/` (source + tests), `packages/types/src/Menu*.ts`, `packages/host-electron/src/electronMenu.ts`, and `incoming/builder-67dc46d64/changes.patch`. No prior `reviews/depth/menu.md` exists in this tree — the status doc's "previous score 60" is its own self-report, not a committed depth review, so there was nothing to supersede.

## Verdict

`solid` — 84/100. A genuinely mature command-style platform capability: a clean `MenuBackend` seam, a full descriptor model, live mutators, structural edits, an opt-in signal group, six standard menu builders, 37 well-known roles at Electron parity, and a real DOM context-menu renderer with keyboard nav. It lives up to the contract closely. The deductions are honest seams the package itself defers: no functional/visual test, the `menu`↔`shortcut` accelerator-dispatch line undesigned, and a Rust crate that is a Bronze stub well behind the TS surface. The status doc's 88 is slightly generous — it scores its own deferred work as nearly-closed; 84 reflects the open Rust gap and the untested web renderer.

## Present capabilities (verified against source)

All claims below are grounded in `packages/menu/src/menu.ts`, `menu-templates.ts`, and the `@flighthq/types` Menu files; the status doc's "as-claimed" inventory checks out against the diff.

- **Backend seam.** `MenuBackend` (types/`Menu.ts`) is the swappable web/native seam; `getMenuBackend` lazily installs `createWebMenuBackend()`, `setMenuBackend(backend | null)` installs a native one or reverts to web. Matches the platform-suite command-capability shape exactly.
- **Descriptor model.** `MenuItemTemplate` carries id/label/type/role/accelerator, the `acceleratorWorksWhenHidden`/`registerAccelerator` native flags, `checked`/`enabled`/`visible`, `sublabel`/`toolTip`/`icon`, per-item `onSelect`, the four Electron positional-insertion hints (`before`/`after`/`beforeGroupContaining`/`afterGroupContaining`), and recursive `submenu`. `MenuItemType` is a closed union of the five canonical kinds; `MenuItemRole` is an open `string` contract with `WellKnownMenuItemRole` (37 entries) as the documented set + a `WellKnownMenuItemRoleValue` narrowing alias.
- **Construction/clone/validate.** `createMenuItemTemplate` (default-fills, recurses into submenus), `cloneMenuTemplate` (deep clone; `onSelect` copied by reference, documented), `validateMenuItemTemplate` (returns a `string | null` sentinel for expected violations; throws only on a cyclic submenu reference — programmer error).
- **Live mutators (handle-keyed).** `setMenuItemEnabled`/`Checked`/`Label`/`Visible`/`Accelerator`, `getMenuItemById`, all returning `false`/`null` sentinels on miss. `destroyMenuHandle` correctly uses `destroy*` (frees a native resource) not `dispose*`.
- **Structural edits.** `appendMenuItem`, `insertMenuItemBefore`, `removeMenuItemById` over the web backend's `{ items[], map }` entry struct; mirrored in `MenuBackend` and `electronMenu.ts`.
- **Context menus.** `showContextMenu(items, x, y)` shorthand and `showContextMenuAt(items, options)` with `MenuContextMenuOptions` (`positioningItemId`, `anchorElementId`, `onClose`). Both emit the `onContextMenuOpen`/`onContextMenuClose` signals when enabled.
- **Signals.** `enableMenuSignals()`/`getMenuSignals()` follow the IPC `enable*/get*` lazy, shared, tree-shakable pattern; `MenuSignals` is correctly parameterized `Signal<() => void>` / `Signal<(id: string) => void>` (the TS function-type convention, matching `DisplayObjectLifecycleSignals` — not the Rust payload convention).
- **Selection wiring.** `onMenuSelect(listener)` subscribes via the backend, then also fans out to per-item `onSelect` callbacks collected by `setApplicationMenu` and to `onMenuItemSelect`.
- **Web context-menu renderer.** Real DOM popup: viewport clamping, separators, checkmark/radio-dot, accelerator column, submenu `▶` + hover expansion, full keyboard nav (Arrow/Enter/Space/Escape), `onMenuItemHighlight` on hover and keyboard focus, overlay outside-click dismiss.
- **Standard builders** (`menu-templates.ts`): App/Edit/File/Help/View/Window, each tagged with its whole-submenu role and per-item roles/accelerators.
- **Electron backend** (`host-electron`) implements the full extended `MenuBackend`, including the new structural ops and `popupContextMenuAt`.
- **Tests.** 77 across two files; `describe` blocks alphabetized and mirroring exports (`exports:check`/`order` should pass). Includes the aliasing-relevant cases (unsubscribe, per-item dispatch, sentinel misses).

## Gaps

- **No functional/visual test.** The web context-menu renderer — the one piece with real visual output and the most code (~200 lines of DOM/CSS/keyboard logic) — has no `tests/functional/menu-*` baseline and is largely unexercised by the jsdom unit tests (which cover the no-`document` early return path, not actual rendering). This is the single biggest confidence gap.
- **Rust crate is a Bronze stub, not deferred-absent.** `crates/flighthq-menu` _exists_ but is untouched by this pass (0 lines in `changes.patch`) and is far behind TS: ~7 exports vs 28, no `MenuHandle`/`MenuItemHandle`, no mutators, no structural edits, no signals, no templates module, and `set_application_menu` still returns `bool` rather than `MenuHandle | null`. The status doc frames Rust as "deferred"; the more accurate finding is an _active conformance divergence_ — the crate's seam (`bool` return) now contradicts the TS seam it must mirror.
- **Accelerator semantics are inert and undesigned.** Accelerators are stored strings with no parse, validation, normalization, or platform-display transform (⌘⌥⇧ vs Ctrl+Alt+Shift). The `menu`↔`shortcut` dispatch boundary is unbuilt, and the `menu-formats` neighbor (chord parse/format, `AcceleratorChord`) is correctly blocked on that decision.
- **No icon rendering** in the web backend (`icon` field is inert there), and no RTL/theming hooks.
- **Radio-group semantics are thin.** No notion of a radio group id or auto-exclusivity among siblings; `checked` is per-item only.
- **`setApplicationMenu` re-call is a full rebuild.** No incremental diffing; every re-submit replaces the menu and re-collects callbacks. Fine at current scale, but named in the status as a perf gap.
- **Deep-tree structural edits absent.** `appendMenuItem`/`insertMenuItemBefore` operate on the top-level array only; no path-addressed insert into a nested submenu.

## Charter contradictions

None. The charter's "What it is" line is accurately realized; North star / Boundaries / Decisions / Open directions are all still `TODO`, so there is no stated principle for the code to violate. The contradictions worth recording are with the _contract_, not the charter (next section).

## Contract & docs fit

**How well it lives up to the contract:** very well.

- Types-first: every cross-package type (`MenuBackend`, `MenuItemTemplate`, `MenuHandle`, `MenuItemHandle`, `MenuItemSelectEvent`, `MenuContextMenuOptions`, `MenuSignals`, `WellKnownMenuItemRole`) lives in `@flighthq/types` and is barrel-exported; the package imports them with `import type`. One concept per file. ✔
- Full unabbreviated names (`setMenuItemAccelerator`, `validateMenuItemTemplate`), globally self-identifying. ✔
- Sentinels-not-throws for expected failure; the only `throw` is the cyclic-submenu programmer-error case — exactly the contract's carve-out. ✔
- `destroy*` vs `dispose*` chosen correctly (native resource → `destroy`). ✔
- Single root `.` export, `sideEffects: false`, deps limited to `@flighthq/signals` + `@flighthq/types`. Module-level `_backend`/`_menuSignals`/`_itemSelectCallbacks` are null/empty-Map initializers — no top-level registration or global mutation, so the side-effect-free invariant holds. ✔
- Exports alphabetized; tests colocated and mirrored. ✔

**Contract drift (a real one):** the **Rust-crate-mirror** expectation. The contract front-matter treats `crate: flighthq-menu` as a live mirror, but the crate's `set_application_menu -> bool` seam contradicts the TS `setApplicationMenu(): MenuHandle | null`. This is a candidate revision for the conformance map (record the divergence) **or** a Rust catch-up item — not something to bless silently.

**Admin-doc fit:** the Package Map line for `@flighthq/menu` ("native application-menu and context-menu descriptors … native host required to realize") still matches; no map edit needed. The "Inbound host events … `onMenuSelect`" line in the platform-suite paragraph is satisfied.

## Structural-fork fit

- **Fork D (runtime backend seam):** textbook fit — `MenuBackend` + `set*/get*Backend` + lazy web default, identical to the rest of the platform suite. No drift.
- **Fork B (closed union vs open registry):** correct on both axes. `MenuItemRole` is the open `string` contract (not a closed union) with a documented well-known set — exactly the prescribed shape. `MenuItemType` stays a closed five-member union; it is a fixed taxonomy in no hot loop, so the closed-union exception applies. No registry needed.
- **The subject triad:** `menu` is the data-primitive layer; the `-backend` layer is the host seam (already present); the `-formats` layer (`menu-formats` for accelerator chords) is correctly _withheld_ under the plurality guard — it is blocked on the shortcut-dispatch decision, not pre-created. Good discipline.
- **No hot-loop feature-bundling smell** (fork C): the only loops are DOM build and validation walks; no config-gated branches inflating a per-frame path.

## Candidate open directions

The charter is a stub below "What it is"; these are the questions a reviewer had to assume and which should be settled into the charter's North star / Boundaries / Open directions:

1. **The `menu`↔`shortcut` accelerator-dispatch boundary.** Who owns turning a `MenuItemTemplate.accelerator` into a live OS hotkey? Does menu auto-register with `shortcut`, or only declare? How is double-binding prevented? This gates both `menu-formats` and the accelerator display feature. (Status doc's #1 open decision.)
2. **A shared menu descriptor across surfaces** (`menu` bar, context menu, `tray` `setTrayContextMenu`, `app` dock menu). Keep the current per-surface-API + shared-`MenuItemTemplate` shape, or unify behind one handle? Cross-package (`tray`/`app`), so an Open direction, not a recommendation.
3. **Rust conformance posture for `menu`.** Is the Bronze crate an accepted, recorded divergence (it is mostly a host-seam package, arguably native-host-shaped), or a catch-up target to the full TS surface? This needs a ruling because the seams already disagree.
4. **Web-backend fidelity scope.** Is the DOM context menu meant to be production-grade (icons, RTL, theming, platform accelerator glyphs), or a reference fallback with a native host expected for anything richer? The answer sets whether the icon/RTL/theming gaps are real gaps or non-goals.
5. **Radio-group model.** Should the descriptor carry an explicit radio-group id with sibling exclusivity, matching OpenFL/native menus, or stay per-item `checked`?
