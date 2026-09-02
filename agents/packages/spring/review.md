---
package: '@flighthq/spring'
status: solid
score: 75
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# spring — Review

## Verdict

solid — 75/100. The scalar integrator is textbook-correct and genuinely well-engineered: a closed-form analytic solution of the damped-harmonic ODE across all three damping regimes, unconditionally stable at any `deltaTime`, with a numerically-motivated critical band and alias-safe reads-before-writes. The blessed frequency+damping-ratio parameterization, the physical constructor, the 2D/3D componentwise composition, settle detection, and reset are all in place and match the charter's three 2026-07-10 decisions exactly. The score stays in the mid-solid range because all three charter Open directions (impulse, presets, angle springs) remain unimplemented, and a symmetry gap in the 2D/3D API surface (`resetSpring` has no 2D/3D mirrors) leaves the verb table slightly incomplete.

No source changes have landed since the prior review (2026-07-13) — only packaging/release commits (`0.3.0`, `0.4.0`, `0.5.0`) — so this re-review confirms the prior findings against the unchanged source.

## Present capabilities

### Types (`packages/types/src/Spring.ts`)

- `Spring { value, velocity }` — 1D motion state, both plain numbers.
- `SpringConfig { dampingRatio, frequency }` — mass-independent tuning; frequency in Hz, dampingRatio dimensionless (0 undamped, <1 underdamped, 1 critical, >1 overdamped). Semantics documented at the type.
- `Spring2D { x: Spring, y: Spring }` / `Spring3D { x, y, z: Spring }` — plain compositions, each axis directly usable with the scalar functions.

All types live in `@flighthq/types` per convention; the implementation package exports functions only.

### Config (`springConfig.ts`)

- `createSpringConfig(frequency, dampingRatio)` — primary constructor.
- `createSpringConfigFromPhysical(stiffness, damping, mass)` — converts via the standard identities `omega_0 = sqrt(k/m)` and `zeta = c / (2 * sqrt(k * m))`.

### Integrator (`spring.ts`)

- `updateSpring(spring, target, config, deltaTime)` — closed-form analytic solution of the damped-harmonic equation, evaluated exactly over `deltaTime`. Three branches:
  - **Overdamped** (zeta > 1 + CRITICAL_BAND): two distinct real roots, exponential decay.
  - **Underdamped** (zeta < 1 - CRITICAL_BAND): decaying envelope times sin/cos oscillation.
  - **Critically damped** (zeta within CRITICAL_BAND=1e-4 of 1): repeated root, avoiding the divide-by-zero the other branches hit at exactly 1.
- Guards: `deltaTime <= 0` no-op, `frequency <= 0` inert, `dampingRatio` clamped >= 0. Inputs read into locals before any write (alias-safe). Target is per-step (not stored on spring), so retargeting is free.
- Unconditionally stable: exponentials underflow to 0 for stiff springs at large dt; the spring lands on target rather than exploding.
- Frame-rate independent: the analytic solution gives the same result regardless of step subdivision (tested: 60 small steps vs one large step match to 6 decimal places).

### Settle detection

- `isSpringSettled(spring, target, positionEpsilon?, velocityEpsilon?)` — requires both position within `positionEpsilon` of target AND velocity within `velocityEpsilon` of zero. Default epsilon `1e-3`. Config-independent by design.

### Controls

- `createSpring(value?, velocity?)` — the sole allocating function for scalar springs.
- `resetSpring(spring, value, velocity?)` — snap to a state, discarding current motion.

### 2D/3D vectors (`spring2D.ts`, `spring3D.ts`)

- `createSpring2D(valueX?, valueY?, velocityX?, velocityY?)` / `createSpring3D(...)` — allocate as pairs/triples of scalar springs.
- `updateSpring2D(spring2D, targetX, targetY, config, deltaTime)` / `updateSpring3D(...)` — componentwise scalar step, independent axes, shared config.
- `isSpring2DSettled(spring2D, targetX, targetY, ...)` / `isSpring3DSettled(...)` — AND across axes.

### Package shape

- Dependencies: `@flighthq/math` (for `approxEqual`, `approxZero`, `TAU`) and `@flighthq/types` only. No display, no scene graph, no renderer — matching the charter boundary.
- `"sideEffects": false`, two-lane exports (`.` and `./contract`), `index.ts` re-exports from `contract.ts`.
- 4 source files, 4 colocated test files, 30 tests, all passing.

## Gaps

### Charter Open directions (unimplemented)

1. **Impulse / velocity injection** — `addSpringImpulse(spring, velocity)` for flicks and throws. The North star lists "impulse" among the required controls. The charter names the exact signature. Not implemented; no workaround beyond manually mutating `spring.velocity`.
2. **Spring presets** — named `SpringConfig` values (gentle/wobbly/stiff/slow) as a convenience table. Common in react-spring and Framer Motion; absent here.
3. **Angle springs** — shortest-path angular spring wrapping at +/-pi for rotation targets. Rotation is the most common spring target after position.

### API symmetry

- **No `resetSpring2D` / `resetSpring3D`** — `create*`, `update*`, and `isSettled*` all have 2D/3D mirrors, but `reset*` exists only for the scalar spring. Users must call `resetSpring(spring2D.x, ...)` and `resetSpring(spring2D.y, ...)` individually. This works (the composition model is explicit about per-axis access), but it is the only verb that breaks the pattern, and the convenience functions would be trivial.

### Domain completeness

- **Moving-target velocity term** — the analytic step samples the target only at step boundaries (documented limitation). A `targetVelocity` parameter that solves against a linearly-moving equilibrium is the standard fix for tracking lag when following a moving object. This would change the canonical step signature.
- **Settle-time / duration estimate** — no query approximating time-to-settle for a given config. Useful for scheduling animations and for the designer "how long will this take?" question; SwiftUI and react-spring expose equivalents.
- **Undamped settle semantics** — a spring with `dampingRatio = 0` oscillates forever, so `isSpringSettled` never returns true. The charter acknowledges this ("0 = undamped/forever-bouncy"), but nothing at the API level warns or documents the interaction — a consumer calling `isSpringSettled` on a loop exit will spin indefinitely. This is the kind of silent surprise the diagnostics layer (`enable*Guards`) exists for.

## Charter contradictions

None. All three 2026-07-10 decisions are implemented as written:

- **Parameterization**: `frequency + dampingRatio` is primary, `createSpringConfigFromPhysical` covers the physical case. Confirmed.
- **Numerically stable step**: analytic integrator, three-branch, alias-safe, `deltaTime <= 0` no-op. Confirmed.
- **Plain-data state + `out`-param**: `Spring`, `SpringConfig`, `Spring2D`, `Spring3D` in `@flighthq/types`; functions carry the `Spring` name; no stateful class. Confirmed.

Boundary separations from `@flighthq/easing` (fixed curves), `@flighthq/tween` (fixed-duration interpolation), and `@flighthq/math`'s `damp` (first-order, no overshoot) hold cleanly.

## Contract & docs fit

### Contract compliance

Exemplary:

- Full `Spring` name in every function name (`createSpring`, `updateSpring`, `isSpringSettled`, `resetSpring`, `createSpringConfig`, etc.) — globally self-identifying.
- Allocation only in `create*` functions; `update*` and `reset*` mutate in place.
- Sentinel no-ops for edge cases (`deltaTime <= 0`, `frequency <= 0`) rather than throws.
- `Readonly<T>` on all read-only parameters (`Readonly<Spring>` in `isSpringSettled`, `Readonly<SpringConfig>` in `updateSpring`, `Readonly<Spring2D>`/`Readonly<Spring3D>` in settle queries).
- Constants and scratch values at file bottom, after exports.
- Comments are durable semantic (what the code is, why the numerical choices), not transient work notes.
- No classes, no hidden state, no side effects — portable to C/C++ idioms.

### Package Map accuracy

The Package Map groups `spring` under "Animation and simulation", which is correct. The package description in `package.json` accurately describes the feature set.

### Candidate contract/docs revisions

None identified. The Package Map line, the types file, and the package.json description all match the implemented source.

## Candidate open directions

These are questions the charter does not answer that this review had to assume or observe:

- Whether `updateSpring` should accept an optional `targetVelocity` parameter (solving against a linearly-moving equilibrium). This is additive but changes the canonical step signature that 2D/3D and future consumers mirror. Worth ruling on before more consumers adopt the current signature.
- Whether `estimateSpringSettleTime(config, ...)` belongs in this package or is out of scope.
- Whether the undamped (`dampingRatio = 0`) interaction with `isSpringSettled` (never settling) deserves an `enableSpringGuards` diagnostic or is sufficiently documented by the charter's "forever-bouncy" note.
- Whether `resetSpring2D` / `resetSpring3D` convenience functions should be added for API symmetry, or whether the per-axis `resetSpring` call is the intended pattern for the composition model.
