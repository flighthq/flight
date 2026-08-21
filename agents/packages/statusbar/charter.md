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

Mobile status-bar control -- foreground style (`light`/`dark`/`default`), visibility (with `fade`/`slide`/`none` animation), background color (packed `0xRRGGBBAA`), and content-overlay behavior. Includes a read side (`getStatusBarInfo` / `getStatusBarHeight`), a `StatusBar` event entity (`onChange`), and a restorable style stack (`pushStatusBarStyleEntry` / `popStatusBarStyleEntry` / `hasStatusBarStyleEntry` / `clearStatusBarStyleStack`). All over a swappable `StatusBarBackend` seam; the web implementation (where only `setBackgroundColor` is observable via a `<meta name="theme-color">` hint) is installed explicitly via `enableHostWebStatusBar()` from `@flighthq/host-web`; resolution is custom (`setStatusBarBackend`) > host > sentinel, order-independent. Safe-area / layout insets are owned by `@flighthq/device`, not here.

## Decisions

- **[2026-07-02 · completed] Remove the no-op `enableStatusBarSignals` marker.** It was removed in `f829dccc8`; signal allocation is explicit in `createStatusBar`, and host subscription cost begins only at `attachStatusBar`.

## Open directions

- Height vs. `@flighthq/device` safe-area top inset boundary on notched/island devices.
- Native read/change truth: the Capacitor plugin exposes asynchronous snapshots but no status-bar change event, while the shared backend read and subscription seams are synchronous.
- Style-stack ownership across backend replacement and direct setter calls while entries are active; the process-global stack is correct for one OS bar, but arbitration needs an explicit contract.
- Whether the baseline should be re-read when a native backend is installed *while* the stack is non-empty. Today `setStatusBarBackend` does not touch the baseline, so a mid-stack backend swap restores to the previous backend's remembered state. Swapping backends mid-stack is not a case any host is known to hit, and guessing at it would add state nobody exercises.
