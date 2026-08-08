---
package: '@flighthq/menu'
updated: 2026-08-08
by: principal
---

# menu — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/menu/src/` (and `packages/types/src/Menu.ts`) on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **Submenus are hover-only; the keyboard cannot enter one.** `onKeyDown` handles Escape / ArrowUp /
  ArrowDown / Enter / Space and nothing else (`menu.ts:240-260`), the child `<ul>` opens on
  `mouseenter` (`menu.ts:354-366`), and Enter on a submenu parent resolves the popup with the
  *parent's* id. Fixing it is interaction design, not a patch: what Enter on a parent means, how
  ArrowLeft returns, and how hover and keyboard share the open state all have to be decided together.
  The constraint is stated at `menu.ts:179-184`.
- **The web renderer ignores `role` entirely.** `item.role` is never read in `menu.ts`; only
  `host-electron` resolves it (`electronMenu.ts:51`). So a role-only item (no `label`) renders blank
  on web, and none of the 37 `WellKnownMenuItemRole` values carry behavior or a default label there.
- **Accelerators render as the raw declared string.** `accel.textContent = item.accelerator`
  (`menu.ts:334`) — no platform-correct display, so a macOS user sees `CommandOrControl+K` rather
  than `⌘K`. `@flighthq/shortcut` already exports `formatAcceleratorForDisplay`, and neither `menu`
  nor `tray` depends on it; the dependency direction (menu → shortcut) is the open call.
- **The accelerator seam itself is undecided.** `MenuItemTemplate.accelerator` is a bare `string`
  (`Menu.ts:24`) that nothing parses, and no `@flighthq/menu-formats` package exists. Whether a
  declared accelerator auto-registers through `@flighthq/shortcut`, and what prevents double-binding
  when the app also registers the chord itself, is a cross-package ruling.
- **No icon support.** `MenuItemTemplate` has no `icon` field (`Menu.ts:19-35`), so the renderer has
  nothing to draw beyond the checkmark/radio glyph at `menu.ts:308-312`.
- **No RTL or theming hooks.** Every rule is a hardcoded inline `cssText` string (`menu.ts:269`,
  `:291`, `:299`) with literal colors and left-anchored padding.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: the tray/app/dock
  "shared menu descriptor … affects three packages and needs coordination" — the descriptor is
  already shared, consumed by `tray.ts:209` (`setTrayIconContextMenu`) and `app.ts:424`
  (`setAppDockMenu`), with `Menu.ts:5-9` recording it as the ruling. Also dropped the 27-export
  builder inventory (handles, live mutators, structural edits, `showContextMenuAt`): `menu.ts`
  exports 11 functions, `setApplicationMenu` returns `boolean`, and `MenuBackend` has three methods
  (`Menu.ts:42-46`) — so the incremental-diffing item it implied has no target.
- **2026-07-30** — Web renderer defects fixed: collapsed-submenu rows are no longer focusable, first
  ArrowUp lands on the last row, and the renderer comment now matches what `onKeyDown` handles.
  `visible: false` omits the item from the DOM; validator gained `checked`-on-non-toggle and
  one-checked-per-radio-run rules.
- **2026-06-25** — Recorded that the live source is the MVP seam, not the richer state the previous
  entry claimed; recommended re-reviewing against the worktree before trusting the Recommended list.
- **2026-06-24** — `MenuItemRole` opened to `WellKnownMenuItemRoleValue | (string & {})` with the
  37-entry well-known set in `packages/types/src/WellKnownMenuItemRole.ts`.
