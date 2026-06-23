---
id: particles
title: '@flighthq/particles'
type: depth
target: particles
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/particles.md
  - tools/agents/docs/reviews/depth/particles.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 78/100. A genuinely deep simulation core (dual SoA + object-pool backends, force fields, colliders, over-lifetime curves, prewarm, world-space trails); gaps are at the edges of the canonical feature set — spawn shapes, sub-emitters, sorting/render-order, and per-particle radial/tangential motion.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that closes the most-cited gaps. Shippable, basic, no new package.

- **Richer spawn shapes.** Extend `ParticleEmitterShape` (`@flighthq/types`) from `'point' | 'circle' | 'rect'` to add `'ring'`, `'line'`, `'cone'`, `'edge'`. Add config fields: `readonly emitterInnerRadius: number` (ring/annulus), `readonly emitFromEdge: boolean` (outline-only vs area fill), `readonly emitterArc: number` (cone/sector half-angle for directional spawn-as-shape), `readonly emitterLineX2/emitterLineY2` (line endpoint). Implement spawn-position + initial-direction selection in `updateParticleEmitter`/`emitParticleBurst` for each shape. These are flat numbers, so they slot into the validation field tuple and the `-formats` mapping with no structural change.
- **Radial / tangential acceleration.** Add `readonly radialAcceleration: number` and `readonly tangentialAcceleration: number` to `ParticleEmitterConfig` (the classic Starling/Cocos axes, currently absent — velocity is purely linear + gravity + forces). Apply relative to the spawn origin in both `updateParticleEmitter` and `updateParticleObjects`. Cheap, high-value, round-trips through `particles-formats` (Particle Designer's `radialAccel`/`tangentialAccel` map 1:1).
- **Orient-to-velocity.** Add `readonly orientToVelocity: boolean`; when set, particle rotation tracks `atan2(vy, vx)` instead of `rotationSpeed`. Add `readonly rotationOffset: number` for sprite-facing correction.
- **`stepParticleEmitter` convenience.** Add `stepParticleEmitter(emitter, state, config, deltaTime, forces?, colliders?, callbacks?, worldTransform?)` that folds the documented `applyParticleForces → updateParticleEmitter → applyParticleCollisions` ordering into one call, plus `stepParticleObjects` for the pool path. The ordering contract currently lives only in JSDoc and is re-derived at every callsite — make it a function. Keep the three primitives exported for advanced use.
- **Tighten `sampleParticleColorCurve` out typing.** Replace `out: { [index: number]: number }` with `out: Float32Array | number[]` so the seam is precise without losing the slice-write use.

### Silver

Competitive and solid — matches a well-regarded 2D particle library; covers common professional use and the important edge cases. Most of this lives in `@flighthq/particles`; one item touches `@flighthq/signals`.

- **Sub-emitters / nested effects.** The headline missing feature. First widen the spawn/death hook payload: `ParticleEmitterCallbacks.onSpawn`/`onDeath` currently pass only `(x, y)`; extend to `(x, y, vx, vy, index)` so a sub-emitter can inherit position **and** velocity. Then add a data descriptor `ParticleSubEmitter` (in `@flighthq/types`) with `readonly trigger: 'spawn' | 'death' | 'collision'`, a child `ParticleEmitterConfig`, and `readonly inheritVelocity: number`; and an `applyParticleSubEmitters(emitter, state, subEmitters, childStates, deltaTime)` pass. This covers trails-of-trails, death bursts, and spawn-on-collision — requires a `'collision'` hook added to `applyParticleCollisions`.
- **Emission-rate-over-lifetime and a burst schedule.** `spawnRate` is a single constant and bursts are one repeating `burstInterval`. Add `readonly spawnRateCurve: ParticleCurve | null` (rate scaled by `emitter age / duration`) and a `ParticleBurstSchedule` type — `ReadonlyArray<{ time: number; count: number; cycles: number; interval: number }>` — replacing/augmenting the single-burst fields. Implement in the spawn accumulator.
- **RGBA gradient curve + HSV option.** Color-over-lifetime is RGB-only with a separate alpha curve. Add `readonly rgbaCurve: ParticleCurve | null` (4-stride) so a single gradient drives color **and** alpha together, and `buildParticleRgbaCurve` / `sampleParticleRgbaCurve`, plus `particleRgbaCurveFromKeyframes`/`ToKeyframes`. Add `readonly colorInterpolation: 'rgb' | 'hsv'` for hue-correct gradients.
- **Non-uniform and velocity-stretch scale.** Add `readonly scaleAspect: number` (x/y ratio for non-square sprites) and `readonly stretchByVelocity: number` (streak/elongation factor along travel direction) for streak particles. Requires the SoA path to carry a per-particle `scaleY` (or derive at sample time) — surface as a `scaleY` buffer in `ParticleEmitterState`.
- **Render-order / sort key.** Add `readonly sortMode: 'none' | 'oldestFirst' | 'newestFirst' | 'byDistance'` and a `getParticleSortOrder(state, out, cameraX, cameraY)` that fills an index array the renderer (sprite package) consumes — the package produces the order, drawing stays in `@flighthq/sprite`. SoA compaction reorders by liveness today, which is not a stable draw key.
- **Curl noise as a first-class force.** Add `CurlNoiseForce` (divergence-free curl noise, distinct from the existing value-noise `TurbulenceForce` jitter) and a `PointGravityWell` preset to the force descriptor set + `applyParticleForces` switch. Add `readonly forceMask: number` to forces so a force can target a subset of particles.
- **Spawn-rate signals (opt-in).** `enableParticleEmitterSignals(state)` exposing `onParticleSpawn` / `onParticleDeath` / `onEmitterComplete` signals via `@flighthq/signals` for callers that need loose multi-listener notification (over the strict single-callback path). Cost is opt-in per the `enable*` convention.
- **Guidance + a `stepParticleEmitter`-driven example.** Document when to choose the SoA vs object-pool path (the package never states this) and add a functional test scene exercising spawn shapes, sub-emitters, and forces across renderers.

### Gold

Authoritative / AAA — the canonical 2D particle reference, plus the Rust mirror. Nothing a domain expert finds missing.

- **Open the force/collider families to registry dispatch.** `ParticleForce`/`ParticleCollider` are closed discriminated unions today (noted in their type-file comments as a deferred refactor). Move `@flighthq/particles` from central `switch (force.kind)` to `registerParticleForce(registry, kind, applyFn)` / `registerParticleCollider(...)` registry dispatch (mirroring effects/filters), and open the union to the `kind: Kind` base contract. This lets users add vendor-prefixed custom forces (`'acme.Magnet'`) without editing the package — the AAA extensibility bar.
- **Arbitrary path / polygon emission.** `'path'` and `'polygon'` spawn shapes consuming a `@flighthq/geometry` path, with edge-length-weighted sampling for uniform spawn density along arbitrary outlines.
- **Mesh/path-following motion & attractors-to-spline.** `SplineForce` pulling particles along a path; `OrbitForce` (sustained orbit, distinct from one-shot vortex).
- **Per-particle angular drag and full angular dynamics.** `readonly angularDrag: number`, `readonly angularAcceleration: number`; close the rotation axis to match the linear axis.
- **GPU/compute simulation seam.** A documented `ParticleSimulationBackend` `*Backend` seam (`getParticleSimulationBackend`/`setParticleSimulationBackend`/`createCpuParticleSimulationBackend`) so a WebGPU/compute backend can drive the SoA arrays without changing callers — the CPU path becomes the default backend. This is the "documented GPU sim seam" the depth review flags as the AAA expectation; native-first, web/compute backend swappable.
- **Exhaustive collision response.** Per-particle collision events feeding sub-emitters, `kill`/`bounce`/`stick`/`slide` response modes per collider, and a `CapsuleCollider` / polygon collider.
- **Determinism + performance bench gate.** A committed deterministic-replay test (same seed → identical buffers) and a perf benchmark (particles/ms) wired into the size/CI gate; SoA fast-path for the no-variance / no-color-curve common case.
- **Full edge-case & error coverage.** Extend `validateParticleEmitterConfig`/`normalizeParticleEmitterConfig` to every new field (the field tuple is exhaustive by design — keep it so), NaN/Inf guards on all new curves and shapes, and sentinel returns for invalid sub-emitter graphs (cycle detection → `null`, not throw).
- **Rust crate `flighthq-particles`.** Does not exist yet. Port the matured SoA engine to a `NodeArena`-free value/buffer crate (the SoA arrays are `Vec<f32>`, ideal for Rust), 1:1 with the TS API per the conformance map; pair functional scenes by name; record any intentional TS↔Rust divergence. Particles is a strong early Rust target — value-typed, deterministic, headlessly fingerprint-able (mixable-set-adjacent: the simulation is buffer-in/buffer-out even though full scene mixing is not).

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze first, in `@flighthq/types` then `@flighthq/particles`.** Spawn shapes, radial/tangential accel, orient-to-velocity, and `stepParticleEmitter` are all flat-field additions with no cross-package dependency and immediate payoff. Effort: small–medium. Do radial/tangential and spawn shapes together since both touch the spawn path in `updateParticleEmitter`/`emitParticleBurst`. The `sampleParticleColorCurve` typing fix is a trivial cleanup to land alongside.
2. **`-formats` follow-through.** After each Bronze/Silver config field lands, confirm the new fields map through `@flighthq/particles-formats` (Particle Designer `radialAccel`/`tangentialAccel`, Unity shape modules). The format round-trip and the validation field tuple are the two invariants every new flat field must satisfy — re-run them per addition, not at the end.
3. **Silver core: sub-emitters.** This is the largest single item and gated on a **design decision to surface to the user**: the `onSpawn`/`onDeath` callback payload must widen from `(x, y)` to `(x, y, vx, vy, index)`, and `applyParticleCollisions` must gain a `'collision'` hook. Decide the sub-emitter ownership model (does the parent own child states, or does the caller?) before building. Effort: large.
4. **Silver remainder** (rate-over-lifetime + burst schedule, RGBA/HSV gradient, non-uniform/stretch scale, sort key, curl-noise force, signals) are independent and can land in any order. The sort-key item has a **cross-package touchpoint**: the order is produced here but consumed by `@flighthq/sprite`'s particle draw — coordinate the consumer signature. The signals item depends only on `@flighthq/signals` (already a low-dep infra package).
5. **Gold registry-dispatch refactor** should precede the Gold custom-force additions, since opening the union is what makes vendor forces possible. This is a breaking internal change (central switch → registry) but pre-release, so do it cleanly rather than layering. Surface it as a deliberate API reshape.
6. **Gold GPU sim seam** is a design decision to surface: it defines a `*Backend` contract that the Rust port must mirror — design the seam type in `@flighthq/types` with both TS-CPU and future-WebGPU and Rust-wgpu backends in mind before implementing.
7. **Rust `flighthq-particles`** last, against the matured TS spec (TS is authoritative). It has no upstream blocker but should follow the union-opening and seam decisions so the port mirrors the final shape, not an intermediate one.

**Cross-package / design-decision items to surface explicitly:**

- Callback payload widening (`x,y` → `x,y,vx,vy,index`) and the new `'collision'` hook — needed for sub-emitters; affects every existing `updateParticleEmitter` caller.
- Sort-order consumer signature in `@flighthq/sprite` (rendering stays out of this package; only the order array is produced here).
- Opening `ParticleForce`/`ParticleCollider` to registry dispatch (the two type-file comments already flag this as the deferred refactor).
- The `ParticleSimulationBackend` seam shape, designed jointly for CPU/WebGPU/Rust-wgpu.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/particles` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
