---
package: '@flighthq/tray'
crate: flighthq-tray
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tray — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

System tray / menu-bar icon — a persistent OS notification-area icon with an icon image, tooltip/title, a context menu (reusing `MenuItemTemplate` from `@flighthq/menu`), and click/double-click events, behind a swappable `TrayBackend`. The reference libraries are Electron `Tray`, Tauri `TrayIcon`, and NW.js `Tray`. The package follows the suite's command-capability shape (`getTrayBackend` / `setTrayBackend` / `createWebTrayBackend`) with an event surface for tray interactions.

## Decisions

- **[2026-07-02] Fix `getTrayIconBounds` return type.** Currently returns an inline shape instead of `RectangleLike` from `@flighthq/types`. Fix to use the standard geometry type.

## Open directions

1. **Web-backend fidelity.** How far should the web tray backend go — is it a sentinel-only stub, or should it render a visible tray-like affordance in the DOM?
2. **Multi-tray support.** Whether the API supports multiple simultaneous tray icons (Electron allows this) or is scoped to a single tray entity.
