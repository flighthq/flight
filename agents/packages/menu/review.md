---
package: '@flighthq/menu'
status: partial
score: 62
updated: 2026-07-13
ingested:
  - status.md
  - packages/menu/src (live)
  - '@flighthq/types Menu.ts, MenuSignals.ts, WellKnownMenuItemRole.ts'
  - host-electron/src/electronMenu.ts
---

# menu — Review

Evidence: the **live worktree** `packages/menu/src/` (source + tests), `packages/types/src/Menu.ts` / `MenuSignals.ts` / `WellKnownMenuItemRole.ts`, and `packages/host-electron/src/electronMenu.ts`.

**Provenance correction (2026-07-13 re-review):** the 2026-06-24 review scored the incoming bundle `builder-67dc46d64`, not the live tree. Part of that bundle's surface was later restored by `06a0c480 feat: recover lost source across packages` — the web context-menu renderer, `MenuSignals`, the six template builders, `WellKnownMenuItemRole`, `cloneMenuTemplate`, and `validateMenuItemTemplate` are all live — but the bundle's handle/mutator layer **never landed**: there is no `MenuHandle`/`MenuItemHandle`, no live mutators, no structural edits, no `showContextMenuAt`, no per-item `onSelect`, and `setApplicationMenu` returns `boolean`, not a handle. The prior 84 scored code that does not exist; this review re-scores the live tree.

## Verdict

`partial` — 62/100 (was 84, scored against the unlanded bundle). What exists is well-made: a clean three-method `MenuBackend` seam, a plain-data descriptor with an open role contract (43 well-known roles), template construction/clone/validation, an opt-in four-signal group, six standard menu builders, and a genuine DOM context-menu renderer with keyboard nav and hover submenus. But against the AAA rubric — the full native menu vocabulary — the package is missing table-stakes capabilities: **no post-install mutation** (enable/disable, check/uncheck, relabel require a full `setApplicationMenu` rebuild, and the API returns no handle to mutate through), and the descriptor lacks `visible`, `icon`, `sublabel`, `toolTip`, and positional-insertion hints. The seam as shaped today cannot let a native host expose live menu-item state, which real menu bars require. Web fidelity is decent; native fidelity is capped by the seam. That is a partial, not a solid.

## Present capabilities (verified against live source)

- **Backend seam.** `MenuBackend` (types/`Menu.ts`) with exactly three methods: `setApplicationMenu(items): boolean`, `popupContextMenu(items, x, y): Promise<string | null>`, `subscribeSelect(listener): () => void`. `getMenuBackend` lazily installs `createWebMenuBackend()`; `setMenuBackend(backend | null)` swaps or reverts. Matches the platform-suite command shape.
- **Descriptor model.** `MenuItemTemplate` carries `id`, `label`, `type`, `role`, `accelerator`, `enabled`, `checked`, recursive `submenu` — eight fields, no more. `MenuItemType` is the closed five-kind union; `MenuItemRole` is the open `WellKnownMenuItemRoleValue | (string & {})` contract with 43 documented roles in `WellKnownMenuItemRole` (Electron-parity set including whole-submenu roles).
- **Construction/clone/validate.** `createMenuItemTemplate` (default-fills `type: 'normal'`, `enabled: true`, recurses into submenus), `cloneMenuTemplate` (deep clone), `validateMenuItemTemplate` (`string | null` sentinel; throws only on a cyclic submenu reference — the programmer-error carve-out).
- **Context menus.** `showContextMenu(items, x, y)` resolves the clicked id or `null`; emits `onContextMenuOpen`/`onContextMenuClose` when signals are enabled.
- **Signals.** `enableMenuSignals()`/`getMenuSignals()` (lazy, shared): `onContextMenuOpen`, `onContextMenuClose`, `onMenuItemHighlight`, `onMenuItemSelect`. `onMenuSelect(listener)` subscribes via the backend and fans out to `onMenuItemSelect`.
- **Web context-menu renderer** (`showWebContextMenu`/`buildWebMenuElement`, ~180 lines): viewport clamping, separators, checkmark/radio-dot, accelerator column, submenu `▶` + hover expansion, keyboard nav (ArrowUp/Down, Enter/Space, Escape), `onMenuItemHighlight` on hover and keyboard focus, overlay outside-click dismiss. `setApplicationMenu` on web returns `false` (no native menu bar) and `subscribeSelect` is a no-op — correct sentinels.
- **Standard builders** (`menu-templates.ts`): App/Edit/File/Help/View/Window templates with roles and accelerators.
- **Electron backend** (`electronMenu.ts`): implements the three-method seam — builds `electron.Menu` from templates, wires a single select listener, pops context menus. It does *not* implement structural edits or mutators, because the seam has none.
- **Tests.** 33 (`menu.test.ts` 15, `menu-templates.test.ts` 18); `describe` blocks alphabetized and mirroring the 11 + 6 exports. Coverage is per-export but shallow on the DOM renderer (jsdom exercises little of the build/keyboard path).

## Gaps

- **No live mutation layer — the biggest AAA gap.** No `MenuHandle`/`MenuItemHandle`, no `setMenuItemEnabled`/`Checked`/`Label`/`Visible`/`Accelerator`, no `getMenuItemById`, no `appendMenuItem`/`insertMenuItemBefore`/`removeMenuItemById`, no `destroyMenuHandle`. `setApplicationMenu` returns `boolean`, so there is nothing to mutate through; every state change is a full rebuild. Real applications toggle enabled/checked constantly (undo/redo availability, view toggles). This layer existed in the lost bundle and its design notes survive in status.md.
- **Descriptor vocabulary incomplete.** No `visible`, `icon`, `sublabel`, `toolTip`, `before`/`after` positional hints, `registerAccelerator`, or per-item `onSelect`. Native menus (macOS/Windows/Electron) all support hide-without-remove and icons; the seam cannot express them.
- **No `showContextMenuAt`/`MenuContextMenuOptions`.** No positioning-item, anchor-element, or `onClose` options; only bare `(x, y)`.
- **No `MenuItemSelectEvent` payload.** Selection delivers a bare `id: string`; checked-state and item-type context are unavailable to listeners (matters for checkbox/radio items).
- **Accelerator semantics inert and undesigned.** Stored strings; no parse/normalize/platform-display transform. The `menu`↔`shortcut` dispatch boundary is undecided (charter Open direction 1) and correctly blocks the `menu-formats` neighbor.
- **Radio-group semantics thin.** `checked` per item; no group id or sibling exclusivity — and the web renderer will happily show two checked radios.
- **No functional/visual test** for the web renderer, and the jsdom unit tests barely reach the DOM build/keyboard-nav code.
- **Rust crate divergence.** `crates/flighthq-menu` remains a thin stub behind even the live TS surface; with the mutation layer unlanded, the seam disagreement (`bool` return) currently *matches* the TS `boolean` — the divergence would reopen if the handle layer lands.

## Charter contradictions

One, introduced by the provenance issue: the charter's "What it is" says "mutate live menu items via opaque handles" and "The highest-scoring package in the UI/shell group (84/100)" — **neither is true of the live tree** (no handles, no mutators; score now 62). The charter's Decision [2026-07-02] "No sweep-safe work remaining" was reasoned from the bundle state; the live tree does have sweep-safe work (see assessment). Charter is not touched by this pass; flagging for the next direction session.

## Contract & docs fit

What exists fits the contract well: types in `@flighthq/types` (`import type` only), sentinels-not-throws with the single cyclic-reference programmer-error throw, `sideEffects: false` with null-initialized module state, alphabetized exports, single root entry, deps limited to `signals` + `types`.

**Doc drift:** `types/Menu.ts`'s header comment still says "a real web context-menu renderer is out of scope for the MVP" — false; the renderer exists in `menu.ts`. A source-comment fix for whoever next touches the package (not this review's file scope).

## Structural-fork fit

- **Fork D (runtime backend seam):** textbook — `MenuBackend` + `get*/set*Backend` + lazy web default.
- **Fork B:** `MenuItemRole` open contract with documented well-known set is exactly right; `MenuItemType` closed five-member union is the acceptable fixed-taxonomy case.
- **Subject triad:** `menu-formats` (accelerator chords) correctly withheld pending the shortcut-boundary decision.

## Candidate open directions

1. **Re-land the mutation layer deliberately.** The lost bundle's `MenuHandle` + mutators + structural edits design (recorded in status.md) is the main path from partial to solid — but `setApplicationMenu(): boolean → MenuHandle | null` is a seam-breaking decision that must be blessed, not swept in.
2. **The `menu`↔`shortcut` accelerator-dispatch boundary** (already a charter Open direction).
3. **Web-backend fidelity scope** — production-grade (icons, RTL, theming, platform accelerator glyphs) vs reference fallback (already a charter Open direction).
4. **Radio-group model** — explicit group id with sibling exclusivity vs per-item `checked`.
5. **Selection payload** — bare `id` vs a `MenuItemSelectEvent { id, checked, type }` for checkbox/radio consumers.
