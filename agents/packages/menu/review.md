---
package: '@flighthq/menu'
status: solid
score: 70
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - packages/menu/src (live)
  - packages/menu/package.json
  - '@flighthq/types Menu.ts, MenuSignals.ts, MenuHighlight.ts, MenuSelect.ts, WellKnownMenuItemRole.ts, Host.ts'
  - packages/host-web/src/webMenu.ts
  - packages/host-electron/src/electronMenu.ts
  - platform-integration.md
---

# menu — Review

Evidence: the **live worktree** `packages/menu/src/` (source + tests), `packages/types/src/Menu.ts` /
`MenuSignals.ts` / `MenuHighlight.ts` / `MenuSelect.ts` / `WellKnownMenuItemRole.ts` / `Host.ts`,
`packages/host-web/src/webMenu.ts`, and `packages/host-electron/src/electronMenu.ts`.

**Architecture note (2026-09-02):** Since the previous review (2026-07-13, score 62), the package
completed the R18 explicit-dependency-model transition. The ambient `getMenuBackend`/`setMenuBackend`
singleton and the merged three-method `MenuBackend` interface are gone. In their place: four typed
backend interfaces on host capability slots (`MenuApplicationBackend`, `MenuPopupBackend`,
`MenuSelectBackend`, `MenuHighlightBackend`), accessed through narrow `Has*` host parameters. The web
context-menu renderer moved to `host-web/src/webMenu.ts`, where it belongs as a host backend. The
package now contains no rendering code and no ambient module state beyond the `MenuSignals` opt-in
group — a clean application of the explicit-dependency model.

## Verdict

`solid` — 70/100 (was 62 at the 2026-07-13 re-review). The architecture is now clean: four
capability-typed host slots, origin-pinned event subscriptions with full entity lifecycle, alias-safe
attempt-all teardown, and zero ambient backend state. What the package offers — menu install, context
menu popup, event delivery, template construction/clone/validation, six standard templates — is
well-implemented and well-tested. The score sits at the solid threshold rather than higher because the
same functional gaps remain: no live mutation layer (the single biggest AAA gap), no icon support, no
rich context-menu positioning, and accelerator strings are still inert data. The architecture upgrade
earns the move from partial to solid; the mutation layer and descriptor vocabulary are what stand
between 70 and 80+.

## Present capabilities (verified against live source)

### Core API (22 public exports)

Source is in two files: `menu.ts` (238 lines, 16 exports) and `menu-templates.ts` (300 lines, 6
exports), with colocated tests in `menu.test.ts` (470 lines, 38 tests) and `menu-templates.test.ts`
(163 lines, 18 tests). Exports are alphabetized within each source file; `describe` blocks mirror
export names alphabetically.

**Template construction and validation (3 functions):**
- `createMenuItemTemplate(template?)` — default-fills `type: 'normal'`, `enabled: true`; recursively
  normalizes submenu children.
- `cloneMenuTemplate(template)` — deep clone of a `MenuItemTemplate` tree.
- `validateMenuItemTemplate(template)` — returns `string | null` sentinel; validates separator
  constraints, checked-on-non-toggle rejection (catches `checked` on `normal`/`submenu` items),
  radio-group sibling exclusivity via `_validateRadioGroups`, and cyclic submenu detection (throws —
  programmer error). 10 test cases cover the validation matrix.

**Application menu (2 functions):**
- `setApplicationMenu(host, items)` — delegates to `host.menu.application.setApplicationMenu()`;
  returns `boolean`.
- `destroyMenuApplication(...hosts)` — alias-safe, attempt-all teardown. Deduplicates providers via a
  `WeakSet`, tries every pending destroy even after one throws, rethrows the first error after
  siblings complete, and retains failed providers so a subsequent call retries only the failures. 5
  test cases cover alias safety, idempotency, attempt-all, retry-only-failures, and no-destroy
  tolerance.

**Context menus (1 function):**
- `showContextMenu(host, items, x, y)` — delegates to `host.menu.popup.popup()`; emits
  `onContextMenuOpen`/`onContextMenuClose` signals when enabled. Tests verify two independent hosts
  route to their own popup and that signals fire in open/close order.

**Event entities (8 functions, two entity types):**
- `createMenuHighlight()` / `attachMenuHighlight(host, highlight)` / `detachMenuHighlight(highlight)`
  / `disposeMenuHighlight(highlight)` — `MenuHighlight` entity with `onMenuItemHighlight` signal.
  Subscription is origin-pinned via `WeakMap<MenuHighlight, () => void>`: detaching one entity never
  ends another's subscription on the same host.
- `createMenuSelect()` / `attachMenuSelect(host, select)` / `detachMenuSelect(select)` /
  `disposeMenuSelect(select)` — `MenuSelect` entity with `onMenuItemSelect` signal. Same
  origin-pinned contract. Re-attaching replaces rather than stacks subscriptions (tested). Dispose
  detaches and clears listeners (tested independently for both subscription and signal paths).

**Signals (2 functions):**
- `enableMenuSignals()` / `getMenuSignals()` — lazy-allocated `MenuSignals` group with
  `onContextMenuOpen` and `onContextMenuClose`. Package-level opt-in, not a host capability —
  the core dispatcher emits these around the popup call.

**Standard templates (6 functions):**
- `createDefaultAppMenuTemplate(appName)` / `createDefaultEditMenuTemplate()` /
  `createDefaultFileMenuTemplate()` / `createDefaultHelpMenuTemplate()` /
  `createDefaultViewMenuTemplate()` / `createDefaultWindowMenuTemplate()` — each returns a
  `MenuItemTemplate` with well-known roles from `WellKnownMenuItemRole`, standard accelerators, and
  whole-submenu roles (`appMenu`, `editMenu`, etc.) for native host substitution. 18 tests verify
  structure, ids, roles, accelerators, and `enabled` defaults.

### Type surface (`@flighthq/types`)

- `MenuItemTemplate` — 11 fields: `id`, `label`, `type`, `role`, `accelerator`, `enabled`, `checked`,
  `visible`, `sublabel`, `toolTip`, `submenu`. `visible` (defaults to shown; `false` omits entirely),
  `sublabel`, and `toolTip` were added in the 2026-07-30 sweep.
- `MenuItemType` — closed five-kind union: `'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'`.
- `MenuItemRole` — open contract: `WellKnownMenuItemRoleValue | (string & {})`.
- `WellKnownMenuItemRole` — const object with 43 documented roles (7 whole-submenu roles, platform
  support matrix in comments).
- Four backend interfaces: `MenuApplicationBackend` (with optional `destroy()`),
  `MenuHighlightBackend`, `MenuPopupBackend`, `MenuSelectBackend` — each with its own shape
  (command/subscription/request-response). Deliberately not merged.
- Four `Has*` capability interfaces in `Host.ts`: `HasMenuApplication`, `HasMenuHighlight`,
  `HasMenuPopup`, `HasMenuSelect` — narrow typed host requirements per function.
- `MenuSignals` — `onContextMenuOpen` + `onContextMenuClose` signals.
- `MenuHighlight` — entity with `onMenuItemHighlight: Signal<(id: string) => void>`.
- `MenuSelect` — entity with `onMenuItemSelect: Signal<(id: string) => void>`.

### Host backends (outside this package, verified for integration)

- **host-web** (`webMenu.ts`, 225 lines): exposes `webMenuPopupBackend` and
  `webMenuHighlightBackend`. DOM context-menu renderer with viewport clamping, separators,
  checkmark/radio-dot glyphs, accelerator column, submenu hover expansion, keyboard nav
  (ArrowUp/Down/Enter/Space/Escape), `sublabel` and `toolTip` rendering, `visible: false` omission.
  Does NOT expose `application` or `select` slots — correctly omitted (browser has no native menu
  bar), not stubbed. 154 lines of test coverage.
- **host-electron** (`electronMenu.ts`, 69 lines): `createElectronMenuBackends` returns
  `application`, `popup`, and `select` slots. `application` has `destroy()` that calls
  `Menu.setApplicationMenu(null)`. `select` wires the shared closure listener. Idempotent destroy.

### Package manifest

- Dependencies: `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types` — all `*`.
- Two export lanes: `.` (index.ts) and `./contract` (contract.ts). `index.ts` curates from
  `contract.ts`; `contract.ts` re-exports both source files.
- `"sideEffects": false` — no top-level registration or mutation. Module state is the `_menuSignals`
  lazy slot and two `WeakMap`/`WeakSet` instances, all inert until called.
- Type imports use `import type` on separate lines.

## Gaps

- **No live mutation layer — the core AAA gap.** No `MenuHandle`/`MenuItemHandle`, no
  `setMenuItemEnabled`/`Checked`/`Label`/`Visible`/`Accelerator`, no `getMenuItemById`, no
  `appendMenuItem`/`insertMenuItemBefore`/`removeMenuItemById`. `setApplicationMenu` returns
  `boolean`; every state change requires a full rebuild. Real menu bars toggle undo/redo enabled
  state, view checkboxes, and dynamic recent-files lists constantly. The seam cannot express these
  operations, so even a native host that supports them cannot expose them through the current API.
- **No `icon` field on `MenuItemTemplate`.** The descriptor has no way to express an icon; the web
  renderer draws only checkmark/radio glyphs. Native menu bars (macOS, Windows) support icons on
  every item.
- **No `showContextMenuAt` with options.** Only bare `(x, y)` positioning; no `positioningItemId`,
  `anchorElementId`, or `onClose` callback. Native APIs support richer positioning.
- **Selection payload is bare `id: string`.** `MenuSelectBackend.subscribe` and
  `MenuHighlightBackend.subscribe` both deliver a string id; there is no `MenuItemSelectEvent` with
  `checked`, `type`, or `role` context. Checkbox/radio consumers must maintain their own mapping.
- **Accelerator strings are inert data.** `MenuItemTemplate.accelerator` is a bare `string` that
  nothing parses, normalizes, or displays in a platform-correct way. The `menu` <-> `shortcut`
  dispatch boundary is undecided (charter Open direction 1). The web renderer in `host-web` renders
  the raw string (`accel.textContent = item.accelerator`), so macOS users see `CmdOrCtrl+Z` instead
  of `⌘Z`.
- **`role` is unresolved on web.** `item.role` is never read by the web renderer in `host-web`; only
  `host-electron` resolves it. A role-only item (no `label`) renders blank on web. (This is now
  host-web's concern, not the menu package's, but it affects the overall menu story.)
- **No guard layer.** No `enableMenuGuards`; `validateMenuItemTemplate` is a manual call. Silent
  sentinels (the `false` return from `setApplicationMenu`) have no shakeable `explain*` query. The
  diagnostics convention calls for guard-layer warnings for common misuse.
- **Radio-group semantics are thin.** No group id or sibling exclusivity enforcement at runtime —
  validation catches two checked radios, but nothing prevents runtime `checked` assignment that
  violates the rule. The web renderer draws whatever `checked` says.
- **No functional/visual test for the web context-menu renderer.** The web renderer in `host-web` has
  jsdom unit tests but no baseline in `tests/functional/`. This is the most visual output in the menu
  subsystem.

## Charter contradictions

The charter's "What it is" section contains three claims that do not match the live tree:
1. "mutate live menu items via opaque handles" — no handles, no mutators exist.
2. "The highest-scoring package in the UI/shell group (84/100)" — score is now 70, based on the live
   tree. (The 84 was scored against the unlanded builder bundle.)
3. "The web backend renders a ~200-line DOM context-menu renderer" — the renderer is now in
   `host-web/src/webMenu.ts` (225 lines), not in the menu package itself. The menu package contains
   no rendering code.

The charter's Decision [2026-07-02] "No sweep-safe work remaining" was reasoned from the prior
ambient-backend architecture; the R18 transition has since completed cleanly.

## Contract & docs fit

**Explicit-dependency model:** textbook implementation. Every capability function takes its host slot
as a typed parameter (`host: HasMenuApplication`, `host: HasMenuPopup`, etc.); no ambient
`get*Backend`/`set*Backend`. A host that lacks a slot omits it at the type level rather than stubbing
it. The four backend interfaces have intentionally incompatible shapes (command/subscription/
request-response), preventing the "one backend claims four operations while implementing one" problem
the old `MenuBackend` had.

**Entity lifecycle:** `MenuHighlight` and `MenuSelect` implement the standard create/attach/detach/
dispose pattern with origin-pinned subscriptions. `destroyMenuApplication` implements alias-safe,
attempt-all teardown with retry semantics. Both align with the tray package's corresponding patterns.

**Type home rule:** all types in `@flighthq/types`; the menu package exports functions only with
`import type` for all type references. No inline type definitions.

**sideEffects: false:** honored. Module-level state (`_menuSignals`, two `WeakMap`s, one `WeakSet`)
is inert until called — no registration, no listeners, no timers at import time.

**Source style:** exports alphabetized within files; describe blocks alphabetized and mirroring export
names; constructors used for entity types; `Readonly<T>` on template parameters; sentinels for
expected failures (validate returns `string | null`); throws only for cyclic-reference programmer
error.

**Missing:** no `explain*` query for `setApplicationMenu` returning `false`; no guard layer. The
`assertSyncVoid` type-level guard at the bottom of `menu.ts` (lines 234-237) is a compile-time
constraint that prevents `destroy()` from returning a Promise — a sound safeguard, but not a
user-facing diagnostic.

## Candidate open directions

1. **Re-land the mutation layer deliberately.** `MenuHandle` + mutators + structural edits. This is
   the main path from 70 to 80+, but `setApplicationMenu(): boolean -> MenuHandle | null` changes
   the `MenuApplicationBackend` seam shape and must be decided.
2. **The `menu` <-> `shortcut` accelerator-dispatch boundary** (charter Open direction 1). Whether
   a declared accelerator auto-registers through `@flighthq/shortcut`, and what prevents
   double-binding. Blocks `menu-formats` and platform-correct accelerator display.
3. **Web-backend fidelity scope** (charter Open direction 2). Production-grade (icons, RTL, theming,
   platform accelerator glyphs) vs reference fallback. Now scoped to `host-web`, not the menu
   package itself.
4. **Guard layer.** `enableMenuGuards` covering: separator with submenu, checked on non-toggle,
   role-only item without label, duplicate ids. `explainSetApplicationMenuResult` for the `false`
   sentinel.
5. **Selection payload.** `MenuItemSelectEvent { id, checked, type, role }` instead of bare
   `id: string`. Changes `MenuSelectBackend.subscribe` and `MenuHighlightBackend.subscribe`.
6. **Radio-group model.** Explicit group id with sibling exclusivity at runtime, not just validation.
7. **`icon` field and rendering.** Needs image-pipeline integration and the web-fidelity-scope
   decision.
