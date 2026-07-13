---
package: '@flighthq/particles'
status: solid
score: 73
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-06-24, bundle-based)
  - assessment.md
  - source (packages/particles/src, live tree)
  - packages/particleemitter/src (boundary verification)
  - packages/types/src Particle* type files
  - git log since 2026-06-20
---

# particles — Review

Live-tree survey (rereview; prior review 2026-06-24 scored solid/82 against the `builder-67dc46d64` **bundle**). Critical context first: the feature set that review measured — seven spawn shapes, curl-noise/gravity-well forces, RGBA/HSV color wiring, burst schedule, radial/tangential acceleration, angular dynamics — is **not in the live tree**. The 2026-06-25 status entry and the `06a0c480 feat: recover lost source` commit confirm the bundle work was lost/never merged; the recovered source is the thinner pre-Bronze shape. This review measures what actually exists.

## Verdict

`solid — 73/100`. The extraction to `@flighthq/particleemitter` is **complete and clean** — the charter's defining contradiction (DisplayObject coupling) is resolved, and particles is now the pure leaf its North star demands (deps: `geometry`, `signals`, `types` only). The primitives that remain are correct, deterministic, allocation-disciplined, and well-tested (101 cases). The score sits below the prior 82 because that number priced in bundle features that never landed: spawn shapes are 3 of the charter's 6, sort-key production is absent, the burst schedule exists only as an orphaned type, and the force/collider sets are the original five/three.

## Extraction verification (the boundary question)

**Complete, boundary clean.** Commit `b62d9808` relocated the node (`particleEmitter.ts` from sprite) and the four loop files (`updateParticleEmitter`/`emitParticleBurst`/`stepParticleEmitter`/`prewarmParticleEmitter`) into particleemitter. Verified: `packages/particles/package.json` depends only on `geometry`/`signals`/`types`; no `sprite`/`node`/`displayobject` import anywhere in `packages/particles/src`; `packages/sprite/src` has zero `ParticleEmitter` references. One deliberate softness remains: `applyParticleForces`/`applyParticleCollisions` still take the `ParticleEmitter` **node type** (type-only, from `@flighthq/types`) and read `emitter.data.transforms` — pure at the dependency level, node-shaped at the signature level. That is exactly the charter-acknowledged Path B open direction (headless `stepParticleSimulation` seam), owned by the particleemitter charter's Open direction 1.

## Approved sweep items (2026-07-02) — did they land?

1. **`computeParticleSpawnOffset` public/internal status** — moot: the helper does not exist in the live tree (bundle-only). Nothing to resolve.
2. **Alphabetize `createParticleEmitterConfig` fields** — **landed** (`particleEmitterConfig.ts` is in strict key order; 2026-06-25 status entry).
3. **Deterministic-replay test** — **landed** (commit `4c9b45b3`); post-extraction it lives in `packages/particleemitter/src/deterministic.test.ts`, asserting byte-identical SoA buffers across two seeded 8-step runs.
4. **`'edge'` spawn shape doc** — moot: no `'edge'` member exists in the live tree.
5. **Spawn shape type alignment** — **vacuously satisfied**: `ParticleEmitterShape = 'point' | 'circle' | 'rect'` and the source handle exactly those three, so type and implementation agree — but by shrinkage, not the widening the charter's Boundaries intend (`point, circle, ring, rect, line, cone`). The breadth gap is open, the alignment defect is not.

## Present capabilities (verified in source)

- **Forces** (`applyParticleForces.ts`): Wind/Drag/Attractor/Vortex/Turbulence over SoA and object-pool paths; `ForceFalloff` (`linear`/`inverseSquare` with near-source clamp, hard radius cutoff); deterministic hashed value noise (`hash2`/`valueNoise`, smoothstep lattice); shared scratch tuple, zero hot-loop allocation.
- **Colliders** (`applyParticleCollisions.ts`): Plane/Circle/Rectangle, each with `contain`/`exclude` modes (circle/rect), push-out + velocity `reflect` with restitution and tangential friction, separating-velocity guard.
- **Curves** (`curve.ts`): scalar and RGB LUT bake (`buildParticleCurve`/`buildParticleColorCurve`), keyframe round-trip (`particleCurveFrom/ToKeyframes`, color variants), clamped out-param samplers (`sampleParticleCurve`, `sampleParticleColorCurve(out, offset, lut, t)` — out-first per `90979087`), HSV lerp helpers with shorter-arc hue.
- **Config** (`particleEmitterConfig.ts`, `validateParticleEmitterConfig.ts`): canonical-default constructor; `validate*` returning `ParticleConfigIssue[]` and `normalize*` returning a safe copy, both driven by `satisfies`-guarded exhaustive `NUMERIC_FIELDS`/`NON_NEGATIVE_FIELDS` tuples; inverted-range, unit-range, curve-stride, and non-finite checks.
- **State** (`particleEmitterState.ts`, `particleObjectsState.ts`): SoA capacity growth via `reserveFloat32Array`; `colorBirth`/`colorDeath` grown only when `hasColorVariance` — the "a feature you don't use costs nothing" clause honored.
- **Signals** (`particleEmitterSignals.ts`): opt-in `enableParticleEmitterSignals`/`getParticleEmitterSignals` (null sentinel) via module-symbol slot; zero cost until enabled.
- **Object-pool path**: `updateParticleObjects` (spawn/age/gravity/curves/rotation, velocity inheritance, dead-slot reuse), `stepParticleObjects` fold, `isParticleObjectsComplete`.
- **Tests**: 101 cases across 10 colocated files, `describe` blocks mirroring exports.

## Gaps (vs the charter's Boundaries + AAA)

- **Spawn shapes 3 of 6.** `ring`, `line`, `cone` are charter-in-scope and absent from both the type union and the spawn code (the spawn-offset code itself now lives in particleemitter's loop and is duplicated there — see the particleemitter review).
- **Sort-key production absent.** Blessed Decision ("sort-key is the sim's job"); no `getParticleSortOrder`, no `sortMode`.
- **`ParticleBurstSchedule` is an orphaned header type.** Defined and exported from `@flighthq/types` with full JSDoc; no config field references it, no code consumes it.
- **`lerpHsvDirect`/`lerpHsvInPlace` are orphaned exports with a false doc claim** — their JSDoc says "Used by the `colorInterpolation: 'hsv'` path in updateParticleEmitter"; no `colorInterpolation` config field exists and no caller outside their own tests.
- **Force/collider breadth** at the original 5/3; curl-noise and point-gravity-well (charter: "and future force types") were bundle-only.
- **Sub-emitters, exhaustive collision response (`kill`/`bounce`/`stick`/`slide`), GPU seam, Rust crate** — all absent, all correctly parked by blessed Decisions.

## Charter contradictions

Effectively none — the prior review's headline contradiction (impurity) is **resolved in the code's favor of the charter**. The fork-B contradiction is also resolved: the type-file comments ("Closed by design: … registry dispatch would be a measurable cost") now agree with the 2026-07-02 Decision. One text-level drift: the charter's In-scope list still names "prewarm, world-space trails" and "burst scheduling" under particles, but post-Path-A those live in particleemitter's loop — the particles charter predates the extraction detail and should be trued up at the next direction session (candidate revision, not a code defect).

## Contract & docs fit

**Meets the contract**: all shared types in `@flighthq/types` (package files only re-export); full unabbreviated names; out-params with out-first ordering; sentinels not throws (`null`, `false`); single root export; `sideEffects: false`; opt-in `enable*` signals convention; no top-level side effects.

**Candidate revisions**: (a) stale `lerpHsv*` JSDoc (above); (b) orphaned `ParticleBurstSchedule` in the header layer — wire it or remove it; (c) `agents/packages/particles/status.md` is badly stale — its main entry describes the lost bundle world (166 tests, seven shapes) that this tree never had; needs a post-extraction entry; (d) `enableParticleEmitterSignals(state: object)` — the `object` parameter type is looser than the `ParticleEmitterState` it is documented for; (e) `NUMERIC_FIELDS` in `validateParticleEmitterConfig.ts` has `'duration'` misordered before the `colorEnd*` block. The live Package Map line ("headless emitter simulation … a pure sim leaf, the `ParticleEmitter` display node lives in `@flighthq/particleemitter`") is **now accurate** — the prior review's staleness flag is cleared.

## Candidate open directions

1. **Re-land or re-scope the lost bundle features.** The charter's Boundaries were written assuming the Bronze/Silver set existed; the tree reset means shape breadth, extra forces, RGBA/HSV, and burst schedule are all "build again" items. Decide priority order rather than assuming wholesale restoration.
2. **Burst-schedule ownership**: the type is header-layer; consumption would live in particleemitter's loop (or a future `stepParticleSimulation`). Settle where before wiring.
3. **Sort-key buffer seam**: producing sorted index arrays requires reading positions, which today live on the node's `data.transforms` — entangled with the Path B seam; design together.
4. **Signal attachment typing**: whether `enable*Signals` should accept both state types (pool path currently never fires signals) or narrow to `ParticleEmitterState`.
