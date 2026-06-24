---
package: '@flighthq/menu'
crate: flighthq-menu
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# menu — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/menu` is the native application-menu and context-menu capability of the platform-integration suite: a flat set of free functions over a swappable `MenuBackend` seam that build menu/menu-item templates, install the application menu bar, pop up context menus, mutate live menu items, and deliver menu-item selection events. It is a **command-style** capability — flat functions plus `getMenuBackend`/`setMenuBackend`/`createWebMenuBackend`, with an opt-in `MenuSignals` group via `enableMenuSignals`/`getMenuSignals`, exactly matching the rest of the suite (`tray`, `notification`, `shell`, …).

The descriptor (`MenuItemTemplate`) is the data primitive; the host seam is the `-backend` layer (web DOM default, Electron and other native hosts register their own). Where it ends and a neighbor begins: `menu` describes and realizes menus, but it does **not** own OS hotkey registration (`shortcut`), the tray icon or its context menu (`tray` calls into the same `MenuItemTemplate` shape via `setTrayContextMenu`), or the dock/app menu (`app`). The accelerator _string_ lives on the template here; turning it into a live OS hotkey is a `menu`↔`shortcut` boundary that is not yet drawn.

## North star (proposed)

_Proposed, not blessed. Edit or promote into Decisions in a direction session._

- **One descriptor, every surface.** `MenuItemTemplate` is the single shared data model for the menu bar, context menus, the tray context menu, and the app/dock menu. Surfaces differ by which function realizes the template, not by carrying their own item type.
- **Command-capability symmetry.** Stay a textbook platform-suite command capability: flat free functions, `get*/set*/createWeb*Backend`, lazy web default that guards every API and returns sentinels (`false`/`null`/`-1`) when the platform can't serve it — never throw for an absent platform. Throw only for programmer error (the cyclic-submenu case).
- **Plain data over runtime objects.** A menu is a descriptor applied by an explicit backend call, not a stateful object the runtime mutates implicitly. Handles are opaque keys into backend state; mutators are explicit handle-keyed functions.
- **Open role contract, closed item taxonomy.** `MenuItemRole` is an open `string` contract with a documented `WellKnownMenuItemRole` set (fork B: open registry by default); `MenuItemType` stays a closed five-member union (the closed-union exception — a fixed taxonomy in no hot loop). Custom roles namespace with a vendor prefix.
- **Web is a faithful reference, native is the production realizer.** The DOM context-menu renderer is a real, usable fallback; the richest fidelity is expected from a native host backend. (How far the web renderer should go is an Open direction.)

## Boundaries (proposed)

_Proposed, not blessed._

**In scope**

- Menu and menu-item descriptor construction, deep clone, and validation.
- Installing the application menu bar; popping up context menus (shorthand + options form).
- Live, handle-keyed item mutation (enabled/checked/label/visible/accelerator) and structural edits (append/insert/remove).
- The standard menu builders (App/Edit/File/Help/View/Window) and the well-known role set.
- The `MenuBackend` seam, its lazy web DOM renderer, and the `MenuSignals` opt-in group.
- Menu-item selection / highlight wiring (`onMenuSelect`, per-item `onSelect`, `onMenuItemSelect`).

**Non-goals (candidate — confirm in direction)**

- **OS hotkey registration.** Owned by `@flighthq/shortcut`; `menu` declares the accelerator string, it does not bind it (boundary undecided — Open directions).
- **Tray and dock/app menus as their own item types.** `tray` and `app` reuse `MenuItemTemplate`; `menu` does not absorb those surfaces.
- **Accelerator chord parse/format** (`menu-formats`). Correctly withheld under the triad plurality guard until the shortcut-dispatch decision is made.
- **(Candidate) Icon rendering, RTL, and theming in the web backend** — possibly a native-host concern rather than a web gap. Settle via the web-fidelity Open direction.

## Decisions

_None blessed yet._

## Open directions

Every question below is unsettled and needs your ruling before it becomes North star or a Decision.

1. **The `menu`↔`shortcut` accelerator-dispatch boundary.** Who turns a `MenuItemTemplate.accelerator` into a live OS hotkey? Does `menu` auto-register with `shortcut`, or only declare the string? How is double-binding prevented? This gates both `menu-formats` (chord parse/format, `AcceleratorChord`) and any accelerator-display transform (⌘⌥⇧ vs Ctrl+Alt+Shift). (Fork A / triad; status doc's #1 open decision.)

2. **A shared menu descriptor across surfaces.** Keep the current per-surface-API + shared-`MenuItemTemplate` shape, or unify the menu bar, context menu, `tray` `setTrayContextMenu`, and `app` dock menu behind one handle/abstraction? Cross-package (`tray`/`app`) — a direction question, not a within-package recommendation.

3. **Rust conformance posture.** `crates/flighthq-menu` is a Bronze stub (~7 exports vs 28), with no handles/mutators/structural-edits/signals/templates, and `set_application_menu -> bool` now _contradicts_ the TS `setApplicationMenu(): MenuHandle | null`. Is this an accepted, recorded divergence (menu is largely host-seam, arguably native-shaped) or a catch-up target to the full TS surface? The seams already disagree, so this needs a ruling either way (conformance-map entry vs. catch-up item).

4. **Web-backend fidelity scope.** Is the DOM context menu meant to be production-grade (icons, RTL, theming, platform accelerator glyphs), or a reference fallback with a native host expected for anything richer? The answer decides whether the icon/RTL/theming gaps are real gaps or blessed non-goals.

5. **Radio-group model.** Should the descriptor carry an explicit radio-group id with sibling auto-exclusivity (matching OpenFL/native menus), or stay per-item `checked` only?

6. **Structural-edit depth.** `appendMenuItem`/`insertMenuItemBefore`/`removeMenuItemById` operate on the top-level array only. Is path-addressed insert into a nested submenu in scope, or intentionally out?

7. **`setApplicationMenu` rebuild cost.** Each re-submit is a full rebuild + callback re-collect with no incremental diffing. Bless as fine-at-scale, or commit to incremental diffing as a target?

8. **Functional/visual coverage.** The web context-menu renderer (the most code, the only real visual output) has no `tests/functional/menu-*` baseline. Confirm adding one as the intended confidence path (within-package, sweep-safe) vs. accepting the web renderer as reference-only and untested.
