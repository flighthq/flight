---
package: '@flighthq/screen'
updated: 2026-08-08
by: principal
---

# screen — Status

Screen R3 landed 2026-08-29: explicit Host witnesses, a stable four-slot top-level group, Entity-backed values/providers/events, Web implementation ownership in host-web, split Electron query/change facets, and deletion of all ambient/diagnostic/modes/refresh/direct-subscription surfaces.

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/screen/src/` on 2026-08-08. A file:line here is a claim
about this tree, not about a session.

- **A `subscribe` taken before `requestScreenDetails` never sees `screenschange`.** The web backend
  captures `const detailsRef = _screenDetails` at subscription time (`screen.ts:331`), so a later
  `_upgrade` (`screen.ts:138`) leaves an existing subscriber on `resize` / `orientationchange` only.
  Either re-arm on upgrade or read `_screenDetails` inside the handler; today the ordering constraint
  is undocumented in the API.
- **`ScreenInfo.id` is an array index, not a reconfiguration-stable id.** `0` on the single-screen
  path (`screen.ts:189`) and the `ScreenDetails.screens` index after upgrade (`screen.ts:145`). Unplug
  and re-attach a monitor and the id can move; the multi-screen `subscribe` diff keys added/removed
  screens on that same id (`screen.ts:289`, `:296`), so it inherits the instability.
- **Cursor tracking installs a `pointermove` listener that is never removed.**
  `ensureCursorTracking` (`screen.ts:128-135`) latches `_cursorTracking` and adds a window listener
  with no stored handle and no `removeEventListener` anywhere in the package — the first
  `getScreenCursorPosition` call arms it for the page's lifetime.
- **No display-mode enumeration exists on any backend.** `getScreenModes` falls back to a single
  synthetic mode derived from the current `ScreenInfo` (`screen.ts:549-553`), the web backend's own
  `getModes` does the same (`screen.ts:348`), and no `getScreenNativeMode` exists anywhere in
  `packages/`. The `ScreenMode` type seam is ready; a real payload needs a native backend.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped as **false**: "the web backend
  tracks `pointermove` … which reports CSS pixels in the viewport (not virtual-desktop coordinates)"
  — the handler reads `e.screenX` / `e.screenY` (`screen.ts:132-133`), which are screen-origin, not
  viewport, coordinates. Also dropped the entire Rust-parity block (`flighthq-screen`,
  `flighthq-host-winit`, "compilation not verified") — there is no `crates/` directory in this repo,
  so none of it is checkable here.
- **2026-06-25** — `onScreenDetailPermissionChange` added (`screen.ts:679`), a change-watch over the
  `window-management` permission; closes the one-shot-polling gap.
- **2026-06-24** — Screen Details API multi-monitor path: `requestScreenDetails` upgrades the live web
  backend in place via an internal `_upgrade` hook; `getScreens` / `getPrimaryScreen` / `subscribe`
  all enumerate from `ScreenDetails.screens`.
- **2026-06-24** — `ScreenInfo` widened to 25 fields with explicit sentinels, plus `ScreenMode`,
  `ScreenChangeEvent`, `ScreenChangedMetrics`, and the `ScreenSignals` group.
