---
package: '@flighthq/particles'
updated: 2026-09-01
by: manager
---

# particles — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/particles/src/` (and `packages/types/src/`) on 2026-09-01,
after the spawn-sampler unification landed in `bcbd5e4b6`.
A file:line here is a claim about this tree, not about a session.

- **This cell is simulation-only now.** `updateParticleEmitter2D/3D`, `emitParticleBurst*`,
  `prewarmParticleEmitter*`, and `stepParticleEmitter*` live in `@flighthq/particleemitter`, not here.
  `particles` owns config, validation, state, curves, forces, colliders, the object-pool path, and the
  signal group (`contract.ts:1-10`). Claims about the emitter update loop belong in that cell.
- **Three spawn shapes are still unimplemented, now consistently so.** `ParticleEmitterShape` is
  `box | circle | cone3d | line | point | rect | ring | sphere`
  (`types/src/ParticleEmitterConfig.ts:3`). The shared `writeParticleSpawnOffset` resolves `circle`,
  `line`, `rect`, and `ring`, and `point` is the origin by definition; `box`, `cone3d`, and `sphere`
  fall through to a point spawn at the emitter origin with no diagnostic. What changed on 2026-09-01
  is that this is now one fallthrough in one sampler rather than three paths disagreeing — the
  authored shape is still silently ignored, but it is ignored identically everywhere. The three
  outstanding shapes are the 3D ones, which the sampler leaves to its caller by design.
- **`ParticleBurstSchedule` is declared and unconsumed.** `ParticleBurstEntry` /
  `ParticleBurstSchedule` (`types/src/ParticleBurstSchedule.ts:15`) are exported from both `types`
  lanes with zero readers anywhere in `packages/`; the object path still drives bursts from the single
  `burstCount` / `burstInterval` pair (`updateParticleObjects.ts:109-114`).
- **Signals are enabled here but fired elsewhere.** `enableParticleEmitterSignals`
  (`particleEmitterSignals.ts:24`) attaches `onEmitterComplete` / `onParticleDeath` /
  `onParticleSpawn` to any `object` through a module symbol; its own doc names
  `updateParticleEmitter2D` / `stepParticleEmitter2D` as the emitters, both in `particleemitter`.
  Nothing in this package fires them — `updateParticleObjects` uses the plain callbacks instead.
  The parameter is also typed `state: object`, so the slot accepts anything.
- **No pool brackets.** There is no `acquire*` / `release*` pair in `packages/particles/src`.
  Recycling is a linear dead-slot scan (`updateParticleObjects.ts:125`) plus
  `ensureParticleObjectsStateCapacity` / `ensureParticleEmitterStateCapacity` growth.
- **No guard module and no `explain*` query.** The silent shape fallback above, and the curve drops in
  `normalizeParticleEmitterConfig` (`validateParticleEmitterConfig.ts:96-100`, which nulls any empty or
  non-finite curve), have no `enableParticleGuards` seam. `validateParticleEmitterConfig` reports
  authored-config problems only, and does not see either.
- **The force union is closed by ruling, not by omission.** `types/src/ParticleForce.ts:7` states it
  outright: force evaluation is per-particle per-frame and registry dispatch would be a measurable
  cost. Treat "move `applyParticleForces` to `registerParticleForce`" as decided against, not pending.
  The collider `switch` at `applyParticleCollisions.ts:89` follows the same closed-union shape.

## Log

- **2026-09-01** — Spawn sampling unified in `bcbd5e4b6`; charter Decision recorded. Two items here
  died: the object path no longer has its own spawn branch (all five spawn sites share
  `writeParticleSpawnOffset`), and the two callback shapes no longer disagree —
  `ParticleObjectsUpdateOptions.callbacks` is now `ParticleEmitterCallbacks`, so an object-pool death
  reports position like every other path. The remaining shape gap is `box`/`cone3d`/`sphere`.

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Nearly the whole prior file described a
  package that no longer exists here: the emitter path moved to `@flighthq/particleemitter`, and every
  config field the 2026-06-24 entry claimed to have added — `radialAcceleration`,
  `tangentialAcceleration`, `emitterInnerRadius`, `emitterArc`, `emitFromEdge`, `orientToVelocity`,
  `rotationOffset`, `emitterLineX2/Y2` — is absent from `types/src/ParticleEmitterConfig.ts`, as are the
  `ring` / `line` / `edge` shapes. The "spawn-rate signals deferred" item is also false:
  `particleEmitterSignals.ts` exists and ships through both lanes.
- **2026-06-25** — Alphabetized `createParticleEmitterConfig`'s returned object; added a
  deterministic-replay assertion over a 60-frame update sequence.
- **2026-06-24** — Spawn-shape widening, radial/tangential acceleration, and `stepParticleEmitter`
  landed against the then-current emitter path (since relocated to `particleemitter`).
