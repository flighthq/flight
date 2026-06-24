---
package: '@flighthq/particles'
updated: 2026-06-24
basedOn: ./review.md
---

# particles — Assessment

Sorted from `review.md` (score `solid — 82`), which **supersedes** the prior direction-first assessment. That prior pass was written off the worker's status report with no review behind it, and recommended a batch (RGBA/HSV gradient, burst schedule, non-uniform/stretch scale, curl-noise/point-gravity-well forces, angular dynamics, opt-in signals) that the review has now verified is **already built and tested in source** — so those items are removed, not re-recommended. The maturation roadmap (`reviews/maturation/depth/particles.md`) is likewise mostly absorbed: nearly all its Bronze and most of its Silver set landed this pass. What remains genuinely sweep-safe is small; the package's defining questions (sim-vs-node split, fork-B ruling, pool-path tier, sort key, sub-emitters) are all charter decisions or cross-package, routed to Open directions below.

## Recommended

Strictly sweep-safe: within `@flighthq/particles`, no cross-package coupling, no breaking change, no open design decision.

- **Resolve `computeParticleSpawnOffset`'s public/internal status.** It is `export`ed via `index.ts`'s `export * from './spawnShape'` (present in `dist/spawnShape.d.ts`) but documented as a "new internal helper, not exported" in `status.md`. Either make it module-internal (drop it from the barrel's reach) or bless it as intentional public API and fix the stale note. A within-package surface-hygiene fix, no behavior change. — review.md (Contract & docs fit, defect 1).

- **Alphabetize `createParticleEmitterConfig`'s returned object fields.** `rgbaCurve`, `scaleCurve`, `scaleAspect`, `spawnRateCurve`, `duration`, and the `colorStart*`/`colorEnd*` block are interleaved out of order (`particleEmitterConfig.ts`). `npm run order` won't catch object-literal key order, so it must be done by hand. Pure source-style cleanup. — review.md (Contract & docs fit, defect 2).

- **Add a committed deterministic-replay test.** Assert that two `createParticleEmitterState(seed)` runs of the same `stepParticleEmitter` sequence produce byte-identical SoA buffers. The engine is already deterministic via the injected `RandomSource`; this guards North-star #1, which nothing currently enforces. Within-package, no design decision. — review.md (Gaps: "No deterministic-replay test"; North star #1).

- **Collapse or document the redundant `'edge'` spawn shape.** `case 'edge'` is identical to `'circle'` with `emitFromEdge: true` (`spawnShape.ts`). Either remove `'edge'` from `ParticleEmitterShape` (one fewer redundant member) or add an in-source note explaining why both spellings exist. _Note:_ removing the member touches the `@flighthq/types` union and the `particles-formats` shape mapping, so the removal variant is **not** purely within-package — only the in-source documentation variant is fully sweep-safe. Prefer the doc note unless the union edit is explicitly approved. — review.md (Gaps: "`'edge'` shape is a redundant alias").

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Object-pool feature parity with SoA** (radial/tangential, angular dynamics, non-uniform scale, RGBA/HSV color, spawn-rate curve, burst schedule, signals on `updateParticleObjects` + `ParticleObjectsState`). **Parked:** whether the pool path is a full peer or a deliberately thin tier is an open question (Open direction #3) — building parity before that is decided risks doubling a surface the charter may want minimal. Routed to Open directions.

- **Render-order / sort key** — `sortMode` + `getParticleSortOrder(state, out, cameraX, cameraY)`. **Parked:** the order is produced here but consumed by the particle draw node; coupled to the sim-vs-node Open direction (#1) and a cross-package consumer signature. Settle #1 first.

- **Sub-emitters / nested effects** — death bursts, trails-of-trails, spawn-on-collision. **Parked:** requires the breaking payload widening (`onSpawn`/`onDeath` → `(x,y,vx,vy,index)`) and a `'collision'` hook, plus a sub-emitter ownership-model decision. A blessed Open direction in the charter already.

- **`particles-formats` field mapping** for the new config fields (`radialAcceleration`, `tangentialAcceleration`, `emitterInnerRadius`, `angularDrag`, `scaleAspect`, `rgbaCurve`, …). **Parked:** cross-package — belongs to a `particles-formats` session (Particle Designer maps several of these 1:1, so it is near-trivial but not in this package).

- **GPU/compute simulation backend seam** (`ParticleSimulationBackend` in `@flighthq/types`). **Parked:** a cross-package `*Backend` design decision that must be shaped jointly for CPU/WebGPU/Rust-wgpu; an Open direction, not a sweep.

- **Exhaustive collision response** (`kill`/`bounce`/`stick`/`slide` per collider, `CapsuleCollider`, polygon collider, per-particle collision events). **Parked:** larger than a sweep; the collision-event half feeds sub-emitters (gated on that Open direction).

- **Arbitrary path/polygon spawn shapes; spline/orbit forces.** **Parked:** cross-package dependency on a `@flighthq/geometry` path/spline type.

- **Rust crate `flighthq-particles`.** **Parked:** does not exist; a strong early Rust target but it should follow the sim-vs-node split (#1) and the fork-B ruling (#2) so the port mirrors the final shape, not an intermediate one. Conformance-map item.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is blessed and already lists most of these; the review found the code has _moved against_ two of them, which makes reconciling them the priority:

1. **Sim-vs-node split — the code already chose "fused," opposite the charter's lean.** `ParticleEmitter` extends `DisplayObject` and the package depends on `sprite`/`node`, so the North star's "pure value-leaf / no scene graph / first Rust mixing target" is **not true as shipped**. Either soften the North star to "sim core + co-located renderable node" or split a pure sim-math leaf from the `ParticleEmitter` display node. This is the package's defining unresolved question.
2. **Fork B — promote or retract the closed-union ruling.** `ParticleForce.ts`'s comment now calls the closed union "a settled choice, not provisional"; the charter's Open directions still say "revisit later." Make them agree (promote to charter Decisions with the hot-per-frame-loop rationale, or soften the comment).
3. **Object-pool path: full peer or thin tier?** Decide before any parity work, so the pool surface is either completed deliberately or documented as intentionally minimal.
4. **Sort-key ownership** (cross-package consumer signature) — coupled to #1.
5. **Sub-emitter callback/signal payload shape** — `(x,y,vx,vy,index)` + `'collision'` hook is a breaking reshape of public `@flighthq/types` signal/callback types; settle it before more callers bind to the current forms.
6. **GPU/compute backend seam** (`ParticleSimulationBackend`), designed jointly for CPU/WebGPU/Rust-wgpu.
