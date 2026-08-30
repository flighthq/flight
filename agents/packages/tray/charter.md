---
package: '@flighthq/tray'
role: package
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

System tray / menu-bar icons are async, capability-refined Entities acquired from an explicit Host.
The required `Host.tray` group has independently optional lifecycle, command, query, and
backend-emitted event facets; a returned Tray carries only the facets present at acquisition and pins
them to their exact origins. Icons and menu templates remain plain data. Native provider keys are
private, while public identity is the Entity itself.

## Decisions

- **[2026-07-02] Fix `getTrayIconBounds` return type.** Currently returns an inline shape instead of `RectangleLike` from `@flighthq/types`. Fix to use the standard geometry type. *(Done.)*

- **[2026-07-30] One tray icon has one animation, and it ends when the icon does.** `startTrayIconAnimation` started an interval and handed back a closure, and that was the whole lifecycle — so two starts on one tray left two intervals writing to the same image on the same tick (an ordinary sequence: swapping a "syncing" animation for an "error" one), and an animation outlived `destroyTrayIcon`, calling `setIcon` into a freed host resource forever while the timer kept its own closure alive. A start now replaces any animation already running on that tray, and `destroyTrayIcon` stops it. The returned closure stops only the animation it started, so a stale one cannot cancel its successor. User-directed.

- **[2026-07-30] `stopTrayIconAnimation` and `isTrayIconAnimating` exist because the docs already promised the first one.** `startTrayIconAnimation`'s own comment read "call the returned function (or `stopTrayIconAnimation`) to cancel" — naming a function that was never written, the same shape of defect as the loader's "tracking shim" comment for a shim that did not exist. Building it was honoring a documented contract rather than adding API: the stop closure is what gets dropped, the `TrayIcon` handle is what gets passed around, so a caller holding the handle had no way to stop an animation. `isTrayIconAnimating` completes the trio as the `is*` query. User-directed.

- **[2026-08-30] Tray is an explicit, origin-pinned Entity rather than an ambient aggregate backend.**
  Native acquisition completes before publication; public numeric ids and the ambient getter/setter,
  sentinel, capability-boolean, observer, and no-op families are deleted. Animation and menu writes are
  generation checked, selections belong to one Tray, releases are once-guarded, and teardown attempts
  all still-owned resources while retaining failures for retry. User-directed.

- **[2026-08-30] Provider coverage is Host × injected OS profile.** Web and Capacitor expose the
  required empty group. Electron and Tauri constructors receive `DesktopOsProfile` and expose only
  real slots for that pair; no constructor or operation reaches `process.platform`. User-directed.

## Open directions

1. **Additional native pointer events.** Middle-button, mouse enter/leave/move/down/up, drag-enter/leave,
   and Tauri-only button-state detail remain deferred new features rather than promises implemented as
   no-ops.
2. **Theme-aware icon pairing.** Light/dark icon selection remains a cross-domain design question; Tray
   does not acquire a platform dependency or probe theme state.
