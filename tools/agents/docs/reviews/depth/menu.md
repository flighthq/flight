# Depth Review: @flighthq/menu

**Domain**: Native application-menu and context-menu descriptors — building menu/menu-item templates, installing the application menu bar, popping up context menus, and receiving menu-item selection events, all over a swappable web/native (`MenuBackend`) seam.

**Verdict**: stub — 22/100

The package is a thin, correct backend-seam shim. It establishes the command-capability pattern (flat free functions + `get*/set*Backend` + `createWeb*Backend`) and the data model lives in `@flighthq/types` (`MenuItemType`, `MenuItemRole`, `MenuItemTemplate`, `MenuBackend`). But measured against what a mature native-menu library is expected to expose, it covers only the entry points and leaves almost the entire surface unbuilt. The package itself even self-documents this: comments repeatedly say "out of scope for the MVP."

## Present capabilities

Source is a single `src/menu.ts` (61 lines) exporting 7 functions:

- `createMenuItemTemplate(template?)` — template constructor filling defaults (`type: 'normal'`, `enabled: true`).
- `setApplicationMenu(items)` — installs the application menu bar; returns `false` when no native bar (web).
- `showContextMenu(items, x, y)` — pops a context menu at a point, resolves the clicked id or `null`.
- `onMenuSelect(listener)` — subscribes to app-menu item selections, returns unsubscribe.
- `getMenuBackend()` / `setMenuBackend(backend|null)` / `createWebMenuBackend()` — the standard backend seam with a lazily-created web default that returns sentinels (`false`/`null`/no-op).

Type model in `@flighthq/types/src/Menu.ts`: `MenuItemTemplate` carries `id`, `label`, `type`, `role`, `accelerator`, `enabled`, `checked`, `submenu`. `MenuItemType` covers `normal | separator | submenu | checkbox | radio`. `MenuItemRole` covers a fixed 12-role union. Tests are colocated and exercise every export including the aliasing/unsubscribe cases.

So the **descriptor vocabulary** is reasonable for a v1 (separators, submenus, checkbox/radio, accelerators, roles), and the **seam plumbing** is complete and idiomatic.

## Gaps vs an authoritative native-menu library

Benchmarked against Electron's `Menu`/`MenuItem` and Tauri's menu API — the canonical references for this domain — the depth gaps are large:

- **No live menu/menu-item entity.** Everything is a one-shot template array re-submitted wholesale. There is no persistent `Menu`/`MenuItem` object you can mutate after install: no `setMenuItemEnabled`, `setMenuItemChecked`, `setMenuItemLabel`, `setMenuItemAccelerator`, `setMenuItemVisible`. Toggling a checkbox or graying an item requires rebuilding and re-setting the whole menu. This is the single biggest depth gap — real apps update menu state constantly (toggle "Pause", check the active tool, enable "Paste" when the clipboard has content).
- **Selection is by `id` only, with no payload.** `onMenuSelect` delivers a bare string id. There is no per-item `click` callback (the dominant Electron ergonomic), no checked-state in the event, no modifier/key info, no menu/window context. Radio-group and checkbox semantics (which sibling got selected, new checked value) are not surfaced.
- **`role`s are minimal and not honored on web.** 12 roles vs Electron's ~40+ (window/zoom/help/services/app-menu/recent-documents/share/speech, platform app menus, `windowMenu`/`appMenu`/`editMenu`/`viewMenu` whole-submenu roles). No standard-menu builders (e.g. a default macOS app menu, an Edit menu).
- **No `visible` field, no `icon`, no `sublabel`/`toolTip`, no `acceleratorWorksWhenHidden`, no `registerAccelerator`.** Item descriptor is missing several universally-present fields. There is no separate concept of a `before`/`after`/`beforeGroupContaining`/`id`-based positional insertion.
- **No menu menu-from-template parsing depth.** `createMenuItemTemplate` only shallow-fills the top item; submenus are not normalized/validated, accelerator strings are not parsed or validated, role↔type consistency is not checked.
- **Context menu is point-only and fire-and-forget.** No anchoring to a node/element, no `positioningItem`, no callback on close/dismiss distinct from selection, no way to know it was dismissed vs which item. No keyboard navigation contract.
- **No web rendering path at all.** The web backend is pure sentinels — `setApplicationMenu` returns false, `popupContextMenu` resolves null. A context menu is the one piece that _is_ renderable in a browser (a positioned DOM/canvas popup), and the project doc lists `menu` as "native host required to realize" but the broader SDK aims for a working web backend everywhere. Today web menus are entirely non-functional, which for context menus is a real omission rather than a true substrate limitation.
- **No accelerator/shortcut integration.** Accelerators are inert strings; nothing parses, registers, or dispatches them (this may legitimately belong to `@flighthq/shortcut`, but the seam between them is undefined).

## Naming / API-shape notes

- Naming is consistent with Flight conventions and the platform-suite command pattern: `setApplicationMenu`, `showContextMenu`, `onMenuSelect`, `get/setMenuBackend`, `createWebMenuBackend`. Full type words are used; functions are globally self-identifying.
- One mild asymmetry: the backend method is `popupContextMenu` while the public function is `showContextMenu` (`popup` vs `show`). Both are defensible, but the public verb and the backend verb diverging is worth a deliberate choice.
- `MenuItemTemplate` is correctly a `*Like`-style structural template (plain data), matching the "plain descriptors over runtime objects" philosophy — appropriate here. But the absence of _any_ live handle means the design currently forces the whole-array re-submit pattern, which fights the "update menu state" use case. An authoritative version likely needs a returned id-addressable handle or `update*ById` mutators while keeping templates as the input form.
- `MenuItemRole` is a closed union in `@flighthq/types`. The types-layout convention favors open contracts over closed unions for extensible vocabularies; roles are exactly the kind of set that grows, so this should likely be a branded string with a documented well-known set.

## Recommendation

Treat this as an intentional MVP stub, not an authoritative library, and schedule the depth build-out. Priorities, in order:

1. **Mutable menu state** — the highest-value gap. Either return id-addressable handles from `setApplicationMenu`/`showContextMenu`, or add `setMenuItemEnabled/Checked/Label/Visible/Accelerator(id, …)` mutators routed through the backend. Real apps cannot use a menu they must fully rebuild to toggle one item.
2. **Richer selection events** — carry checked-state, type, and originating menu in the `onMenuSelect` payload; consider per-item `click` ergonomics layered over the id-based core.
3. **Expand the descriptor and role set** — add `visible`, `icon`, `toolTip`/`sublabel`; broaden `MenuItemRole` toward the canonical set and make it an open contract; add standard-menu builders (default app/edit/view/window menus).
4. **A real web context-menu backend** — context menus are renderable in the browser; ship a positioned popup web backend so `showContextMenu` works without a native host. App menu bars can stay native-only.
5. **Define the accelerator seam** — parse/validate accelerator strings and document the boundary with `@flighthq/shortcut`.

The seam architecture is sound and worth keeping; the domain coverage is roughly 1/5 of an authoritative menu library and is explicitly labeled MVP in-source.
