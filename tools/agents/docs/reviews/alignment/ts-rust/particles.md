# TS↔Rust Alignment: @flighthq/particles

**Verdict:** In sync — all 25 exports map 1:1 (camelCase→snake_case, full type words preserved), and both dependency divergences (`particles→sprite`, `particles→math`) are recorded in the divergence map with rationale; only cosmetic file-name grouping differs.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `applyParticleCollisions`, `applyParticleObjectCollisions` / `applyParticleCollisions.ts` | `apply_particle_collisions`, `apply_particle_object_collisions` / `collisions.rs` | None — names exact. File regrouped to domain basename `collisions.rs` (TS file is function-named). Cosmetic. |
| `applyParticleForces`, `applyParticleObjectForces` / `applyParticleForces.ts` | `apply_particle_forces`, `apply_particle_object_forces` / `forces.rs` | None — names exact. File regrouped to `forces.rs`. Cosmetic. |
| `buildParticleColorCurve`, `buildParticleCurve`, `particleColorCurveFromKeyframes`, `particleColorCurveToKeyframes`, `particleCurveFromKeyframes`, `particleCurveToKeyframes`, `sampleParticleColorCurve`, `sampleParticleCurve` / `curve.ts` | same (snake_case) / `curve.rs` | None — names exact, file basename matches exactly (`curve.ts`↔`curve.rs`). |
| `emitParticleBurst` / `emitParticleBurst.ts` | `emit_particle_burst` / `emitter.rs` | None — name exact. Folded into `emitter.rs`. Cosmetic. |
| `createParticleEmitterConfig` / `particleEmitterConfig.ts` | `create_particle_emitter_config` / `state.rs` | None — name exact. Relocated into `state.rs`. Cosmetic. |
| `createParticleEmitterState`, `ensureParticleEmitterStateCapacity` / `particleEmitterState.ts` | `create_particle_emitter_state`, `ensure_particle_emitter_state_capacity` / `state.rs` | None — names exact. Folded into `state.rs`. Cosmetic. |
| `createParticleObjectsState`, `ensureParticleObjectsStateCapacity` / `particleObjectsState.ts` | `create_particle_objects_state`, `ensure_particle_objects_state_capacity` / `state.rs` | None — names exact. Folded into `state.rs`. Cosmetic. |
| `prewarmParticleEmitter` / `prewarmParticleEmitter.ts` | `prewarm_particle_emitter` / `emitter.rs` | None — name exact. Folded into `emitter.rs`. Cosmetic. |
| `isParticleEmitterComplete`, `updateParticleEmitter` / `updateParticleEmitter.ts` | `is_particle_emitter_complete`, `update_particle_emitter` / `emitter.rs` | None — names exact. Folded into `emitter.rs`. Cosmetic. |
| `isParticleObjectsComplete`, `updateParticleObjects` / `updateParticleObjects.ts` | `is_particle_objects_complete`, `update_particle_objects` / `objects.rs` | None — names exact. Folded into `objects.rs`. Cosmetic. |
| `normalizeParticleEmitterConfig`, `validateParticleEmitterConfig` / `validateParticleEmitterConfig.ts` | `normalize_particle_emitter_config`, `validate_particle_emitter_config` / `validate.rs` | None — names exact. Grouped into `validate.rs`. Cosmetic. |

No missing ports, no extra Rust functions, no abbreviated or renamed-without-reason symbols. `npm run rust:conformance` reports `particles | 25 | 25 | 110 | 0` (25 TS, 25 matched, 0 missing).

## In sync

- **Exported functions:** all 25 TS exports have an exact Rust counterpart; full unabbreviated type words are preserved (`ensureParticleObjectsStateCapacity` → `ensure_particle_objects_state_capacity`). Sentinel/teardown/out-param verbs carry across (`create_*`, `ensure_*`, `is_*`, `update_*`, `apply_*`, `build_*`, `sample_*`, `normalize_*`, `validate_*`).
- **Crate name:** `@flighthq/particles` → `flighthq-particles`, identity. No undocumented rename.
- **Dependency divergences (both RECORDED, not drift):**
  - `particles→sprite` omitted in Rust: divergence map (`conformance.md` §"Reviewed dependency exceptions" / `scripts/rust-conformance.ts` `'particles->sprite'`) records the value-type seam — the Rust sim operates on the `ParticleEmitterData` value type from `flighthq-types`, not the sprite `NodeId`/arena, so no `flighthq-sprite` edge is needed. The emitter primitive still lives in `flighthq-sprite`, matching TS.
  - `particles→math` omitted in Rust: `conformance.md:66` notes particles inlines its RNG instead of using `flighthq-math`'s `create_random_source`. Recorded as a "Minor" note.
  - `Cargo.toml` deps (`flighthq-types`, `flighthq-geometry`, `flighthq-node`) are consistent with these recorded exceptions.

### Divergence-map maintenance notes

- The two recorded entries are accurate and not stale; rationale matches the current crate source.
- **File-name grouping is not recorded anywhere, and does not need to be** — file-basename tracking is a nice-to-have, and the Rust regrouping (`collisions.rs`/`forces.rs`/`emitter.rs`/`state.rs`/`objects.rs`/`validate.rs`) is arguably _more_ aligned with the CLAUDE.md filename philosophy (domain/object basenames over function-name files) than the TS layout, where most files are function-named. If a future pass wants strict TS↔Rust file parity it would push the _TS_ side toward domain files, not the Rust side. No action required.
