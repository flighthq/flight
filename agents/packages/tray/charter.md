---
package: '@flighthq/tray'
crate: flighthq-tray
draft: false
lastDirection: 2026-07-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tray — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

System tray / menu-bar icon — a persistent OS notification-area icon with an icon image, tooltip/title, a context menu (reusing `MenuItemTemplate` from `@flighthq/menu`), and click/double-click events, behind a swappable `TrayBackend`. The reference libraries are Electron `Tray`, Tauri `TrayIcon`, and NW.js `Tray`. The package follows the suite's command-capability shape (`getTrayBackend` / `setTrayBackend` / `createWebTrayBackend`) with an event surface for tray interactions.

## Decisions

- **[2026-07-02] Fix `getTrayIconBounds` return type.** Currently returns an inline shape instead of `RectangleLike` from `@flighthq/types`. Fix to use the standard geometry type. *(Done.)*

- **[2026-07-30] One tray icon has one animation, and it ends when the icon does.** `startTrayIconAnimation` started an interval and handed back a closure, and that was the whole lifecycle — so two starts on one tray left two intervals writing to the same image on the same tick (an ordinary sequence: swapping a "syncing" animation for an "error" one), and an animation outlived `destroyTrayIcon`, calling `setIcon` into a freed host resource forever while the timer kept its own closure alive. A start now replaces any animation already running on that tray, and `destroyTrayIcon` stops it. The returned closure stops only the animation it started, so a stale one cannot cancel its successor. User-directed.

- **[2026-07-30] `stopTrayIconAnimation` and `isTrayIconAnimating` exist because the docs already promised the first one.** `startTrayIconAnimation`'s own comment read "call the returned function (or `stopTrayIconAnimation`) to cancel" — naming a function that was never written, the same shape of defect as the loader's "tracking shim" comment for a shim that did not exist. Building it was honoring a documented contract rather than adding API: the stop closure is what gets dropped, the `TrayIcon` handle is what gets passed around, so a caller holding the handle had no way to stop an animation. `isTrayIconAnimating` completes the trio as the `is*` query. User-directed.

## Open directions

1. **Web-backend fidelity.** How far should the web tray backend go — is it a sentinel-only stub, or should it render a visible tray-like affordance in the DOM?
2. **Multi-tray support.** Whether the API supports multiple simultaneous tray icons (Electron allows this) or is scoped to a single tray entity.
