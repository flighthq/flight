---
package: '@flighthq/spring'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# spring — Review

## Verdict

solid — 74/100. The core is genuinely strong: an exact closed-form analytic integrator with all three damping regimes and a numerically-motivated critical band, the blessed frequency+damping-ratio parameterization with a physical constructor, settle detection, reset, and clean 2D/3D composition over the scalar primitive. The North star's "impulse" control is missing, and the charter's three open directions (impulse, presets, angle springs) plus a few textbook conveniences keep it out of the high-solid band.

## Present capabilities

- **Types** (`packages/types/src/Spring.ts`): `Spring { value, velocity }`, `SpringConfig { dampingRatio, frequency }` (semantics documented at the type — 0/</=/>1 regimes), `Spring2D`/`Spring3D` as plain compositions of per-axis `Spring`s (each axis usable with the scalar functions directly — documented).
- **Config** (`springConfig.ts`): `createSpringConfig(frequency, dampingRatio)` and `createSpringConfigFromPhysical(stiffness, damping, mass)` using the standard `ω₀ = √(k/m)`, `ζ = c / 2√(km)` identities.
- **Integrator** (`updateSpring.ts`): closed-form solution of the damped-harmonic ODE evaluated exactly over `deltaTime` — overdamped (two real roots), underdamped (decaying envelope × sin/cos), and critically damped (repeated root) branches, selected by a `CRITICAL_BAND = 1e-4` band around ζ=1 that also avoids the near-critical divide-by-zero. Unconditionally stable (exponentials underflow to 0 for stiff springs at large dt — documented). `deltaTime <= 0` no-op, `frequency <= 0` inert, `dampingRatio` clamped ≥ 0, inputs read to locals (alias-safe), target passed per-step so retargeting is free — all per the 2026-07-10 decisions.
- **Settle** — `isSpringSettled(spring, target, positionEpsilon?, velocityEpsilon?)` requiring both position and velocity within tolerance (an overshoot passing through the target is not settled — documented); config-independent by design.
- **Controls** — `createSpring(value?, velocity?)`, `resetSpring(spring, value, velocity?)`.
- **Vectors** — `createSpring2D/3D`, `updateSpring2D/3D`, `isSpring2D/3DSettled` (`spring2D.ts`/`spring3D.ts`), componentwise over one shared solver.
- **Hygiene** — deps `math` + `types` only; `sideEffects: false`; 30 tests across 7 files.

## Gaps

- **Impulse / velocity injection** — the North star lists "impulse/retarget/reset controls"; retarget and reset exist, `addSpringImpulse` does not (also charter Open direction 1, which names the exact signature).
- **Angle spring** — shortest-path angular spring wrapping at ±π for rotation targets (Open direction 3); rotation is the most common spring target after position.
- **Presets** — named `SpringConfig` table (gentle/wobbly/stiff/slow, Open direction 2), the react-spring/Framer-familiar entry point.
- **Moving-target velocity term** — the analytic step samples the target only at step boundaries (documented limitation in `updateSpring.ts`); a `targetVelocity` parameter (solving against a linearly-moving equilibrium) is the standard fix for tracking lag when following a moving object.
- **Settle-time / duration estimate** — no query approximating time-to-settle for a config (useful for scheduling and for the designer "how long will this take" question; SwiftUI/react-spring expose equivalents).
- **`dampingRatio = 0` semantics** — undamped springs oscillate forever, so `isSpringSettled` never latches; nothing warns or documents the interaction at the API level (charter says 0 = "undamped/forever-bouncy", so it is intended — but it is the kind of silent surprise the diagnostics layer exists for).

## Charter contradictions

None. All three 2026-07-10 decisions are implemented exactly as written (parameterization, stable analytic step with the specified guards and alias safety, plain-data + `out`-param shapes in the header layer). Boundary separations from easing/tween/`damp` hold.

## Contract & docs fit

- **Contract**: exemplary — full `Spring` names, allocation only in `create*`, sentinel no-ops rather than throws, constants at file bottom with rationale comments.
- **Docs**: the Package Map line (analytic integrator, frequency+damping-ratio, componentwise 2D/3D, the second-order positioning against easing/tween/`damp`) matches the source precisely.

## Candidate open directions

- Whether `updateSpring` should accept a target-velocity term (tracking a moving equilibrium exactly) — additive parameter, but it changes the canonical step signature; worth ruling on before consumers adopt.
- Preset vocabulary and values, if presets are blessed — a naming decision more than an implementation one.
- Whether an `estimateSpringSettleTime(config, ...)`-style query is in scope for this package.
