---
package: '@flighthq/menu'
crate: flighthq-menu
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# menu — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Native application-menu and context-menu capability: build menu/menu-item templates, install the application menu bar, pop up context menus, mutate live menu items via opaque handles, and deliver selection events — over a swappable `MenuBackend`. The highest-scoring package in the UI/shell group (84/100). The `MenuItemTemplate` descriptor is the single shared data model for the menu bar, context menus, the tray context menu (`@flighthq/tray`), and the app/dock menu (`@flighthq/app`). The web backend renders a ~200-line DOM context-menu renderer. Accelerator strings are declared on menu items but turning them into live OS hotkeys is the `menu` <-> `shortcut` boundary (undecided).

## Decisions

- **[2026-07-02] No sweep-safe work remaining.** The two largest gaps — a functional test for the web context-menu renderer and accelerator dispatch wiring to `@flighthq/shortcut` — are both larger tasks that require direction decisions before implementation.

## Open directions

1. **The `menu` <-> `shortcut` accelerator-dispatch boundary.** Who turns a `MenuItemTemplate.accelerator` into a live OS hotkey? Does `menu` auto-register with `shortcut`, or only declare the string? How is double-binding prevented?
2. **Web-backend fidelity scope.** Is the DOM context menu meant to be production-grade (icons, RTL, theming, platform accelerator glyphs), or a reference fallback with a native host expected for anything richer?
3. **Functional test for the web context-menu renderer.** The most code and the only real visual output in the package has no `tests/functional/menu-*` baseline. A larger task, not a sweep item.
