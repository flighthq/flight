---
package: '@flighthq/menu'
updated: 2026-07-13
basedOn: ./review.md
---

# menu — Assessment

See [charter](./charter.md) for blessed direction.

> 2026-07-13: rebuilt against the live tree. The prior "No sweep-safe items" verdict was reasoned from the unlanded builder bundle (see review.md provenance correction); the live tree does have sweep-safe work.

## Recommended

_None open._ The sweep that landed the items below found three live defects in the web renderer — see
[status](./status.md) — and left one item of genuinely open work, recorded in Backlog: keyboard
traversal into submenus.

## Approved

- [2026-07-30 · completed] jsdom unit tests for the web context-menu renderer paths (`c8595a69b`) — DOM build, keyboard nav, submenu hover expansion, viewport clamping. Exposed and fixed a real bug: initial `ArrowUp` selected the first item rather than the last.
- [2026-07-30 · completed] Fix the stale header comment in `packages/types/src/Menu.ts` (`e890fb8c7`) — now states the web backend ships a DOM context-menu renderer, and replaces the removed `setTrayContextMenu` reference with `setTrayIconContextMenu`.
- [2026-07-30 · completed] Extend `validateMenuItemTemplate` with radio/checkbox consistency checks (`2d24ed6fd`, `1033491b8`) — rejects checked state on non-checkbox/radio items and multiple checked radios in one contiguous sibling group, split into a per-item rule and a cross-sibling `_validateRadioGroups` rule.
- [2026-07-30 · completed] Add optional descriptor fields `visible`, `sublabel`, `toolTip` (`30833fedf`) — in `@flighthq/types`. `visible: false` omits the item from the DOM entirely rather than styling it away, so it cannot be reached by arrow keys or hover — the distinction from `enabled`. `sublabel` and `toolTip` render on the web backend and are advisory elsewhere. Also fixed the same-session collision between two independent ArrowUp wrap-arithmetic fixes for the `focusIndex === -1` sentinel (functionally identical; kept one).

## Backlog

- **Keyboard traversal into submenus is unimplemented, and Enter on a submenu parent resolves the popup with the parent's id.** _Parked — needs a small interaction decision, not just code._ Submenus open on hover only: there is no ArrowRight to enter one or ArrowLeft to leave it, so a submenu's items are unreachable by keyboard at all. Separately, because a submenu parent carries an id and is focusable, Enter on it currently closes the menu and reports that id as a selection, as though the user had chosen a command. The 2026-07-30 sweep fixed the related bug where collapsed submenu rows were silently included in arrow travel (they were `display:none` yet focusable), and corrected the renderer comment that claimed arrow-right expansion already existed — but implementing the traversal means deciding what Enter on a parent should do, whether focus returns to the parent row on ArrowLeft, and whether hover and keyboard can both drive the open state without fighting. That is an interaction design call rather than a defect, so it is recorded rather than guessed.
- Re-land the live-mutation layer: `MenuHandle`/`MenuItemHandle`, `setMenuItem*` mutators, structural edits, `destroyMenuHandle` — parked: changes the `setApplicationMenu` return type and the `MenuBackend` seam; needs a direction decision (the lost bundle's design is recorded in status.md).
- `showContextMenuAt(items, options)` with `MenuContextMenuOptions` (`positioningItemId`, `anchorElementId`, `onClose`) — parked: new seam method; bundle with the mutation-layer decision.
- `MenuItemSelectEvent` payload (id + checked + type) instead of bare `id` — parked: changes the `subscribeSelect` seam signature.
- `icon` field + web icon rendering — parked: needs image-pipeline integration and the web-fidelity-scope decision (charter Open direction 2).
- Accelerator string dispatch to `@flighthq/shortcut` and the `menu-formats` neighbor — parked: cross-package boundary decision (charter Open direction 1).
- Functional/visual test for the web context-menu renderer — parked: cross-boundary (`tests/functional/`), named a larger task by the charter.
- Rust `flighthq-menu` catch-up — parked: cross-repo/crate; hold until the TS seam settles the mutation-layer question.
