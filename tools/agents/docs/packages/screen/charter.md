---
package: '@flighthq/screen'
crate: flighthq-screen
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# screen — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Display/monitor enumeration and the seam for reacting to display-configuration changes. The package answers "what screens are attached, where are they, and how are they configured" — per-screen geometry (bounds, work area), scale/DPI, primary detection, orientation/rotation, color/HDR metrics, refresh rate, and display modes — plus coordinate converters, point/rect-to-screen lookups, cursor-position queries, and a change-event stream (callback and opt-in signals). It runs over a swappable `ScreenBackend`: a lazily-created web default (window/screen + matchMedia + the Window Management API for multi-monitor) that a native host replaces via `setScreenBackend`.

## Decisions

- **[2026-07-02] `getScreenNearestRect` is a TODO.** Currently a one-line alias of `getScreenContainingRect` (identical implementation). Implement actual nearest-screen logic (center-distance fallback distinct from overlap-largest). Both names are intentional — they should have distinct semantics.
- **[2026-07-02] Remove structural divider comments in test file.** Per source style rules, tests should use names and structure, not `// ---- section ----` dividers.

## Open directions

- Whether cheap web-populatable fields (`monochrome`, `dpi`, `depthPerComponent`) should be derived on the web backend or left sentinel until native.
- Late-subscribe + upgrade ordering: consumers calling `onScreenChange` before `requestScreenDetails()` miss post-upgrade events.
- Stable-id contract across hot-plug for `ScreenInfo.id`.
- `screen` vs `device` boundary for display metrics ownership.
