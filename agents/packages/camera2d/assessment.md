---
package: '@flighthq/camera2d'
updated: 2026-07-13
basedOn: ./review.md
---

# camera2d — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe, within-package, no design fork:

1. **`enableCamera2DGuards` guard module** — warn (via `@flighthq/log`) on `zoom <= 0`, non-positive viewport dimensions, and negative `smoothTime`, which today silently degenerate to a non-invertible view matrix / NaN unprojects. Pure diagnostics-inversion work; costs production bundles nothing.
2. **Follow look-ahead option** — additive `Camera2DFollowOptions` fields (target velocity lead in world units) applied before the deadzone stage in `updateCamera2DFollow`. Non-breaking, canonical camera behavior, stays inside the existing follow function.
3. **Test deepening** — assert the rotation over-cover property of `getCamera2DVisibleBounds`; a zoom-at-point invariant test (the pinned world point projects to the same screen point across arbitrary zoom/rotation states); follow-clamp behavior when `worldBounds` is smaller than the view on one axis only.

## Backlog

Parked, with why:

- **Camera shake / impulse** — charter Open direction 1; the composition shape (stateful shake entity vs pure offset helper) is an undecided design fork. Needs direction before building.
- **Smoothed zoom + rotation follow** — charter Open direction 3; explicitly gestured-at but not yet blessed.
- **Split-screen / multi-camera viewport offset** — charter Open direction 2; the viewport-offset convention wants a ruling before the view matrix grows an origin.
- **Multi-target framing helper** (fit N points with margin → position + zoom) — new API family beyond the charted North star; surface to the charter as a candidate open direction.
- **View-aligned deadzone under rotation** — would change documented behavior of `updateCamera2DFollow`; a semantics decision, not a sweep.

## Approved

None.
