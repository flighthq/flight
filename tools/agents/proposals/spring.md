---
id: spring
title: '@flighthq/spring'
type: new-package
target: spring
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/spring.md
  - tools/agents/docs/reviews/breadth/animation-motion.md
depends_on: []
updated: 2026-06-23
---

## Summary

A value-typed, frame-stepped procedural-motion solver — critically-damped springs plus decay/inertia and rubber-band clamping — usable standalone (step a value toward a target each frame) and as a duration-free driver for `@flighthq/tween`.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable, genuinely useful version: a critically-damped spring you can step a single scalar with each frame, plus the parameterization designers actually reach for.

- **Types in `@flighthq/types`:**
  - `SpringConfig` — `{ stiffness: number; damping: number; mass: number }` (the canonical physical parameterization; `mass` defaults to 1).
  - `SpringState` — `{ value: number; velocity: number; target: number }` (the mutable per-spring integration state).
  - `SpringStepResult` — `{ value: number; velocity: number; settled: boolean }` written to an `out` param by the step function (or fields written back into `SpringState`).
  - `SpringRestOptions` — `{ restDelta?: number; restVelocity?: number }` (settle thresholds).
- **Spring core in `@flighthq/spring`:**
  - `createSpringConfig(stiffness, damping, mass?): SpringConfig`.
  - `createSpringState(value, target?, velocity?): SpringState`.
  - `stepSpring(config, state, deltaTime, out?): SpringStepResult` — semi-implicit (symplectic) Euler integration of one scalar spring toward `state.target` over `deltaTime`; alias-safe (`out` may be `state`). Returns/writes settled flag using default rest thresholds.
  - `isSpringSettled(config, state, options?): boolean` — true when `|value − target| < restDelta` and `|velocity| < restVelocity`.
  - `setSpringTarget(state, target): void` — retarget without discontinuity (keeps current value/velocity).
  - `resetSpring(state, value, velocity?): void` — snap to a value, optionally with velocity.
- **Critical-damping helper:** `getCriticalDamping(stiffness, mass?): number` — the damping coefficient `2·√(stiffness·mass)` that yields no overshoot; the headline "natural UI motion" entry point.
- **Tests:** colocated `*.test.ts` per source file (settling convergence, alias-safe `out`, critical vs. under/over-damped behavior, `deltaTime = 0` no-op).

Effort: small. This is the 20% (one scalar spring + critical damping) that delivers the 80% designers ask for.

### Silver

Competitive and solid — matches what a well-regarded spring library (react-spring / Framer Motion / Pop) offers: ergonomic parameterizations, vector springs, the decay/inertia and rubber-band models named in the request, and a clean tween-driver seam.

- **Types in `@flighthq/types`:**
  - `SpringConfigLike` — structural input accepting either physical (`stiffness`/`damping`/`mass`) or perceptual (`response`/`dampingRatio`) parameters.
  - `DecayConfig` — `{ deceleration: number; restVelocity?: number }` (inertial decay / momentum scroll).
  - `DecayState` — `{ value: number; velocity: number }`.
  - `RubberBandConfig` — `{ min: number; max: number; tension?: number; dimension?: number }` (out-of-bounds resistance for overscroll).
  - `Spring2DState` / `Spring3DState` — vector springs over `Vector2Like` / `Vector3Like` value+velocity+target (mirrors the geometry vector tiers).
- **Perceptual parameterization (the modern default knobs):**
  - `createSpringConfigFromResponse(response, dampingRatio, mass?): SpringConfig` — duration-feel (`response` seconds) + `dampingRatio` (0..1 underdamped, 1 critical), the Framer/SwiftUI parameterization, converted to physical `stiffness`/`damping`.
  - `createSpringConfigFromBounce(duration, bounce): SpringConfig` — the iOS `duration`+`bounce` parameterization.
  - `getSpringDampingRatio(config): number`, `getSpringResponse(config): number` — inverse conversions.
- **Vector springs:** `stepSpring2D(config, state, deltaTime, out?)`, `stepSpring3D(...)`, with `createSpring2DState` / `createSpring3DState` and `isSpring2DSettled` / `isSpring3DSettled` (per-component settle, alias-safe out).
- **Decay / inertia:**
  - `createDecayState(value, velocity)`, `stepDecay(config, state, deltaTime, out?)` — frictional velocity decay (momentum fling/scroll), settling when velocity drops below `restVelocity`.
  - `getDecayDestination(config, state): number` — analytic resting position of a decay so callers can predict where a fling lands (snap-to-page math).
- **Rubber-band / clamping:** `applyRubberBand(value, config): number` and `stepSpringClamped(config, state, deltaTime, bounds, out?)` — overscroll resistance past `min`/`max` (the iOS bounce-back), composable with the scalar spring.
- **Estimated duration:** `getSpringDuration(config, fromValue, toValue, options?): number` — settle-time estimate so a spring can be sequenced/staggered alongside fixed-duration tweens.
- **Tween-driver seam (the "as a tween driver" requirement):**
  - `SpringTweenOptions` type in `@flighthq/types` (`SpringConfigLike` + `SpringRestOptions`, replacing `duration`/`ease`).
  - `createSpringTweenDriver(config, options?): TweenDriver` — adapts a spring to whatever per-frame driver contract `@flighthq/tween` exposes, so `createSpringTween(manager, target, propertyMap, options?)` can live in `tween` while the physics lives here. (If `tween` lacks a driver abstraction today, this spec implies adding a `TweenDriver` seam to `@flighthq/types` so duration-based and spring-based tweens share one update path.)
- **Presets:** named `SpringConfig` constants — `SpringPresetGentle`, `SpringPresetWobbly`, `SpringPresetStiff`, `SpringPresetSlow`, `SpringPresetSnappy` (react-spring/Pop-equivalent catalog) — tree-shakable consts, not a registry.

Effort: medium. Vector springs, decay, and the perceptual parameterizations are each self-contained; the tween-driver seam is the one cross-package design touch.

### Gold

Authoritative / AAA — the canonical scalar-and-vector spring reference, exhaustive in models, numerically robust, fully documented and tested, with 1:1 Rust parity.

- **Numerical robustness:**
  - `stepSpringExact(config, state, deltaTime, out?)` — closed-form analytic solution (the exact damped-harmonic-oscillator solution across under/critical/over-damped regimes) for frame-rate-independent, drift-free results regardless of `deltaTime`. The Bronze semi-implicit step stays as the cheap default; this is the exact path.
  - Sub-stepping / fixed-timestep accumulation: `stepSpringFixed(config, state, deltaTime, fixedStep, out?)` for large `deltaTime` stability under the integrator default.
  - Documented behavior at `deltaTime` extremes, negative/zero stiffness, zero mass (sentinel/clamped, not throwing — throw only on genuinely invalid config such as negative mass, a programmer error).
- **Full model coverage:**
  - `stepDecay2D` / `stepDecay3D` + `getDecayDestination2D/3D` (vector inertia for 2D/3D fling).
  - Generic N-component path: `stepSpringComponents(config, values, velocities, targets, count, out?)` over flat typed-array runs for batching many springs (particle-grade throughput) with zero per-spring allocation.
  - `SpringColorState` + `stepSpringColor(config, state, deltaTime, out?)` — spring a packed RGBA color (component-wise over the SDK's packed-int convention), parallel to `createColorTween`.
  - Angular spring: `stepSpringAngle(config, state, deltaTime, out?)` with shortest-path wraparound (mirrors tween `smartRotation`).
- **Pooling / explicit allocation:** `acquireSpringState` / `releaseSpringState` (and 2D/3D variants) for hot-loop reuse, honoring the `acquire*`/`release*` bracket rule.
- **Signals (opt-in):** `enableSpringSignals(state)` exposing `onSpringSettle` / `onSpringRetarget` via `@flighthq/signals`, behind an `enable*` group so the cost is opt-in and the default bundle stays signal-free.
- **Spring chains / followers:** `stepSpringChain(config, states, count, deltaTime, out?)` — each spring targets its predecessor's value (trailing/elastic-list motion, the "dynamic list" effect), built on the batched component path.
- **Edge cases & docs:** exhaustive tests for every regime (under/critical/over-damped, decay rest, rubber-band bounds, angular wrap, alias-safe out across all step functions, exact-vs-Euler agreement at small `deltaTime`); doc comments stating coordinate/alias/allocation semantics; entries in the SDK API surface (`npm run api spring`) reviewed for naming symmetry with `easing` and `tween`.
- **Rust parity:** `flighthq-spring` fully mirrors every function, recorded in the conformance map and exercised by the parity differ (deterministic CPU math — a clean conformance reference, no GPU readback). Mixable as a `surface-rs`-style wasm leaf if ever desired.

Effort: large but cleanly partitioned — the analytic solver, the batched/typed-array path, and the Rust mirror are the three substantial pieces; everything else is incremental.

## Boundaries

- **No managers, no scheduling, no global clock.** `spring` integrates a value when _called_; it never owns a loop, a manager registry, or a time domain. The shared animation clock the review asks for is a separate `@flighthq/clock` / manager surface, not this package. Spring functions take `deltaTime` and stay frame-driver-agnostic.
- **No property/target binding.** Writing a spring's value back onto a `DisplayObject` property, building a `propertyMap`, or managing a collection of tweens is `@flighthq/tween`'s job. `spring` provides only the driver math + the `TweenDriver` adapter; the higher-level `createSpringTween` ergonomics live in `tween`, not here. This keeps `spring` importable in full isolation.
- **No fixed-duration easing.** `t → value` curves stay in `@flighthq/easing`. `spring` is the duration-free counterpart; the two never absorb each other.
- **No path following, morphing, sequencing, or staggering.** Those are the other animation-motion gaps (`motion-path`, shape/morph tweening, tween sequencing) and live in their own packages/enrichments. `spring` is one motion model, not the composition layer.
- **No file formats.** Springs are parameter sets, not authored assets — there is no `spring-formats` neighbor. Preset catalogs stay as in-package constants.
- **No backend seam.** Pure CPU math; no `*Backend` / `createWeb*` surface (same posture as `easing`).

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Does `@flighthq/tween` need a first-class `TweenDriver` seam?** The clean way to make spring "a tween driver" is a shared `TweenDriver` abstraction in `@flighthq/types` that both duration+easing tweens and spring tweens implement, so `tween`'s update path is driver-agnostic. That is a (small) change to `tween`'s internals and crosses a package boundary — surface it to the user before acting, per the cross-package rule.
- **Default integrator: semi-implicit Euler vs. analytic exact.** Euler is cheap and matches most JS spring libraries (so `rust:spring ~ ts:tween` conformance is easier against existing references); the analytic solution is frame-rate-independent and drift-free. Proposal: Euler as the default `stepSpring`, exact as opt-in `stepSpringExact`. Confirm which is the conformance reference baseline.
- **Parameterization as the primary surface.** Physical (`stiffness`/`damping`/`mass`) is canonical and portable; perceptual (`response`/`dampingRatio`, `duration`/`bounce`) is what designers actually tune. Both ship, but which is the "front door" in examples/docs and the preset definitions?
- **Settle-threshold defaults.** `restDelta` / `restVelocity` defaults are unit-dependent (pixels vs. normalized 0..1 vs. radians vs. color components). Decide whether defaults are caller-supplied per call, baked per step-function family (scalar/angle/color), or carried on `SpringConfig`.
- **Color/angle springs: in `spring` or in consumers?** `stepSpringColor` and `stepSpringAngle` are arguably tween-domain concerns (parallel to `createColorTween` + `smartRotation`). Decide whether the packed-color and angular-wrap springs live here (Gold) or fold into `tween` as spring-backed variants, to avoid `spring` reaching toward the SDK's color/transform conventions.

## Agent brief

> Create `@flighthq/spring` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
