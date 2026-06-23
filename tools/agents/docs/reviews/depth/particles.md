# Depth Review: @flighthq/particles

**Domain:** 2D particle system — emitter simulation, particle lifetime/appearance animation, force fields, collisions, and curve-driven over-lifetime control.

**Verdict:** solid — 78/100

`@flighthq/particles` is well past stub or partial. It carries the spine of a mature particle library: a typed-array SoA emitter, a parallel object-pool path, force fields (wind/drag/attractor/vortex/turbulence), colliders (plane/circle/rect with restitution + friction), over-lifetime curves (alpha/scale/color, plus keyframe round-trip), prewarming, world-space trails, velocity inheritance, flipbook animation, and config validation/normalization. The gaps are real but mostly at the edges of the canonical feature set (spawn shapes, sub-emitters, sorting/render-order control), not at its core.

## Present capabilities

Simulation core:

- Dual simulation backends: a typed-array SoA emitter (`updateParticleEmitter`) and an object-pool path (`updateParticleObjects` over `ParticleObject[]`) — both with matching force/collision passes. This is unusual depth: most libraries pick one.
- Compacting dead-particle removal in the SoA path (swap-with-last across every parallel array, including birth/death color when variance is active).
- `maxParticles` cap honored at spawn time; lazy capacity growth via `ensureParticleEmitterStateCapacity` / `reserveParticleEmitter`.
- `RandomSource` injection (`createParticleEmitterState(random)`) — deterministic/seedable simulation.
- `prewarmParticleEmitter` (fixed-step pre-roll so emitters start in steady state) with a divide-by-zero guard.

Spawn / emission control:

- Continuous `spawnRate` with a fractional accumulator, plus bursts (`burstCount` / `burstInterval`) and an explicit `emitParticleBurst(...)` one-shot.
- Finite vs looping vs infinite emitters; `isParticleEmitterComplete` / `isParticleObjectsComplete` for one-shot recycling.
- Lifetime range, speed range, scale range, rotation-speed range, direction + angular `spread`.

Appearance over lifetime:

- Alpha start→end and scale (`scaleEnd`) linear paths, plus opt-in LUT curves for alpha, scale, and color (`buildParticleCurve`, `sampleParticleCurve`, RGB variants).
- Keyframe ↔ LUT round-trip (`particleCurveFromKeyframes`/`ToKeyframes`, color variants) — the seam format importers use.
- Per-particle start/end color variance; flipbook frame animation (`frameCount`/`frameRate` over `regionId` range); `blendMode`.

Forces & collisions (fully opt-in passes, tree-shake when unused):

- `WindForce`, `DragForce`, `AttractorForce`, `VortexForce`, `TurbulenceForce` (deterministic value-noise), with `linear`/`inverseSquare`/none falloff and radius cutoff.
- `PlaneCollider`, `CircleCollider` (contain/exclude), `RectangleCollider` (contain/exclude), with restitution + friction reflection that only acts on inbound velocity.

Authoring safety:

- `validateParticleEmitterConfig` (errors + warnings: non-finite, negative, inverted ranges, unit-range alpha, bad curve strides) and `normalizeParticleEmitterConfig` (coerce-to-safe). Both iterate an exhaustive numeric-field tuple so new fields are not silently skipped.

World integration:

- `worldSpace` mode with emitter velocity tracking, velocity inheritance, and trail interpolation (spawns distributed along the prev→current world path), feeding a per-particle velocity buffer for a motion-blur G-buffer.

## Gaps vs an authoritative particle library

Missing-by-omission (within the stated domain, would be expected at AAA):

- **Spawn shapes are thin.** Only `point`, `circle`, `rect`. A canonical emitter set also covers `ring`/annulus (inner radius), `edge`/outline-only emission (vs area fill), `line`, `cone`/`sector` (directional arc as a spawn shape, not just velocity spread), and arbitrary path/polygon emission. There is no `emitFromEdge` flag and no inner-radius.
- **No sub-emitters / nested effects.** `onSpawn`/`onDeath` callbacks exist (the hook a sub-emitter would ride on), but there is no built-in chaining for trails-of-trails, death bursts, or spawn-on-collision. This is a headline feature of Unity Shuriken, Cocos, and PixiJS-emitter-style systems.
- **No render-order / sorting control.** No depth-sort, no oldest-first vs newest-first ordering, no per-emitter draw-order field. The SoA compaction reorders particles by liveness, not by a stable or sortable key.
- **Single particle space per axis of animation.** Velocity is purely linear + gravity + external forces; there is no built-in radial/tangential acceleration relative to the emitter (the classic Starling/Cocos `radialAccel`/`tangentialAccel`), no per-particle angular drag, and no orient-to-velocity flag (rotation is independent of travel direction).
- **No size/scale variance separate from the spawn range axes** beyond `scaleMin/Max`; no non-uniform (x/y) scale, no stretch-by-velocity for streak particles.
- **Color is RGB-only over lifetime; alpha curve is separate.** No single RGBA gradient curve, and no HSV interpolation option — linear RGB lerp only.
- **No emission-rate-over-lifetime / burst timeline.** `spawnRate` is constant; canonical systems allow a rate curve and a multi-entry burst schedule, not a single repeating `burstInterval`.
- **No noise/curl field as a first-class force** (turbulence is value-noise jitter, not divergence-free curl noise); no point/line gravity-well presets beyond attractor; no force enable/disable masking per particle.
- **No GPU/compute simulation path or instanced-update batching hint** — all CPU. Defensible for the architecture, but an "exhaustive" particle library usually offers at least a documented GPU sim seam.

Missing-by-design (correctly out of this package):

- **Rendering.** Drawing lives in the sprite/renderer packages (`reserveParticleEmitter` from `@flighthq/sprite`); the package only mutates SoA data. Correct per the cellular architecture.
- **Asset import/export (Particle Designer plist, Unity, Spine).** Lives in the sibling `@flighthq/particles-formats`; not a depth gap of this package.
- **Easing functions for curves.** `@flighthq/easing` owns those; curves here are sampled LUTs, which any easing can bake into. Correct boundary.

## Naming / API-shape notes

- Naming is consistent and self-identifying: every function carries the full `Particle*` type word, `apply*`/`update*`/`emit*`/`build*`/`sample*`/`is*`/`ensure*` verbs are used correctly, and the entity/runtime + `out`-parameter conventions are followed (e.g. `sampleParticleColorCurve(lut, t, out, offset)`, scratch arrays reused across loops).
- Forces and colliders are plain `kind`-tagged data descriptors (`'WindForce'`, `'CircleCollider'`) dispatched in a `switch` — exactly the Flight "data over runtime objects" philosophy, and extensible without touching the entity.
- The opt-in pass ordering is documented in-source (`applyParticleForces` before update, `applyParticleCollisions` after) — good, but this ordering contract is a foot-gun that lives only in JSDoc; there is no combined `stepParticleEmitter(forces, colliders)` convenience for the common case, so each caller re-implements the 3-call sequence.
- `sampleParticleColorCurve`'s `out: { [index: number]: number }` typing is loose (accepts any indexable) to allow writing into a `Float32Array` slice; acceptable but weaker than a `Float32Array`/number[] union.
- Dual SoA + object-pool API doubles the surface (`applyParticleObjectForces`, `applyParticleObjectCollisions`, `isParticleObjectsComplete`, etc.). Coherent and symmetric, but the package never states when a user should pick which path.

## Recommendation

Keep the verdict at **solid**. The simulation engine is genuinely deep and the data-descriptor force/collider model is the right shape. To reach **authoritative**, prioritize the features that define the domain and are currently absent: (1) richer spawn shapes (ring/edge/line/cone with inner-radius and edge-only emission), (2) sub-emitters / death-and-collision spawn chaining built on the existing `onSpawn`/`onDeath` hooks, (3) radial/tangential acceleration and an orient-to-velocity flag, and (4) emission-rate-over-lifetime plus a burst schedule. Secondary: non-uniform/velocity-stretch scale, an RGBA (or HSV) gradient curve, and a documented render-sort/order key. Consider a single `stepParticleEmitter` helper that folds the force→update→collision ordering so the documented contract is not re-derived at every callsite. None of these require crossing package boundaries except where they touch rendering, which correctly stays in sprite/renderer packages.
