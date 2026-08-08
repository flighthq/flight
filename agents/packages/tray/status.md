---
package: '@flighthq/tray'
updated: 2026-08-08
by: principal
---

# tray — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/tray/src/`, `packages/types/src/Tray.ts`, and both native tray hosts on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **`TrayEventType` carries seven events**, not the full native set: `balloonClick`, `balloonClose`,
  `balloonShow`, `click`, `doubleClick`, `dropFiles`, `rightClick` (`types/src/Tray.ts:8-15`). No
  `middleClick`, no `mouseDown`/`Up`/`Enter`/`Leave`/`Move`, no `dragEnter`/`dragLeave`/`drop`.
- **`TrayEventData.dropText` has no event that can carry it** (`types/src/Tray.ts:54`): `dropFiles` is
  the only drop kind in the union, so the field is unreachable by construction.
- **The rich payload is structurally unreachable on Electron.** `createElectronTrayBackend` wires only
  `click` / `right-click` / `double-click` (`host-electron/src/electronTray.ts:51-53`), and every
  emitted event hardcodes all four modifier flags to `false` with `position: null` and both drop
  fields `null` (`:24-35`). Balloons can be *displayed* but the three `balloon*` events never fire.
- **`setTrayIconTemplate` cannot work through the Electron seam.** `setTemplate` is a deliberate no-op
  (`electronTray.ts:118-121`) because template-ness lives on a `nativeImage` while this seam takes
  string icons; only `TrayIconOptions.iconTemplate` at creation has anywhere to land.
- **No theme-aware icon pairing exists.** `iconLight` / `iconDark` / `iconDelegate` appear nowhere in
  `packages/`; `TrayIconOptions` carries only `icon`, `iconTemplate`, `title`, `tooltip`
  (`types/src/Tray.ts:17-23`). Still a cross-package design question — how a tray learns about theme
  changes without importing `@flighthq/platform`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Three recorded claims are **false**. The
  loudest: "the `TrayBackend` seam is extended but `createElectronTrayBackend` has not been updated" —
  `host-electron/src/electronTray.ts` implements every method on the seam (`displayBalloon`,
  `getBounds`, `getCapabilities`, `getTitle`, `getTooltip`, `isDestroyed`, `listIds`,
  `popUpContextMenu`, `removeBalloon`, `setIcon`, `setIgnoreDoubleClickEvents`, `setPressedIcon`,
  `setTemplate`) and `electronRegister.ts:54` installs it; Tauri has a tray backend too. Also dropped:
  `getTrayIconBounds` returning `Readonly<TrayIconBounds>` (no `TrayIconBounds` type exists anywhere —
  it returns `Readonly<RectangleLike> | null`, `tray.ts:135`), and the seventeen-member `TrayEventType`
  (seven, per Open above).
- **2026-06-25** — `getTrayIconBounds` re-pointed at the backend's own return type, and
  `setTrayIgnoreDoubleClickEvents` covered through its own free function rather than the backend method.
- **2026-06-24** — Tray matured: rich `TrayEventData` payload replacing `(id, event)`, capability
  flags, balloons, bounds/title/tooltip getters, runtime icon swap, animation helper, and the
  `setTrayContextMenu` → `setTrayIconContextMenu` rename that settled the `Tray`/`TrayIcon` prefix.
