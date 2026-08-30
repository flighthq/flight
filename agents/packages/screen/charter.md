---
package: '@flighthq/screen'
role: package
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

Display/monitor enumeration over an explicit Host witness. `Host.screen` is a non-optional group with optional `query`, `change`, `details`, and `permissionChange` slots. The package owns pure geometry/current-mode helpers plus Entity-backed Screen values and event groups; web providers live in `@flighthq/host-web`, Electron supplies split query/change facets, and no ambient resolver or installer remains.

## Decisions

- **[2026-07-02] `getScreenNearestRect` is a TODO.** Currently a one-line alias of `getScreenContainingRect` (identical implementation). Implement actual nearest-screen logic (center-distance fallback distinct from overlap-largest). Both names are intentional — they should have distinct semantics.
- **[2026-07-02] Remove structural divider comments in test file.** Per source style rules, tests should use names and structure, not `// ---- section ----` dividers.

## Open directions

- Whether cheap web-populatable fields (`monochrome`, `dpi`, `depthPerComponent`) should be derived on the web backend or left sentinel until native.
- Stable-id contract across hot-plug for `ScreenInfo.id`.
- `screen` vs `device` boundary for display metrics ownership.
