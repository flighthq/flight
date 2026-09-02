---
package: '@flighthq/spring'
role: package
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


- **[2026-09-01] Impulse, presets, and angle springs are in, and all three keep the existing parameterization.** The 2026-07-10 rulings stand unchanged: `frequency` + `dampingRatio` remains the primary parameterization, and the analytic integrator remains the step. Nothing here re-opens either.

  `applySpringImpulse(spring, velocity)` injects velocity additively, with `applySpringImpulse2D` and `applySpringImpulse3D` mirrors; `resetSpring` likewise mirrors as `resetSpring2D`/`resetSpring3D`. Every one of them mutates the caller's spring in place and allocates nothing. Note the verb is `apply*`, not the `addSpringImpulse` the open direction had sketched — `apply` matches the mutate-in-place shape the rest of the package uses.

  Presets are frozen plain data, not constructors: `SpringPresetBouncy` = `{ dampingRatio: 0.35, frequency: 2 }`, `SpringPresetGentle` = `{ dampingRatio: 0.8, frequency: 1.5 }`, `SpringPresetStiff` = `{ dampingRatio: 1, frequency: 4 }`. Three named points, deliberately, rather than the four the open direction guessed at.

  `updateSpringAngle(spring, target, fullTurn, config, deltaTime)` takes the turn size from the caller — `360` for degrees, `TAU` for radians, `1` for turns — and does no unit conversion of its own, so it does not force the radians/degrees seam either way. It chooses the nearest target within `(-fullTurn / 2, +fullTurn / 2]`, so an exact half-turn tie consistently takes the positive direction, and it leaves the spring on its continuous unwrapped branch so neither value nor velocity jumps at the wrap; presentation-time normalization is the caller's. A non-positive or non-finite `fullTurn` is inert.

  **Resolves the impulse/velocity-injection, spring-presets, and angle-spring directions** — the entire open list as it stood.

  **Why:** All three are small additive controls that the existing parameterization already supports, so none of them needed a new config shape or a second integrator. Taking `fullTurn` as a parameter rather than hard-wiring ±π keeps the angular spring usable from the degrees-based authoring layer without a conversion at the seam, and pinning the tie direction and the unwrapped branch turns two silent behaviours into stated ones. Landed in `c96536bae`.

  **Boundary worth knowing:** the angle spring is scalar only. There is no `updateSpringAngle2D`/`3D`, because an angular spring per component of a 2D or 3D vector is not what a rotation target means.

## Open directions

_None. The impulse, preset, and angle-spring directions all resolved on 2026-09-01; see the Decision above._
