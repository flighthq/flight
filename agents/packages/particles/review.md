---
package: '@flighthq/particles'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/particles.md
  - reviews/maturation/depth/particles.md
  - source
  - changes.patch
  - charter.md
---

# particles — Review

Evidence: `incoming/builder-67dc46d64/head/packages/particles/` + `changes.patch`. Findings reference `67dc46d64:<path>`; line numbers drift, so snippets are quoted. This is the first `review.md` for particles — the prior `assessment.md` was a "direction-first" pass written off the worker report with no review behind it, and is being overwritten from this survey. The charter is **blessed** (`lastDirection: 2026-06-24`) and unusually substantive, so this review judges against it directly, not the AAA fallback.

## Verdict

`solid — 82/100`. The simulation engine is genuinely deep and is now materially further along than its own status doc claims — that doc is stale (it describes a Bronze pass to ~86; the code has already absorbed most of the maturation roadmap's _Silver_ set). Against the blessed charter the core is excellent: deterministic SoA, allocation-explicit opt-in buffers, data-descriptor forces/colliders. The score is held below the worker's self-estimate by three real tensions, all charter-relative rather than defects in isolation: (1) the package is **not** the "pure, headless value-leaf" the North star names — it imports `@flighthq/sprite` and `@flighthq/node` and its `ParticleEmitter` _is_ a `DisplayObject`, so the first Open direction is effectively resolved-in-code toward "fused" while the charter still leans "keep it pure"; (2) the object-pool path has fallen behind the SoA path on every feature added this pass (a widening symmetry gap); (3) the closed-union fork (fork B) has been _settled closed_ in a type-file comment that the charter's Open directions still treat as "revisit later." None of these are bugs; they are places the code and the just-blessed charter disagree, which is exactly the highest-value thing a review surfaces.

## Present capabilities (verified against source)

The depth review's inventory (dual SoA + object-pool backends, forces, colliders, over-lifetime curves, prewarm, world-space trails, validation/normalization) all still holds. What this pass adds — verified present in source, and going **well beyond** what `status.md` claims:

**Spawn shapes** (`spawnShape.ts`). `computeParticleSpawnOffset(config, state, baseAngle)` centralizes all seven shapes — `point`, `circle`, `ring` (annulus with `emitterInnerRadius`), `rect` (with perimeter-only `emitFromEdge`), `line` (`emitterLineX2/Y2`), `cone` (`emitterArc` half-angle), `edge` — shared by `updateParticleEmitter`, `emitParticleBurst`, and `updateParticleObjects`. The extraction is correct and kills the triple-duplication the status doc flags. **Note** this function is `export`ed (via `export * from './spawnShape'` in `index.ts`, present in `dist/spawnShape.d.ts`) despite the status doc calling it "new internal helper, not exported." It is part of the public surface.

**Spawn-position physics** (`updateParticleEmitter.ts`). Radial/tangential acceleration relative to a stored per-particle spawn origin (`spawnOrigins`, allocated only when `hasRadialTangential`); `orientToVelocity` (`atan2(vy,vx) + rotationOffset`); angular dynamics (`angularAcceleration` + `angularDrag`, over an opt-in `angularVelocities` buffer); non-uniform scale (`scaleAspect`, `stretchByVelocity`, over an opt-in `scaleYs` buffer). Dead-particle compaction correctly swap-with-lasts every parallel array including the new opt-in ones (guarded by `spawnOrigins.length > liveCount*2` etc.).

**Color over lifetime** (`curve.ts` + `updateParticleEmitter.ts`). Beyond the prior alpha/scale/RGB LUTs: a 4-stride **RGBA gradient** (`rgbaCurve`, `buildParticleRgbaCurve`, `sampleParticleRgbaCurve`, `particleRgbaCurveFromKeyframes`/`ToKeyframes`) that supersedes the separate alpha+color paths, and an **HSV interpolation** option (`colorInterpolation: 'hsv'`, `lerpHsvDirect`/`lerpHsvInPlace`, shorter-arc hue handling). The RGBA path uses a module-level `rgbaScratch` tuple — no per-particle allocation in the hot loop.

**Emission timing** (`updateParticleEmitter.ts`). `spawnRateCurve` modulates the rate by normalized emitter age, and a full **burst schedule** (`burstSchedule: ParticleBurstSchedule`, an array of `{time, count, cycles, interval}`) fires timed, cycle-limited bursts with lazily-grown `burstScheduleCycles`/`burstScheduleTimers` state arrays.

**Forces** (`applyParticleForces.ts`). The descriptor set grew to seven: the prior Wind/Drag/Attractor/Vortex/Turbulence plus **`CurlNoiseForce`** (divergence-free, finite-difference curl of value noise) and **`PointGravityWellForce`** (inverse-square with `minRadius` softening and a `repulse` flag). All deterministic, all opt-in via the same pass.

**Signals** (`particleEmitterSignals.ts`). `enableParticleEmitterSignals(state)` / `getParticleEmitterSignals(state)` attach a `ParticleEmitterSignals` group (`onParticleSpawn`/`onParticleDeath`/`onEmitterComplete`) to a per-emitter state via a module-symbol slot — opt-in, zero cost until enabled, honoring the `enable*` convention. `updateParticleEmitter` fires them when present (`signals?.onParticleDeath.emit(dx, dy)`, `signals.onParticleSpawn.emit(...)`, `onEmitterComplete.emit()`), parallel to the strict `callbacks` path.

**Convenience** (`stepParticleEmitter.ts`). `stepParticleEmitter` / `stepParticleObjects` fold `applyForces → update → applyCollisions` into one call (guarding the empty forces/colliders case), turning the JSDoc-only ordering contract into a function while keeping the three primitives exported.

**Validation** (`validateParticleEmitterConfig.ts`). `NUMERIC_FIELDS`/`NON_NEGATIVE_FIELDS` tuples extended for every new field (`satisfies readonly (keyof ParticleEmitterConfig)[]` keeps them exhaustive), plus new rules: `emitterInnerRadius ≤ emitterRadius`, `angularDrag ∈ [0,1]`, per-stride curve checks for `rgbaCurve` (4) and `spawnRateCurve` (1). `normalizeParticleEmitterConfig` clamps the new fields and drops non-finite curves.

**Tests.** 199 `it`/`test` cases across 14 `*.test.ts` files (status claims 166; the count grew further). Every exported function has a colocated test file; `describe` blocks mirror exports.

## Gaps (vs the charter's named scope + the AAA target)

- **Object-pool path is feature-frozen behind SoA.** `ParticleObjectsState` (`67dc46d64:types/src/ParticleObjectsState.ts`) carries only the original buffers — no `spawnOrigins`, `angularVelocities`, `scaleYs`, `burstSchedule*`. `updateParticleObjects` supports spawn shapes + `orientToVelocity` but **not** radial/tangential, angular dynamics, non-uniform scale, RGBA/HSV color, spawn-rate curve, burst schedule, or signals. The two backends were "coherent and symmetric" in the depth review; this pass widened them apart. Either the pool path is a deliberately thinner tier (then say so) or it is now an under-maintained second surface.
- **Sub-emitters / nested effects** — still absent, still the headline missing feature. The `ParticleEmitterCallbacks`/`ParticleEmitterSignals` spawn payload is `(x, y, vx, vy)` (signals) / `(x, y)` (callbacks) — neither carries the particle `index` the roadmap's sub-emitter design needs, and there is no `'collision'` hook. Correctly parked as a breaking design decision in the charter.
- **No render-order / sort key.** No `sortMode`, no `getParticleSortOrder`. SoA compaction reorders by liveness, not a stable draw key. Charter names "sort-order production" as in-scope but the producer does not exist.
- **No deterministic-replay test.** The North star's #1 property (same seed → identical buffers) is relied on throughout but never asserted by a committed test. The engine _is_ deterministic via the injected `RandomSource`; the guard is missing, not the property.
- **`'edge'` shape is a redundant alias.** `case 'edge'` in `spawnShape.ts` is "spawn on the circumference of a circle of `emitterRadius`" — exactly `'circle'` with `emitFromEdge: true`. Two spellings for one behavior is an API-shape smell (one of the seven shapes is not a distinct shape).
- **Collision response is single-mode.** Reflect-with-restitution/friction only; no `kill`/`bounce`/`stick`/`slide` per collider, no `CapsuleCollider`/polygon collider, no per-particle collision events. AAA gap, correctly Gold-tier.
- **No GPU/compute backend seam.** All CPU. The charter names a swappable backend "behind the same buffers" as the North star's CPU-first clause; the seam type does not yet exist.
- **No Rust crate.** `crates/flighthq-particles` does not exist; the charter's `crate:` front matter names it and the codebase-map marks particles a strong early Rust mixing target.

## Charter contradictions

This is the most load-bearing section for particles, because the charter is blessed and specific.

- **North star "pure, headless, fingerprintable value-leaf" vs. the code's DisplayObject coupling.** The charter's #1 North star calls particles "a property to protect: it is the first Rust mixing/conformance target (buffer-in/buffer-out, no GPU, **no scene graph**)." But `ParticleEmitterData extends DisplayObjectData` and `ParticleEmitterRuntime extends DisplayObjectRuntime` (`67dc46d64:types/src/ParticleEmitter.ts`), and `updateParticleEmitter` imports `reserveParticleEmitter` from `@flighthq/sprite` and `invalidateNodeLocalBounds` from `@flighthq/node` (`67dc46d64:packages/particles/src/updateParticleEmitter.ts:1-2,352,506`), so `package.json` depends on both. The renderable node is **already fused into this package**, not held out as a leaf. The charter frames sim-vs-node as the first **Open direction** with a "lean: keep `particles` pure" — but the code has already taken the _opposite_ branch. This is not a bug, it is the single most important thing to reconcile: the charter's lean and the code's reality point in opposite directions, and the "value-leaf" / "no scene graph" / "first mixing target" properties the North star promises are **not true of the package as shipped** (the SoA _math_ is leaf-like, but the package as a whole pulls in the graph). Either the charter's North star softens, or the package is split (the sim-math leaf vs. the `ParticleEmitter` display node).
- **Fork-B framing: code settled it, charter still defers it.** `ParticleForce.ts` now carries a comment that the closed union is "**not provisional; it is a settled choice** … the types-layout spec permits closed discriminated unions for hot, finite, per-frame families." The charter's Open directions still list "Open forces/colliders to a registry _(parked 2026-06-24)_ … The type files already flag this. Revisit later." The code's comment now asserts the _opposite_ of "flagged for a later registry move." The two should agree: either promote the settled-closed decision into the charter's Decisions (with the per-frame-hot-loop rationale) and drop the Open direction, or soften the type comment back to "deferred." As written they contradict.
- **Everything else matches.** Determinism via `RandomSource`, allocation-explicit opt-in buffers (`spawnOrigins`/`angularVelocities`/`scaleYs` grown only when their feature flag is set — exactly the "a feature an emitter does not use costs it nothing" clause), and plain-data forces/colliders applied by named passes all honor the North star precisely. The boundary "does not parse authoring formats (that's `particles-formats`)" holds — no format code here.

## Contract & docs fit

**Lives up to the contract:** full unabbreviated names throughout (`computeParticleSpawnOffset`, `ensureParticleEmitterStateCapacity`, `sampleParticleRgbaCurve`); `out`-param + offset hot-loop samplers (`sampleParticleColorCurve(out, offset, lut, t)`); sentinel returns (`getParticleEmitterSignals` → `null`, `isParticleEmitterComplete` → `false`); types-first — every shared type (`ParticleForce`, `ParticleBurstSchedule`, `ParticleEmitterSignals`, `RgbaKeyframe`, the config/state interfaces) lives in `@flighthq/types`, the package files only re-export them; single `.` export; `sideEffects: false`; opt-in `enable*` for signals (no top-level registration). Good hygiene.

**Defects / candidate revisions:**

- **`computeParticleSpawnOffset` public/internal mismatch.** It is exported but documented as internal in `status.md`. Decide and align: make it module-internal (drop from `index.ts`'s `export *` reach, or move to a non-barrelled file) or bless it as intentional public API. Today the surface and the intent disagree.
- **`createParticleEmitterConfig` field order is not alphabetized** (`67dc46d64:particleEmitterConfig.ts`): `rgbaCurve`/`scaleCurve`/`scaleAspect`/`spawnRateCurve`/`duration` are interleaved out of order, and `colorEnd*`/`colorStart*` sit below unrelated fields. This is object-literal key order, not exported- function order, so `npm run order` will not catch it, but the source-style "keep it scannable" intent applies. Minor.
- **Signal payload arity is asymmetric and may be premature.** `onParticleSpawn` carries `(x,y,vx,vy)` while `onParticleDeath` carries `(x,y)` and neither carries the particle `index`. The sub-emitter Open direction wants `(x,y,vx,vy,index)`. Since the signal payloads are a public type in `@flighthq/types`, settling sub-emitters will _re-break_ these — worth noting that the signal payload shape is entangled with that deferred decision and is not yet final.
- **Package Map line is stale (the live tree's, not the bundle's).** The live `agents/index.md` particles line lists only `updateParticleEmitter`, `emitParticleBurst`, `prewarmParticleEmitter`, forces, colliders, and three curve helpers — it predates spawn shapes, `stepParticleEmitter`, signals, RGBA/HSV, burst schedules, and the seven-shape set. The **bundle's** copy of the map is already updated to the richer description, so this is a live-doc lag, not a real drift — candidate sync for the Package-Map owner. (The bundle map also already lists `@flighthq/particles-formats` as a built neighbor.)
- **`crate: flighthq-particles` named but unbuilt** — accurate as an intent marker, but the crate does not exist; not a contract violation (the front-matter allows naming the planned mirror), just a status fact for the conformance map.

## Candidate open directions (to refine the already-blessed charter)

1. **Reconcile the North star with the DisplayObject reality.** The charter leans "keep `particles` pure" but the code has fused the `ParticleEmitter` display node and depends on `sprite`/`node`. Decide: (a) soften the North star to "sim core + its renderable node, co-located," accepting that particles is _not_ a pure mixing leaf; or (b) split a pure `particles` sim-math leaf from the `ParticleEmitter` display node (which would live in the node/sprite layer), restoring the value-leaf property. This is the package's defining unresolved question and the code currently answers it the way the charter says it leans _against_.
2. **Promote or retract the fork-B ruling.** The type-file comment says closed-by-design is settled; the charter says revisit-later. Pick one and make the charter's Decisions and the type comment agree.
3. **Is the object-pool path a thin tier or a full peer?** Define whether the pool path is meant to track SoA feature-for-feature (then it owes radial/tangential, angular, non-uniform scale, RGBA, bursts, signals) or is a deliberately minimal alternative (then document the asymmetry as intended).
4. **Sort-key ownership.** The charter names "sort-order production" in-scope but it is unbuilt, and the consumer (`getParticleSortOrder` → renderer) is the cross-package touchpoint coupled to direction #1.
5. **Sub-emitter callback/signal payload shape.** Widening to `(x,y,vx,vy,index)` + a `'collision'` hook is a breaking reshape of public `@flighthq/types` signal/callback types — settle the payload before more callers depend on the current `(x,y)` / `(x,y,vx,vy)` forms.
6. **GPU/compute backend seam shape** (`ParticleSimulationBackend`), designed jointly for CPU/WebGPU/Rust-wgpu — the North star's CPU-first clause implies it but it does not exist.

## Notes for status verification (as-claimed → verified)

The status doc is **materially stale and under-claims the code**. It reports an "estimated new score 86" off a Bronze pass (spawn shapes, radial/tangential, orient-to-velocity, `stepParticleEmitter`, `sampleParticleColorCurve` typing) and lists RGBA/HSV, angular dynamics, non-uniform scale, burst schedule, spawn-rate curve, curl-noise/point-gravity-well forces, and signals as **deferred Silver/Gold items** — yet all of those are present and tested in the source (`updateParticleEmitter.ts`, `curve.ts`, `applyParticleForces.ts`, `particleEmitterSignals.ts`). Test count is 199, not the claimed 166. The status's own "concern #1" (changed `ensureParticleEmitterStateCapacity` signature) is real but understated — it now takes four optional flags, not one. Concern about `computeParticleSpawnOffset` being "not exported" is **wrong**: it is exported. Treat the status doc as a lower bound on what landed, not an accurate inventory; this review supersedes it.
