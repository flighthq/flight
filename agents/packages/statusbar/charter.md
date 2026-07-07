---
package: '@flighthq/statusbar'
crate: flighthq-statusbar
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# statusbar — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Mobile status-bar control -- foreground style (`light`/`dark`/`default`), visibility (with `fade`/`slide`/`none` animation), background color (packed `0xRRGGBBAA`), and content-overlay behavior. Includes a read side (`getStatusBarInfo` / `getStatusBarHeight`), a `StatusBar` event entity (`onChange`), and a style stack (`pushStatusBarStyleEntry` / `popStatusBarStyleEntry`). All over a swappable `StatusBarBackend` seam: a lazily-created web default (where only `setBackgroundColor` is observable via a `<meta name="theme-color">` hint) that a native host replaces with `setStatusBarBackend`. Safe-area / layout insets are owned by `@flighthq/device`, not here.

## Decisions

- **[2026-07-02] `enableStatusBarSignals` must gate real cost or be removed.** The current implementation is a pure no-op marker. Either make it actually gate signal allocation (deferred creation of the `onChange` signal until `enableStatusBarSignals` is called), or remove it if signals are always needed and the gate adds no value.

## Open directions

- Whether every event capability in the suite should carry the `enable*Signals` marker for symmetry, or only packages where the gate saves measurable cost.
- Height vs. `@flighthq/device` safe-area top inset boundary on notched/island devices.
- Style-stack ownership: the process-global module-level stack is correct (one OS bar = one stack), but whether `clearStatusBarStyleStack()` and `hasStatusBarStyleEntry(handle)` should round out the API.
