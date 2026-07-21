---
package: '@flighthq/particles'
updated: 2026-07-21
basedOn: ./review.md
---

# particles — Assessment

Sorted from the depth review (82/100, solid), verified against the live tree (33 exports, 164+ tests, 14 source files), and the direction session (2026-07-02). Eight decisions blessed, including the sim/node split. The package is a strong CPU simulation core. The major architectural direction is extracting the display-object wiring into `@flighthq/particleemitter`, leaving particles as a pure value-leaf.

## Depth gaps

1. **Finish the dimension-honest 3D simulation primitives.** The live 3D path now carries z position/velocity/gravity, box/sphere/cone spawn, world/local motion, and 3D bounds, but `stepParticleEmitter3D` still casts the emitter to `ParticleEmitter2D` for forces and collisions. Add true 3D force/collider descriptors and distance sorting while sharing only genuinely dimension-independent curve/lifetime logic.
2. **Preserve a backend-neutral simulation seam.** CPU SoA remains the reference; a future compute/GPU implementation consumes the same explicit buffers/descriptors and returns inspectable state. Do not put a GPU branch into every CPU update loop.
3. **Complete mature emitter behavior.** Collision responses, sub-emitters, trails, render-order keys, prewarm/deterministic replay, and module combinations need behavioral tests across 2D and 3D.

## Recommended

Sweep-safe: within `@flighthq/particles`, no cross-package coupling beyond types, no open design decision.

1. **Resolve `computeParticleSpawnOffset` public/internal status.** Exported via the barrel but documented as internal in `status.md`. Either make it module-internal (drop from barrel) or bless as public API and fix the stale note. Surface-hygiene fix, no behavior change.

2. **Alphabetize `createParticleEmitterConfig` returned object fields.** Fields are interleaved out of order. `npm run order` won't catch object-literal key order. Pure source-style cleanup.

3. **Add a deterministic-replay test.** Assert that two `createParticleEmitterState(seed)` runs of the same `stepParticleEmitter` sequence produce byte-identical SoA buffers. Guards North-star #1 (determinism), which nothing currently enforces. Within-package, no design decision.

4. **Document the redundant `'edge'` spawn shape.** `case 'edge'` is identical to `'circle'` with `emitFromEdge: true`. Add an in-source note explaining why both spellings exist. (Removing `'edge'` from the type union touches `@flighthq/types` and `particles-formats` — not purely within-package. Prefer the doc note.)

5. **Fix spawn shape type alignment.** The `ParticleEmitterShape` type union has 3 shapes (`point`, `circle`, `rect`); the source handles ~7. Update the type in `@flighthq/types` to match the implementation. Per charter Decision #6.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Sim/node split into separate packages.** _Parked — architectural._ Blessed (Decision #1). Extract the 2 files' `sprite`/`node` imports into `@flighthq/particleemitter`. Needs package scaffold, dependency rewiring, and a particleemitter charter.

- **Object-pool feature parity with SoA.** _Parked — secondary tier._ Blessed (Decision #4). Invest only where use cases demand (hit testing, per-particle interaction), not wholesale.

- **Sort-key production.** _Parked — blocked on split._ Blessed (Decision #3). `sortParticlesByAge`/`sortParticlesByDistance` producing sorted index arrays. Design the API after the sim/node boundary is clear.

- **Sub-emitters / nested effects.** _Parked — breaking payload widening._ Blessed (Decision #5). On-death / on-collision child emitters. Needs `(x, y, vx, vy, index)` callback signature, `'collision'` hook, config-level child-emitter references.

- **Exhaustive collision response.** _Parked — larger than a sweep._ `kill`/`bounce`/`stick`/`slide` per collider. The collision-event half feeds sub-emitters.

- **`particles-formats` field mapping for new config fields.** _Parked — cross-package._ Belongs to a `particles-formats` session.

- **Arbitrary path/polygon spawn shapes, spline/orbit forces.** _Parked — cross-package geometry dependency._

- **Rust `flighthq-particles` crate.** _Parked — global posture._ TS leads, Rust follows. Strong early target after the split lands.

## Approved

- [2026-07-02 · picked] Sweep items 1–5: spawnOffset status, field order, deterministic-replay test, edge spawn doc, spawn shape type alignment
