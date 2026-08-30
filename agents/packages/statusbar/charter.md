---
package: '@flighthq/statusbar'
role: package
crate: flighthq-statusbar
draft: false
lastDirection: 2026-07-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# statusbar — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Mobile status-bar control -- foreground style (`light`/`dark`/`default`), visibility (with `fade`/`slide`/`none` animation), background color (packed `0xRRGGBBAA`), and content-overlay behavior. Includes a read side (`getStatusBarInfo` / `getStatusBarHeight`), a `StatusBar` event entity (`onChange`), and a restorable style stack (`pushStatusBarStyleEntry` / `popStatusBarStyleEntry` / `hasStatusBarStyleEntry` / `clearStatusBarStyleStack`). Each operation takes the narrow explicit Host trait it needs. Web publishes only `ui.statusBarColor` through `webStatusBarColorBackend`; Capacitor publishes the five real command/query slots and omits change events. Style-stack state is keyed by the explicit Host and pins the exact providers captured at first push; event attachment likewise pins its subscribe and snapshot origins. Safe-area / layout insets are owned by `@flighthq/device`, not here.

## Decisions

- **[2026-07-02 · completed] Remove the no-op `enableStatusBarSignals` marker.** It was removed in `f829dccc8`; signal allocation is explicit in `createStatusBar`, and host subscription cost begins only at `attachStatusBar`.
- **[2026-08-30 · completed] Replace the aggregate ambient backend with narrow explicit Host slots.** Color, info, overlays, style, visibility, and change coverage are independent; host-Web never claims a native status bar merely because it can write theme color.

## Open directions

- Height vs. `@flighthq/device` safe-area top inset boundary on notched/island devices.
- Native read/change truth: the Capacitor plugin exposes asynchronous snapshots but no status-bar change event, while the shared backend read and subscription seams are synchronous.
- Arbitration between direct setter calls and an active style stack.
