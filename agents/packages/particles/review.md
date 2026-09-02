---
package: '@flighthq/particles'
status: solid
score: 74
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source (packages/particles/src, live tree)
  - packages/types/src/Particle* type files
  - git log since 2026-07-13
---

# particles -- Review

Re-review over the live tree. Prior review (2026-07-13, solid/73) measured the post-extraction state after the `particleemitter` split. Since then, 12 commits touched this package (330 insertions, 111 deletions). The headline change is 3D support landing across forces, colliders, config, and state (`c5231a8a`). The remainder is packaging/lane work (contract lanes, public API restriction, version bumps). Test count rose from 101 to 110. The package remains a pure, headless simulation leaf.

## Verdict

`solid -- 74/100`. The package fulfills its charter identity as a pure CPU simulation kernel with zero scene-graph coupling (deps: `geometry`, `signals`, `types` only). The 3D additions (sphere collider, 3D wind/attractor/vortex/turbulence, `positionsZ`/`gravityZ`/`directionZ` in config, 3D velocity stride) are clean and well-tested. The score nudges up from 73 because 3D broadened the force and collider coverage -- but the core breadth gaps remain: spawn shapes at 3 of 6, sort-key production absent, burst schedule orphaned, and the object-pool path trails the SoA path on shape coverage and callback fidelity. These are the same gaps as the prior review; no regression, no significant closure.

## Present capabilities (verified in source)

- **Forces** (`applyParticleForces.ts`, 189 lines): `WindForce` (constant 3D acceleration), `DragForce` (velocity-proportional damping, 3D), `AttractorForce` (radial pull/repel with radius cutoff and `ForceFalloff`), `VortexForce` (tangential force with configurable 3D axis, radius, falloff), `TurbulenceForce` (deterministic hash-based 2D value noise, 3D output). All five operate on both the SoA path (`applyParticleForces`) and the object-pool path (`applyParticleObjectForces`). Shared scratch tuple avoids per-iteration allocation.

- **Colliders** (`applyParticleCollisions.ts`, 244 lines): `PlaneCollider` (arbitrary 3D normal), `CircleCollider` (`contain`/`exclude` modes), `RectangleCollider` (`contain`/`exclude` with shallowest-axis push-out), `SphereCollider` (3D `contain`/`exclude`). All four support `restitution` and `friction` via a shared `reflect3` helper. Both SoA (`applyParticleCollisions`) and object-pool (`applyParticleObjectCollisions`) paths. Object-pool path is 2D-only (z hardcoded to 0).

- **Curves** (`curve.ts`, 251 lines): scalar LUT bake (`buildParticleCurve`), RGB interleaved LUT bake (`buildParticleColorCurve`), keyframe round-trip (`particleCurveFromKeyframes`/`particleCurveToKeyframes`, color variants), clamped out-param samplers (`sampleParticleCurve`, `sampleParticleColorCurve` with out+offset), HSV interpolation (`lerpHsvDirect`, `lerpHsvInPlace`) with shorter-arc hue wrapping.

- **Config** (`particleEmitterConfig.ts`, 58 lines; `validateParticleEmitterConfig.ts`, 243 lines): `createParticleEmitterConfig` with alphabetized defaults. `validateParticleEmitterConfig` returns `ParticleConfigIssue[]` (non-finite fields as errors, negative counts/rates as warnings, inverted ranges, unit-range checks, curve stride and non-finite sample checks). `normalizeParticleEmitterConfig` returns a safe copy with non-finite fallback-to-default, negative clamping, integer flooring, and invalid curve dropping. Both driven by `satisfies`-guarded exhaustive field tuples.

- **State** (`particleEmitterState.ts`, 49 lines; `particleObjectsState.ts`, 26 lines): SoA state with `createParticleEmitterState` (3D velocity stride via `PARTICLE_VELOCITY_STRIDE = 3`), `ensureParticleEmitterStateCapacity` (lazy `colorBirth`/`colorDeath` growth only when `hasColorVariance`). Object-pool state via `createParticleObjectsState`/`ensureParticleObjectsStateCapacity`. Both use `reserveFloat32Array` from `@flighthq/geometry`.

- **Object-pool simulation** (`updateParticleObjects.ts`, 176 lines; `stepParticleObjects.ts`, 47 lines): spawn into dead slots with lifetime/speed/scale/rotation randomization via injected `RandomSource`; gravity integration; alpha/scale curves over lifetime; velocity inheritance from emitter movement; burst scheduling (single `burstCount`/`burstInterval`); `isParticleObjectsComplete` for finite non-looping emitters. `stepParticleObjects` folds forces-update-collisions into one call.

- **Signals** (`particleEmitterSignals.ts`, 38 lines): `enableParticleEmitterSignals`/`getParticleEmitterSignals` via module-level symbol slot. `createParticleEmitterSignals` creates `onParticleSpawn`/`onParticleDeath`/`onEmitterComplete`. Zero cost until enabled (opt-in `enable*` convention).

- **Export lanes**: `.` (index.ts) re-exports 25 named symbols from `./contract`; `./contract` barrel re-exports all 10 source modules. Two blessed lanes, no additional subpaths. `sideEffects: false`.

- **Tests**: 110 cases across 10 colocated `*.test.ts` files. `describe` blocks mirror exports. Tests use structural fixtures (`as unknown as ParticleEmitter2D`) to avoid importing from `@flighthq/particleemitter`, preserving the pure-leaf boundary. Deterministic-replay test uses `createRandomSource` from `@flighthq/math`.

## Gaps (vs charter Boundaries + AAA)

1. **Spawn shapes: 3 of 6 in types, 2 of 6 in object-pool code.** `ParticleEmitterShape` union is `'box' | 'circle' | 'cone3d' | 'point' | 'rect' | 'sphere'` (6 members). The object-pool path (`updateParticleObjects.ts:142-150`) branches on `circle` and `rect` only -- `box`, `cone3d`, `point`, and `sphere` all fall through to a point spawn at origin with no diagnostic. The SoA spawn path lives in `particleemitter`. The charter's in-scope list names `ring` and `line` which are absent from the type union entirely.

2. **Sort-key production absent.** Charter Decision: "sort-key is the sim's job." No `getParticleSortOrder`, no `sortMode` config field, no sorted index array production anywhere in the package.

3. **`ParticleBurstSchedule` remains orphaned.** `ParticleBurstEntry`/`ParticleBurstSchedule` are defined and exported from `@flighthq/types` with full JSDoc. No config field references them; the simulation uses the simpler `burstCount`/`burstInterval` pair exclusively. Zero readers anywhere in `packages/`.

4. **Object-pool callback shape disagrees with SoA callbacks.** `ParticleEmitterCallbacks` passes `(x, y, z)` for both hooks. `ParticleObjectsUpdateOptions.callbacks` inlines `onDeath?: () => void` (no position at all) and `onSpawn?: (x: number, y: number)` (2D only). This limits sub-emitter scenarios and breaks symmetry between paths.

5. **Signals enabled here, fired elsewhere.** `enableParticleEmitterSignals` attaches signals to any `object`; its doc names `updateParticleEmitter2D`/`stepParticleEmitter2D` as the emitters, both in `particleemitter`. Nothing in this package fires them. The object-pool path uses plain callbacks instead, so signals and the object-pool path are disconnected.

6. **No guard module.** The silent shape fallback in `updateParticleObjects` (unhandled shapes spawn at origin) and the curve drops in `normalizeParticleEmitterConfig` (which nulls non-finite curves) have no `enableParticleGuards` seam and no `explain*` query per the diagnostics convention.

7. **`lerpHsvDirect`/`lerpHsvInPlace` stale JSDoc.** Their doc says "Used by the `colorInterpolation: 'hsv'` path in updateParticleEmitter2D." No `colorInterpolation` config field exists and no caller outside their own tests references these functions.

8. **Sub-emitters, exhaustive collision response (`kill`/`bounce`/`stick`/`slide`), GPU seam, Rust crate** -- all absent, all correctly parked by charter Decisions or Open directions.

## Charter contradictions

**None.** The prior review's headline contradiction (scene-graph coupling) remains resolved. The package depends only on `geometry`, `signals`, and `types`. The force/collider closed-union ruling (Decision 2026-07-02) matches the source comments in `types/src/ParticleForce.ts` and `types/src/ParticleCollider.ts`. The charter's in-scope list still names "prewarm, world-space trails" and "burst scheduling" under particles, but post-extraction those capabilities live in `particleemitter`'s loop -- this is a charter text staleness, not a code defect; noted as a candidate revision.

## Contract & docs fit

**Meets the contract.** All shared types in `@flighthq/types` (package files export functions only). Full unabbreviated function names (`applyParticleCollisions`, `createParticleEmitterConfig`, `validateParticleEmitterConfig`). Out-params with out-first ordering (`sampleParticleColorCurve(out, offset, lut, t)`). Sentinels not throws (`null` from `getParticleEmitterSignals`). Two blessed export lanes, no additional subpaths. `sideEffects: false`. Opt-in `enable*` signals convention.

**Candidate revisions:**

- (a) Stale `lerpHsv*` JSDoc (references non-existent `colorInterpolation` config path) -- fix or remove.
- (b) Orphaned `ParticleBurstSchedule` in the header layer -- wire it into `ParticleEmitterConfig` or remove it.
- (c) `enableParticleEmitterSignals(state: object)` -- the `object` parameter type is wider than the `ParticleEmitterState` it is documented for. Consider narrowing.
- (d) Charter in-scope list names "prewarm, world-space trails, burst scheduling" which now belong to `particleemitter` post-extraction -- true up at next direction session.
- (e) `ParticleEmitterShape` has 6 members but the object-pool spawn code handles 2. The type union widened for 3D (`box`, `cone3d`, `sphere`) but the object-pool path did not follow.

## Candidate open directions

1. **Object-pool 3D parity.** The SoA path (in `particleemitter`) handles 3D shapes; the object-pool path here handles only `circle` and `rect`. Decide whether object-pool spawning should cover `box`/`cone3d`/`sphere` or whether the object-pool path is 2D-only by design.
2. **Callback unification.** `ParticleEmitterCallbacks` vs `ParticleObjectsUpdateOptions.callbacks` have divergent signatures. Settle whether the object-pool path should carry position in its `onDeath` callback (needed for sub-emitters).
3. **Signal/object-pool integration.** Signals are defined and enabled here but only fired by the SoA emitter in `particleemitter`. Decide whether the object-pool path should fire signals too, or whether signals are SoA-only.
4. **Sort-key buffer seam.** Charter Decision says sort-key is the sim's job, but producing sorted index arrays requires access to position data. Design the API shape (`getParticleSortOrder`? config `sortMode`?).
5. **Re-land missing spawn shapes.** Charter in-scope: `ring`, `line` -- neither in the type union nor implemented anywhere. Decide priority and whether they belong in the config type first.
