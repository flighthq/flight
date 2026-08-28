---
package: "@flighthq/gizmo"
updated: 2026-08-27
by: builder5
---

# gizmo — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.

## Open

- None.

## Log

- 2026-08-27 — Completed the exact setter-driven generic 2D API, fixed semantic overlay handles,
  bounds/origin/rotation feature seam, transform brackets and degree-only deltas, snapping, pivots,
  multi-selection outline, local/world behavior, Shift-uniform scaling, and lifecycle cleanup.
- 2026-08-27 — Verified 36 tests, every source branch exercised, all 10 package check gates, package
  build, API/package manifests, and portable subset; feature-only bundle is exactly 5,035 bytes with
  `GizmoTranslateXHandle`, `appendShapeCircle`, `@flighthq/interaction`, and `@flighthq/selection`
  absent.
- 2026-08-27 — Began the standalone generic 2D transform-gizmo package after GUI landed and the
  workspace rebased to a zero-ahead seed.
