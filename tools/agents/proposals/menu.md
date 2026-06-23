---
id: menu
title: '@flighthq/menu'
type: depth
target: menu
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/menu.md
  - tools/agents/docs/reviews/depth/menu.md
depends_on: []
updated: 2026-06-23
---

## Summary

stub — 22/100. A correct, idiomatic backend-seam shim that covers only the entry points; ~1/5 of an authoritative native-menu library, explicitly self-labeled MVP in-source.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The first genuinely useful version: a real app can build a menu bar and a context menu, toggle item state without a full rebuild, and act on selections with enough context to do real work.

Types first, in `@flighthq/types/src/Menu.ts`:

- Extend `MenuItemTemplate` with the universally-present fields: `visible?: boolean`, `toolTip?: string`, `sublabel?: string`, `icon?: string` (resource id / path).
- Add `MenuItemSelectEvent` — the payload for selection: `{ id: string; checked: boolean; type: MenuItemType; menuId: string | null }`. Replace the bare-`string` listener contract with this.
- Add `MenuHandle` and `MenuItemHandle` opaque entity types (id + backend-private runtime), the live counterparts to the `*Template` input form, returned from install/popup.
- Broaden `MenuItemRole` from a closed 12-member union to an **open contract**: `type MenuItemRole = string` with an exported `WellKnownMenuItemRole` documented constant set (per the types-layout "open contracts not closed unions" rule). Add the missing common roles: `selectAll` (present), plus `delete`, `pasteAndMatchStyle`, `zoomIn`/`zoomOut`/`resetZoom`, `togglefullscreen` (normalize casing vs `toggleFullscreen`), `help`, `services`, `hide`/`hideOthers`/`unhide`, `front`, `window`.
- Extend `MenuBackend` with the mutator + handle methods (see below).

In `@flighthq/menu/src`:

- `setApplicationMenu(items)` returns a `MenuHandle | null` (was `boolean`) — null when no native bar.
- `showContextMenu(items, x, y)` keeps resolving `string | null`, but gains the live path via handles when a backend supports it.
- Mutable state mutators routed through the backend — the single highest-value gap:
  - `setMenuItemEnabled(handle, id, enabled): boolean`
  - `setMenuItemChecked(handle, id, checked): boolean`
  - `setMenuItemLabel(handle, id, label): boolean`
  - `setMenuItemVisible(handle, id, visible): boolean`
  - `setMenuItemAccelerator(handle, id, accelerator): boolean`
  - `getMenuItemById(handle, id): MenuItemHandle | null`
- Richer selection: `onMenuSelect(listener: (event: Readonly<MenuItemSelectEvent>) => void)` carrying checked-state/type/origin.
- `createMenuItemTemplate` deep-normalizes `submenu` recursively (each child run through the same default-fill), not just the top item.
- A minimal real **web context-menu backend**: `createWebMenuBackend()` renders a positioned DOM popup so `showContextMenu` actually works in a browser (separators, submenu hover, enabled/checked rendering, click-to-resolve, dismiss-on-outside-click → resolves `null`). App menu bar stays native-only (returns null on web). This is the one piece that is genuinely renderable in-box and today is pure sentinel.

### Silver

Competitive and solid — matches a well-regarded native-menu library (Electron `Menu`/`MenuItem`, Tauri menu) for common professional use and the important edge cases, with cross-backend consistency.

- **Standard-menu builders** (named, tree-shakable factories returning `MenuItemTemplate[]`):
  - `createDefaultEditMenuTemplate()`, `createDefaultViewMenuTemplate()`, `createDefaultWindowMenuTemplate()`, `createDefaultAppMenuTemplate(appName)`, `createDefaultHelpMenuTemplate()`.
  - Whole-submenu roles honored by native backends: `appMenu`, `editMenu`, `viewMenu`, `windowMenu`, `fileMenu`, `shareMenu`, `recentDocuments`/`clearRecentDocuments`.
- **Positional insertion / edit ops** on a live handle (Electron's `before`/`after`/`beforeGroupContaining`/`afterGroupContaining` model):
  - `MenuItemTemplate` gains `before?: string[]`, `after?: string[]`, `beforeGroupContaining?: string[]`, `afterGroupContaining?: string[]`.
  - `insertMenuItem(handle, template, position): MenuItemHandle | null`, `appendMenuItem(handle, template)`, `removeMenuItemById(handle, id): boolean`.
- **Per-item `click` ergonomics** layered over the id core: `MenuItemTemplate.onSelect?: (event: Readonly<MenuItemSelectEvent>) => void`, dispatched by the package alongside the global `onMenuSelect` signal. Radio-group semantics surfaced (which sibling became active, group id).
- **Accelerator seam** — define the boundary with `@flighthq/shortcut`:
  - `parseAcceleratorString(accelerator): AcceleratorChord | null` and `formatAcceleratorChord(chord, platform): string` in a `@flighthq/menu-formats` neighbor package (the "-formats" importer/parser pattern), with `AcceleratorChord` and `AcceleratorModifier` types in `@flighthq/types`.
  - `validateAcceleratorString(accelerator): boolean`; `MenuItemTemplate.acceleratorWorksWhenHidden?: boolean`, `registerAccelerator?: boolean`.
  - Document who dispatches accelerators (menu native backend vs `@flighthq/shortcut`) and avoid double-binding.
- **Context-menu depth**: `showContextMenuAt(items, options)` where options carry `{ x, y, positioningItemId?, anchorNodeId?, callback? }`; resolve `MenuItemSelectEvent | null`; distinguish dismiss (`null`) from selection in the returned promise; full keyboard navigation contract in the web backend (arrow/enter/escape, type-ahead, submenu open on right-arrow).
- **Signals group**: `enableMenuSignals()` exposing `menuOpenSignal`, `menuCloseSignal`, `menuItemHighlightSignal` (multi-listener / priority / cancellable per the signals rule), kept opt-in so the default bundle pays nothing.
- **Validation**: role↔type consistency checks (`separator` carries no label/accelerator; `radio`/`checkbox` carry `checked`; `submenu` carries `submenu`) returning sentinels, not throwing, for malformed templates; throw only on programmer misuse (e.g. cyclic submenu).
- **Cross-backend consistency**: the web context-menu backend matches native role behavior where it can (Edit-menu roles wired to `@flighthq/clipboard`), and documents which roles are native-only.

### Gold

Authoritative / AAA — the canonical reference for application + context menus, exhaustive, tested, documented, and with a 1:1 Rust mirror.

- **Full role coverage** to Electron parity (~40+): `services`, `startSpeaking`/`stopSpeaking`, `toggleSpellChecker`, `toggleTabBar`/`selectNextTab`/`selectPreviousTab`/`mergeAllWindows`/`moveTabToNewWindow`, `zoom`, `recentDocuments` family, `shareMenu`, plus platform app-menu roles, each documented with its host-support matrix.
- **Dock / status-bar / tray menu interop**: a shared menu descriptor consumed by `@flighthq/tray` (`setTrayContextMenu`) and `@flighthq/app` (dock menu) so menu templates are reusable across surfaces — define the shared seam in `@flighthq/types`, not duplicated per package.
- **Complete handle entity model**: id-addressable mutators for every descriptor field; `cloneMenuTemplate`, `disposeMenuHandle` (detach listeners → GC), `destroyMenuHandle` (free native handle now), honoring the `dispose*`/`destroy*` distinction.
- **Icon + accelerator rendering** in the web backend: glyph/image icons, platform-correct accelerator glyph formatting (⌘⌥⇧ on macOS, Ctrl+Alt+Shift on Win/Linux), submenu indicators, checkmarks, radio dots, RTL layout, theming hooks, high-DPI.
- **Performance & robustness**: incremental menu diffing (mutate only changed items, no full re-submit), large-menu virtualization in the web popup, debounced rebuilds, deep-submenu and many-item stress coverage.
- **Exhaustive tests**: every export with aliasing/unsubscribe cases (already strong), plus the web context-menu render path (jsdom), keyboard navigation, accelerator parse/format round-trips, role→behavior wiring, and a functional/visual test (`tests/functional/menu-context`) capturing the web popup across backends per the functional-test skill.
- **Docs**: per-role support matrix, platform-difference notes (macOS app menu vs Win/Linux), accelerator-string grammar, and the menu↔shortcut↔tray↔app interop map.
- **Rust parity** — `flighthq-menu` crate mirroring the seam 1:1: `MenuBackend` trait + `set_menu_backend`, free functions (`set_application_menu`, `show_context_menu`, `on_menu_select`, the `set_menu_item_*` mutators), open `MenuItemRole` as a string newtype, `MenuItemTemplate`/`MenuItemSelectEvent` value types in `flighthq-types`. Native default via `host-winit`/`host-sdl` (muda or equivalent); web context menu in `host-web`; the accelerator parser mirrored in a `flighthq-menu-formats` crate. Conformance scene `menu_context` paired by name with the TS functional test.

## Sequencing & effort

Recommended order, with dependencies and cross-package items to surface.

1. **Bronze types + mutable-state mutators (largest single value jump).** Land the `@flighthq/types` changes first (the header layer): extended `MenuItemTemplate`, `MenuItemSelectEvent`, `MenuHandle`/`MenuItemHandle`, open `MenuItemRole`, and the new `MenuBackend` methods. Then implement the mutators and the richer `onMenuSelect` payload. Moderate effort, self-contained in this package + types. **Breaking-ish but pre-release** — `setApplicationMenu` return type and the `onMenuSelect` signature change; acceptable given no published consumers, but call it out as a deliberate reshape. Decide here: handle-addressable mutators (`setMenuItemEnabled(handle, id, …)`) vs returning a live mutable object — recommend handle + id mutators to stay plain-data and Rust-portable.
2. **Bronze web context-menu backend.** Independent of (1) except the shared types; can proceed in parallel. Medium effort (DOM popup, positioning, dismiss). This is the most user-visible win on web. Surface the design choice: keep app-menu-bar native-only (recommended) vs attempt an in-page menu bar (out of scope, low value).
3. **Silver standard-menu builders + validation.** Pure additive, low risk, high ergonomic payoff; depends only on the Bronze descriptor fields. Resolve the `toggleFullscreen` vs `togglefullscreen` casing inconsistency here, once, deliberately.
4. **Silver accelerator seam + `@flighthq/menu-formats`.** New neighbor package (copy a nearby `-formats` package shape, run `npm run packages:check`). **Cross-package design decision to surface to the user**: the boundary between `@flighthq/menu` (declares accelerators) and `@flighthq/shortcut` (registers/dispatches global hotkeys) — who owns dispatch, how double-binding is avoided. Do not build until that line is agreed.
5. **Silver context-menu depth + signals group.** Keyboard nav and `enableMenuSignals()` build on the Bronze web backend. Opt-in signals keep the bundle clean — verify with `npm run size`.
6. **Gold full role set, interop, performance, tests, docs.** Largest and last. The **tray/app/dock menu interop** (Gold) is a cross-package item — the shared descriptor must live in `@flighthq/types` and be coordinated with `@flighthq/tray` and `@flighthq/app`; surface this as a design proposal before implementing, since it touches three packages' public surface.
7. **Gold Rust mirror.** Follows the stabilized TS seam; do not start until the TS `MenuBackend` shape is settled through Silver, to avoid porting a moving target. Native menu backend (muda) and the `flighthq-menu-formats` accelerator parser are the bulk of the effort.

**Cross-package / design-decision items to raise before acting:**

- The `menu` ↔ `shortcut` accelerator-dispatch boundary (step 4) — affects two package surfaces.
- The shared tray/app/dock menu descriptor (Gold step 6) — affects three packages; belongs in `@flighthq/types`.
- The public-surface reshape in step 1 (`setApplicationMenu` return type, `onMenuSelect` payload) — pre-release so allowed, but a deliberate break worth confirming.
- Whether the web app-menu-bar is in scope at all (recommend: no; native-only).

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/menu` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
