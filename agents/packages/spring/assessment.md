---
package: '@flighthq/spring'
updated: 2026-07-13
basedOn: ./review.md
---

# spring — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe, within-package, no design fork:

1. **`addSpringImpulse(spring, velocity)`** (+ 2D/3D componentwise mirrors) — the North star names impulse among the required controls and charter Open direction 1 already fixes the signature; the implementation is a velocity addition. Additive, non-breaking, closes the one named North-star hole.
2. **Numerical edge tests** — pin the integrator at the boundaries: ζ exactly 0 (energy of the undamped oscillation preserved by the closed form), ζ exactly 1 and just inside/outside `CRITICAL_BAND`, a stiff spring at a giant `deltaTime` (lands on target with ~0 velocity, no NaN/Infinity), and equivalence of one large step vs many small steps (the analytic-exactness property).
3. **`isSpringSettled` + undamped interaction test/doc** — a test documenting that a ζ=0 spring never settles, so the behavior is pinned rather than discovered by consumers.

## Backlog

Parked, with why:

- **Angle spring (shortest-path, ±π wrap)** — charter Open direction 3; the value-agnostic-core boundary means the wrap policy (separate `updateAngleSpring` vs a wrapping option) deserves a quick ruling first.
- **Spring presets (gentle/wobbly/stiff/slow)** — charter Open direction 2; a vocabulary/naming decision.
- **Target-velocity term in `updateSpring`** — textbook fix for moving-target tracking lag, but it changes the canonical step signature that 2D/3D and future consumers mirror; surface to charter Open directions.
- **`estimateSpringSettleTime` query** — scope question (is duration estimation this package's business?); surface to charter Open directions.

## Approved

None.
