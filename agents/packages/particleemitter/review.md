---
package: '@flighthq/particleemitter'
status: solid
score: 76
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source (packages/particleemitter/src, live tree)
  - packages/types/src/ParticleEmitter2D.ts
  - packages/types/src/ParticleEmitter3D.ts
  - packages/types/src/ParticleEmitterCallbacks.ts
---

# Review: @flighthq/particleemitter

Re-review over the live tree. Prior review (2026-07-21, solid/74) measured the state shortly after the unified 2D/3D package landed. Since then, the status was re-verified (2026-08-08) with all four Open items confirmed still holding. No source-file commits changed since the prior review. The score nudges up by 2 because the prior review's observation that "the status still claims extraction has not occurred" is now resolved -- the status accurately reflects reality, and the re-verification cleaned up residual stale claims.

## Verdict

**solid -- 76/100.** The package delivers on its charter identity as the display-object composition layer for particles, with parallel 2D and 3D emitter entities, explicit burst/update/step/prewarm operations, capacity-managed SoA buffers, deterministic simulation, and scene-node participation. The 3D path is genuinely z-aware -- sphere/cone3d/box spawn volumes, z gravity/velocity integration, AABB bounds, world/local-space baking via the emitter node's 4x4 world matrix, trail interpolation, velocity inheritance, and an allocation-free camera-depth sorting atom. The `@flighthq/particles` dependency provides the pure sim (forces, colliders, curves, state, signals); this package consumes it without leaking scene-graph types back.

The bounded gaps are the same as the prior review and the status's Open items: `stepParticleEmitter3D` casts to `ParticleEmitter2D` to reuse 2D-typed force/collision primitives, `sortParticleEmitter3DIndicesByViewDepth` has zero external consumers, no DOM renderer exists for `ParticleEmitter2D`, and no render-mode concept (stretched, mesh, ribbon, point) exists in the SDK. These are enumerated depth gaps, not architectural holes.

## Present capabilities (verified in source)

- **Entity/data surface** (`particleEmitter.ts`, 387 lines; `particleEmitter3D.ts`, 374 lines): `createParticleEmitter2D`/`3D` constructing entity-backed scene nodes with `ParticleEmitterData` (shared SoA typed-array structure: `transforms` [x,y,rot,scale stride-4], `positionsZ`, `alphas`, `colors` [r,g,b stride-3], `ids`, `velocities`, `worldSpace`, `atlas`). `createParticleEmitterData` factory with defaults. Capacity management via `reserveParticleEmitter2D`/`3D` and `getParticleEmitter2DCapacity`/`3DCapacity` (minimum across all per-particle storage lanes, including `positionsZ`, `colors`, and `velocities` for 3D). Append, set, remove (swap-remove O(1)), compact (stable-order sentinel removal), clear, and clone operations. Per-particle getters/setters for alpha, color, velocity, and id with bounds-checking and sentinel returns (-1 or false).

- **2D local bounds** (`particleEmitter.ts:134-195`): `computeParticleEmitter2DLocalBoundsRectangle` computing an out-parameter AABB over rotated+scaled particle quads from atlas regions. `setParticleEmitter2DLocalBoundsRectangle` storing a cached rectangle on the runtime and invalidating node local bounds. Runtime method table wires `computeLocalBoundsRectangle` to the cached rect.

- **3D local bounds** (`particleEmitter3D.ts:114-153`): `computeParticleEmitter3DLocalBoundsAabb` computing a conservative AABB expanding each particle center by a billboard radius (`SQRT1_2 * |scale|`).

- **3D view-depth sorting** (`particleEmitter3D.ts:306-373`): `sortParticleEmitter3DIndicesByViewDepth` -- allocation-free, caller-owned `Uint32Array` indices and `Float64Array` depths. Applies a caller-supplied stored-position-to-view matrix (view matrix for world-space data, view * emitter-world for local-space). In-place heap sort on view Z ascending (back-to-front for right-handed camera). Stable for equal depths via source-index tiebreaker. Returns false without touching outputs when arrays are undersized or particle storage is incomplete.

- **Type guard** (`particleEmitter3D.ts:204-206`): `isParticleEmitter3D` narrowing on `ParticleEmitter3DKind`.

- **2D update loop** (`updateParticleEmitter2D.ts`, 538 lines): Full frame update -- world-space flag sync, emitter velocity derivation, Phase 1 (age, gravity integration, velocity/position update, alpha/color/scale interpolation with curves, rotation speed, flipbook frame advance, swap-remove dead particles with death callbacks/signals), Phase 2 (spawn accumulation, burst scheduling, all 6 spawn shapes including sphere/cone3d/box, world-space baking through 2D world matrix, trail interpolation, velocity inheritance, spawn callbacks/signals). Sim velocity mirrored to data velocities (stride-3 to stride-2 copy). `isParticleEmitter2DComplete` for finite non-looping emitter detection. `onEmitterComplete` signal on completion.

- **3D update loop** (`updateParticleEmitter3D.ts`, 495 lines): Parallel structure to 2D with 3D-specific: `getNodeWorldMatrix4`/`getNodeLocalMatrix4` for world-space baking through full 4x4 matrix (rotation+scale on upper 3x3, translation via matrix[12..14]), 3D velocity inheritance, 3D trail interpolation (`prevPathZ`), z-aware gravity, 3D death callback position (`positionsZ[i]`), 3D spawn signal with full (x,y,z,vx,vy,vz), stride-3 velocity mirroring (same stride, direct copy).

- **Burst emission** (`emitParticleBurst2D.ts`, 173 lines; `emitParticleBurst3D.ts`, 274 lines): `emitParticleBurst2D`/`3D` for immediate spawning at arbitrary positions, independent of the emitter's spawn rate. Sub-emitter building block (tested via `onDeath` composition). Tint support (packed 0xrrggbbaa) modulating config-derived spawn color and alpha. 3D-specific: sphere/cone3d/box spawn volumes with Marsaglia uniform sphere, Rodrigues rotation for cone direction, cubic-root radius for volume-uniform sphere offset.

- **Step convenience** (`stepParticleEmitter2D.ts`, 47 lines; `stepParticleEmitter3D.ts`, 34 lines): `stepParticleEmitter2D`/`3D` folding forces-update-collisions into one call. The three primitives remain separately exported for custom interleaving.

- **Prewarm** (`prewarmParticleEmitter2D.ts`, 25 lines; `prewarmParticleEmitter3D.ts`, 22 lines): `prewarmParticleEmitter2D`/`3D` fast-forwarding emitter state by repeated sub-stepping. Safe against zero step (falls back to single step). Accepts callbacks.

- **Export lanes**: `.` (`index.ts`) re-exports 49 named symbols plus `ParticleEmitterCallbacks` as a type-only re-export; `./contract` (`contract.ts`) barrel re-exports all 10 source modules. Two blessed lanes, no additional subpaths. `sideEffects: false`.

- **Dependencies**: `particles` (sim), `scene2d`, `scene3d`, `geometry`, `node`, `types`. `devDependencies`: `math` (for `createRandomSource` in tests). Charter-declared set, verified in package.json.

- **Tests**: 12 test files (10 colocated `*.test.ts` + `deterministic.test.ts` + `updateParticleEmitter2DIntegration.test.ts`). Total ~1,450 lines of test code across ~130 cases. Coverage includes: entity operations (append/remove/compact/clear/clone/reserve/get/set), bounds computation (2D rectangle, 3D AABB, empty/single/multi-particle/out-of-range), capacity (lane minimum, short-lane repair), view-depth sorting (back-to-front stability, matrix application, undersized rejection, incomplete storage rejection), spawn shapes (point/circle/rect/sphere/box), spawn rate/burst/maxParticles/accumulation, lifetime aging/death, gravity/velocity integration, alpha/color/scale interpolation, rotation speed, flipbook, world-space baking (2D and 3D), trail interpolation, velocity inheritance, deterministic replay (seeded, byte-identical), prewarm, callbacks (onSpawn/onDeath), signals (onParticleSpawn/onParticleDeath/onEmitterComplete), tint composition, sub-emitter integration (death-triggered burst), force/collision integration, lifetime curves, config normalization.

## Gaps (vs charter + AAA)

1. **3D forces and collisions use a 2D-typed cast.** `stepParticleEmitter3D.ts:25` casts `emitter as unknown as ParticleEmitter2D` to call `applyParticleForces`/`applyParticleCollisions`. The force/collider functions in `@flighthq/particles` are typed against `ParticleEmitter2D` but only access `emitter.data`, which both 2D and 3D share. Forces and colliders have no z-axis behavior -- confirmed by status.md. A proper fix requires `@flighthq/particles` to accept `ParticleEmitterData` or a shared base type.

2. **`sortParticleEmitter3DIndicesByViewDepth` has zero external consumers.** Exported and tested (4 test cases), but a repo-wide search confirms no caller outside this package's own tests. Both 3D render backends draw in buffer order (status.md, confirmed).

3. **No DOM renderer for `ParticleEmitter2D`.** Canvas, WebGL, and WebGPU each carry a renderer (`scene2d-canvas`, `scene2d-gl`, `scene2d-wgpu`); `scene2d-dom` does not reference the kind anywhere.

4. **No render-mode concept.** No `renderMode` field on emitter config in `@flighthq/types`. The 3D path is camera-facing billboards only (no stretched, horizontal, mesh, ribbon, or point alternatives).

5. **Missing `isParticleEmitter2D` type guard.** `isParticleEmitter3D` exists and is exported/tested; no `isParticleEmitter2D` counterpart exists anywhere in the package. Asymmetry.

6. **Duplicated internal helpers.** `clamp01` is independently defined in 4 files (`emitParticleBurst2D.ts`, `emitParticleBurst3D.ts`, `updateParticleEmitter2D.ts`, `updateParticleEmitter3D.ts`). `rotateToDirection` (Rodrigues rotation + shared `_rot` tuple) is independently defined in 3 files (`emitParticleBurst3D.ts`, `updateParticleEmitter2D.ts`, `updateParticleEmitter3D.ts`). `PARTICLE_TRANSFORM_STRIDE` is independently declared in 5 files. These are file-private by design (no subpath exports), but a drift between copies would silently corrupt the simulation. The `_rot` module-global mutable tuple is safe in single-threaded JS but would not port to multi-threaded C/C++ without care.

7. **No raster functional tests.** No functional scene proves camera-facing orientation, depth ordering, world/local behavior, culling, dense updates, or backend parity. All testing is unit-level against the SoA data.

8. **No guard module.** No `enableParticleEmitterGuards` seam for diagnostics (e.g., out-of-range warnings, missing atlas). Silent sentinels (-1, false) have no `explain*` counterpart.

## Charter contradictions

**None.** The package aligns with its charter on all points: the `ParticleEmitter` node is the permanent home (not `sprite`); the sim/node split is clean (`particles` has no `sprite` dependency); 2D and 3D coexist in one package per the unified decision (2026-07-15); dependencies match the charter-declared set. The status Open items accurately describe the live source.

## Contract & docs fit

**Satisfies the contract.** All shared types in `@flighthq/types` (package exports functions only). Full unabbreviated function names (`appendParticleEmitter2DParticle`, `computeParticleEmitter3DLocalBoundsAabb`, `sortParticleEmitter3DIndicesByViewDepth`). Out-params with out-first ordering. Sentinels for expected failures (-1, false), not throws. Two blessed export lanes, no additional subpaths. `sideEffects: false`. Opt-in signals via `enableParticleEmitterSignals` (in `particles`). `Readonly<T>` on input parameters. Explicit allocation verbs (`create*`, `clone*`, `reserve*`). The `ParticleEmitterCallbacks` type re-export from `index.ts` uses the proper `export type` line, avoiding the ESM binding trap.

**Minor notes:**
- (a) `createParticleEmitter3D` uses `as unknown as ParticleEmitter3D` in its return path because `createNode3D` returns `Node3D` and `ParticleEmitter3D` extends it with `data` and `blendMode` fields that are assigned after construction. This is a documented pattern for entity creation but the double cast is wider than necessary -- the comment "createNode3D returns Node3D, data/blendMode assigned below" would satisfy the `as unknown as X` naming rule.
- (b) `PARTICLE_EMITTER_DELETED_ID` (0xffff) is exported from `particleEmitter.ts`; `PARTICLE_EMITTER_3D_DELETED_ID` (also 0xffff) is exported from `particleEmitter3D.ts`. Both are the same value; a single shared constant would be cleaner.

## Candidate open directions

1. **Lift 3D forces/collisions out of the 2D cast.** Widen `applyParticleForces`/`applyParticleCollisions` in `@flighthq/particles` to accept `ParticleEmitterData` (or a `{ data: ParticleEmitterData }` interface), eliminating the `as unknown as ParticleEmitter2D` cast and enabling genuine z-axis force/collider behavior.
2. **Separable render modes.** Billboard, stretched billboard, mesh, ribbon/trail, and point modes registering independently per backend so a basic quad emitter does not pull every mode into its bundle.
3. **Sort-index consumption.** Settle the contract for how `sortParticleEmitter3DIndicesByViewDepth` output reaches the renderers -- a draw-order parameter on the submit path, or a renderer-side sort.
4. **Raster functionals.** Prove camera-facing orientation, world/local behavior, depth ordering, bounds/culling, and GL/WGPU parity once the render contract settles.
5. **Guard module.** `enableParticleEmitterGuards` emitting diagnostics for missing atlas, out-of-range region ids, capacity mismatches, and other silent-sentinel conditions.
6. **Deduplicate internal helpers.** Extract `clamp01` and `rotateToDirection` into a shared file-private module to prevent drift. Consider exporting `PARTICLE_TRANSFORM_STRIDE` from a single location.
