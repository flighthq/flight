# Filename Alignment: @flighthq/particles

**Verdict:** Single-implementation domain package (not a backend-variant — no `gl`/`canvas`/`dom`/`wgpu` prefixing applies); plain domain/object filenames are correct. Most files self-describe a coherent domain or `*State`/`*Config` object, but six are named after a single verb-phrase function (`apply*`, `emit*`, `prewarm*`, `update*`, `validate*`) even though several actually host a small domain (collision/force/collider types, normalize+validate). The Rust port already names these by domain (`collisions.rs`, `forces.rs`, `emitter.rs`, `objects.rs`, `validate.rs`), so renaming the TS files to domain names also tightens TS↔Rust file pairing.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `applyParticleCollisions.ts` | Function-named, but the file is the collision **domain**: it exports `applyParticleCollisions` + `applyParticleObjectCollisions` and the collider type family (`ParticleCollider`, `CircleCollider`, `PlaneCollider`, `RectangleCollider`). Remove the folder and the name reads as one action, not the domain it owns. Rust port names it `collisions.rs`. | `particleCollisions.ts` |
| `applyParticleForces.ts` | Same: hosts `applyParticleForces` + `applyParticleObjectForces` and the force type family (`ParticleForce`, `AttractorForce`, `DragForce`, `TurbulenceForce`, `VortexForce`, `WindForce`, `ForceFalloff`). A force-domain file named after one apply call. Rust port names it `forces.rs`. | `particleForces.ts` |
| `emitParticleBurst.ts` | Named after its single exported function — the file is one function. Rust folds emission into `emitter.rs`. | `particleBurst.ts` (the burst-emission domain), or fold into a `particleEmitter.ts` if emission is grouped with the emitter object |
| `prewarmParticleEmitter.ts` | Named after its single exported function. Rust folds prewarm into `emitter.rs`. | `particleEmitterPrewarm.ts` (object-first), or fold into a `particleEmitter*` domain file |
| `updateParticleEmitter.ts` | Function-named; hosts `updateParticleEmitter` + `isParticleEmitterComplete` + the `ParticleEmitterCallbacks` / `WorldTransform2D` types — i.e. the emitter-update domain, not one call. | `particleEmitterUpdate.ts` (object-first, groups update + completeness + its callback types) |
| `updateParticleObjects.ts` | Function-named; hosts `updateParticleObjects` + `isParticleObjectsComplete` + `ParticleObject` / `ParticleObjectsUpdateOptions` types — the objects-update domain. Rust names the objects domain `objects.rs`. | `particleObjectsUpdate.ts` (object-first) |
| `validateParticleEmitterConfig.ts` | Function-named; hosts `validateParticleEmitterConfig` **and** `normalizeParticleEmitterConfig` plus `ParticleConfigIssue` — a config-validation domain (two functions), not one call. Rust names it `validate.rs`. | `particleEmitterConfigValidation.ts` |
| `curve.ts` | Borderline generic: bare `curve.ts` carries no particle domain — removed from the folder it could be any curve. The file is actually the particle-curve LUT domain (build/sample/keyframe round-trip for both scalar and color curves; every export is `particleCurve*` / `particleColorCurve*`). The basename should say the domain. | `particleCurve.ts` |

No true dumping-ground names (`data.ts`, `format.ts`, `utils.ts`, `helpers.ts`, `math.ts`, `common.ts`) exist; `index.ts` is a thin barrel. All tests are colocated as `<source>.test.ts` and mirror each source filename exactly.

## Clean

- `particleEmitterConfig.ts` — the `ParticleEmitterConfig` object + its type family (`ParticleBlendMode`, `ParticleEmitterShape`) and `createParticleEmitterConfig`. Object-named, self-describing.
- `particleEmitterState.ts` — the `ParticleEmitterState` object (`createParticleEmitterState`, `ensureParticleEmitterStateCapacity`). Object-named.
- `particleObjectsState.ts` — the `ParticleObjectsState` object (`createParticleObjectsState`, `ensureParticleObjectsStateCapacity`). Object-named.
- `index.ts` — package barrel.
- Tests: `applyParticleCollisions.test.ts`, `applyParticleForces.test.ts`, `curve.test.ts`, `emitParticleBurst.test.ts`, `particleEmitterConfig.test.ts`, `particleEmitterState.test.ts`, `particleObjectsState.test.ts`, `prewarmParticleEmitter.test.ts`, `updateParticleEmitter.test.ts`, `updateParticleObjects.test.ts`, `validateParticleEmitterConfig.test.ts` — each mirrors its source filename (and should be renamed alongside any source rename above).
