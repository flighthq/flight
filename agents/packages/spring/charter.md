---
package: '@flighthq/spring'
crate: flighthq-spring
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# spring — Charter

## What it is

`@flighthq/spring` is the **spring-physics animation cell** — a value that chases a moving target with natural damped-harmonic motion (accelerate, overshoot, settle), driven by a per-frame `deltaTime` step rather than a fixed duration. It is the duration-less, interruptible complement to `@flighthq/tween` (fixed-duration interpolation) and `@flighthq/easing` (fixed-shape curves): a spring has no end time, its target can change mid-flight, and it resolves when it settles.

## North star

The complete spring toolkit: 1D scalar springs and componentwise 2D/3D vector springs; configuration by the designer-intuitive **frequency + damping-ratio** (and a physical stiffness/damping/mass constructor); a numerically **stable semi-implicit / analytic step** that behaves the same at any frame rate or dt spike; settle detection (near target + near-zero velocity); and impulse/retarget/reset controls — everything a UI or game needs for springy motion, as plain-data state + small `out`-param functions.

## Boundaries

- **Depends on `@flighthq/math` (clamp/approx) + `@flighthq/types`.** No display, no scene graph, no renderer.
- **Dynamics, not interpolation.** A spring is second-order (carries velocity, can overshoot); it is not a normalized 0→1 curve. `@flighthq/easing` owns fixed-shape curves, `@flighthq/tween` owns fixed-duration interpolation, `@flighthq/math`'s `damp` is first-order (no overshoot) — `spring` is the second-order, overshoot-capable one.
- **Value-agnostic core.** The scalar solver is the primitive; vector springs apply it per component. It knows nothing about display objects or what the value drives.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] `frequency` + `dampingRatio` is the primary parameterization.** `SpringConfig = { frequency; dampingRatio; }` (frequency in Hz = how fast it responds; dampingRatio 0 = undamped/forever-bouncy, <1 underdamped/overshoots, 1 = critical/fastest-no-overshoot, >1 overdamped) — mass-independent and the most designer-intuitive. A `createSpringConfigFromPhysical(stiffness, damping, mass)` constructor covers the physics-native case. Chosen over raw stiffness/damping/mass as the default because frequency/damping-ratio transfers meaning instantly and normalizes mass out.
- **[2026-07-10] Numerically stable step, frame-rate independent.** `updateSpring(spring, target, deltaTime)` uses a semi-implicit (or closed-form analytic) integrator that stays stable for stiff springs and large/variable `deltaTime` (no explicit-Euler blow-up). `Spring = { value; velocity }` plain data; the step reads inputs to locals then writes, alias-safe. A `deltaTime <= 0` guard is a no-op.
- **[2026-07-10] Plain-data state + `out`-param, types in `@flighthq/types`.** `Spring`, `SpringConfig`, and the vector spring shapes live in the header layer; functions carry the `Spring` name (`createSpring`, `updateSpring`, `isSpringSettled`, `setSpringTarget`-style retarget, `resetSpring`, and `updateSpring2D`/`3D`). No stateful class ticking behind a `.update()`.

## Open directions

1. **Impulse / velocity injection.** `addSpringImpulse(spring, velocity)` for flicks and throws — a small additive control.
2. **Spring presets.** Named `SpringConfig`s (gentle / wobbly / stiff / slow) as a convenience table.
3. **Angle springs.** A shortest-path angular spring (wrap at ±π) for rotation targets.
