---
package: '@flighthq/tray'
updated: 2026-08-30
by: builder4
---

# tray — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.

## Open

- Additional pointer/drag/Tauri-only event detail is deferred new scope. The shipped event ownership is
  exactly interaction, per-Tray menu selection, balloon lifecycle, and drops where a provider emits it.
- Theme-aware light/dark icon pairing remains deferred; icon inputs are plain path/data-URI strings and
  Tray has no image, platform, notification, shortcut, or menu implementation dependency.
- The historical `review.md` and `assessment.md` are preserved unchanged as records of their evaluated
  floors. They describe the retired aggregate design and must not be read as the live API.

## Live model

`Host.tray` is required and contains 15 independently optional slots: `lifecycle`, `image`, `title`,
`tooltip`, `menu`, `templateImage`, `bounds`, `popupMenu`, `doubleClickPolicy`, `pressedImage`,
`balloon`, `interactionEvents`, `menuSelectionEvents`, `balloonEvents`, and `dropEvents`.

Coverage is Host × injected profile:

| Host/profile | Concrete slots |
| --- | --- |
| Web, Capacitor | none (required empty group) |
| Electron/Linux | lifecycle, image, tooltip, menu, bounds, popupMenu, interactionEvents, menuSelectionEvents |
| Electron/macOS | Electron/Linux + title, templateImage, doubleClickPolicy, pressedImage, dropEvents |
| Electron/Windows | Electron/Linux + balloon, balloonEvents |
| Tauri/Linux | lifecycle, image, title, menu, menuSelectionEvents |
| Tauri/macOS | lifecycle, image, title, tooltip, menu, templateImage, interactionEvents, menuSelectionEvents |
| Tauri/Windows | lifecycle, image, tooltip, menu, interactionEvents, menuSelectionEvents |

Creation awaits native acquisition and returns a capability-refined Entity with no public id. Operations
use captured facet values, animation is Entity-keyed and origin-pinned, menus are generation checked,
and provider registries preserve acquisition order. Destroy invalidates pending work, stops animation,
releases subscriptions/menu/native resources attempt-all, retains only failed steps, and is idempotent
after success. Method-tight outcomes use structural absence instead of `unsupported`; releases report
`released`, `already-released`, or `release-failed`.

## Log

- **2026-08-30** — Replaced the aggregate ambient backend with the ratified explicit dependency model;
  added profile-honest Electron/Tauri facets, empty Web/Capacitor groups, transactional lifecycle tests,
  structural deletion guards, host-probe/runner migrations, and origin-pinned teardown/animation.
- **2026-08-08** — Historical status captured the former aggregate backend's fidelity gaps.
