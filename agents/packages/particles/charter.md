---
package: '@flighthq/particles'
role: package
crate: flighthq-particles
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# particles — Charter

## What it is

`@flighthq/particles` is the **CPU simulation core** for 2D particle effects — emitter state as typed-array SoA (plus a parallel object-pool path), spawn shapes, lifetime and appearance-over-lifetime curves, data-descriptor forces and colliders, deterministic via an injected `RandomSource`. It produces simulation buffers (and a sort order); it does not parse authoring formats (that's `particles-formats`) and it does not own the renderable display-object node (that's `particleemitter`).

The package is a **pure, headless value-leaf** — no scene-graph coupling, no display-object dependency. The current code violates this (2 files import from `sprite`/`node`) but the direction is clear: extract the display-object-specific wiring into `@flighthq/particleemitter`, leaving particles as a clean simulation kernel. This is the same decomposition pattern as timeline/movieclip.

## North star

1. **Deterministic.** Same seed → identical buffers, always (`RandomSource`-injected). The package stays a pure, headless, fingerprintable value-leaf — the first Rust mixing/conformance target (buffer-in/buffer-out, no GPU, no scene graph).
2. **Allocation-explicit.** SoA buffers, opt-in capacity growth, `out`-params in hot loops; a feature an emitter does not use costs it nothing (e.g. `spawnOrigins` allocated only for radial/tangential).
3. **Forces and colliders are plain data descriptors**, applied by passes the caller invokes by name — no hidden per-frame work.
4. **CPU-first.** Any GPU/compute path is a swappable backend behind the same buffers, never a fork of the simulation. The current SoA buffer layout and config-descriptor model should not close the door on a future compute-shader sim.
5. **Sort-key is the sim's job.** The sim owns age, position, distance — it produces sorted index arrays. The renderer reads them; it should not have to re-derive particle properties to sort.

## Boundaries

**In scope:**

- Emitter simulation: SoA typed-array path (primary), object-pool path (secondary tier — invest in parity where use cases demand, not wholesale).
- Spawn shapes: point, circle, ring, rect, line, cone (fix type alignment — currently only 3 in the union).
- Lifetime, appearance-over-lifetime curves, color curves (HSV interpolation).
- Forces: wind, drag, attractor, vortex, turbulence — and future force types.
- Colliders: circle, plane, rectangle — and future collider types.
- Sort-key production: sorted index arrays by age, distance, etc.
- Burst scheduling, prewarm, world-space trails.
- Signals: `onParticleSpawn`, `onParticleDeath`, `onEmitterComplete`.
- Validation: `validateParticleEmitterConfig` / `normalizeParticleEmitterConfig`.
- Deterministic-replay guarantee (same seed = identical output).

**Non-goals:**

- Renderable display-object node — `@flighthq/particleemitter` (wraps sim + drives display object).
- Authoring-format import/export — `@flighthq/particles-formats`.
- Scalar/easing primitives — `@flighthq/math` / `@flighthq/easing`.
- GPU/compute simulation — future backend seam; don't close the door, don't build it now.

## Decisions

- **[2026-07-02] Sim/node split: particles is the pure sim, particleemitter is the display-object wrapper.** The current code has `ParticleEmitter extends DisplayObject` and imports from `sprite`/`node` — this violates the pure-leaf charter. Extract the 2 files' display-object wiring into `@flighthq/particleemitter` (open to its own package). Particles retains zero scene-graph coupling. Same decomposition pattern as timeline/movieclip.

  **Why:** The charter says "pure, headless value-leaf / first Rust mixing target" but the code is fused with the scene graph. The coupling is thin (2 files, 2 imports) — clean cut. A pure particles package is wasm-mixable; a fused one is not.

- **[2026-07-02] `ParticleForce` / `ParticleCollider` closed unions: leave for now.** The types charter already blessed these as intentionally closed. The particles charter's "revisit later" open direction is resolved — they stay closed for now. If the set grows large enough to warrant a registry, revisit then.

  **Why:** The current force/collider set is small and tight-loop. A closed switch is the sanctioned exception for tight loops within a closed system.

- **[2026-07-02] Sort-key production belongs in the sim.** The sim owns the data needed to sort (age, position, distance from emitter/camera). Produce sorted index arrays in the sim; the renderer reads them.

  **Why:** The renderer shouldn't have to re-derive particle properties to sort. Data operations on the buffers belong in the sim.

- **[2026-07-02] Object-pool path is a secondary tier.** SoA is the primary, performance-first path. The object-pool path exists for cases where particles need individual scene-graph identity (hit testing, per-particle interaction). Invest in parity only where use cases demand it, not wholesale.

  **Why:** SoA is cache-friendly, GPU-compatible, and the path most users want. The object-pool path serves a niche. Wholesale parity would be expensive for limited return.

- **[2026-07-02] Sub-emitters are in scope for the package.** Nested effects (on-death, on-collision spawning child emitters) are a feature of mature particle systems. Not sweep-safe — needs payload widening and a deliberate design pass. Backlogged.

  **Why:** AAA particle systems (Unity, Unreal, Spine) all have sub-emitters. A package labeled "particles" should target that completeness.

- **[2026-07-02] Spawn shape type alignment.** The type union has 3 shapes (`point`, `circle`, `rect`); the source has ~7. Fix the type to match the implementation.

  **Why:** Stale types are a header-layer violation.

- **[2026-07-02] GPU/compute particle simulation is wanted.** The user wants GPU particles. The SoA buffer layout and config-descriptor model are already GPU-compatible. The question is packaging — likely a `particles-gpu` or `particles-compute` neighbor package (same pattern as `filters-gl`). Design the seam and package shape in a future session.

  **Why:** Large particle counts (10k+) benefit dramatically from GPU compute. The architecture naturally supports it — same config descriptor, same buffer format, different execution target.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

- **[2026-09-01] One contract-only, allocation-free spawn sampler; `(x, y, z)` is the sole callback payload.** Every spawn path resolves its shape offset through a single `writeParticleSpawnOffset(out, offset, config, random)` in `@flighthq/particles`, exported from `contract.ts` only — never from `index.ts`. All five spawn sites share it: `updateParticleObjects` (object pool), `updateParticleEmitter2D`, `updateParticleEmitter3D`, `emitParticleBurst2D`, and `emitParticleBurst3D`. It writes into a caller-owned buffer and allocates nothing.

  Shape behaviour is fixed here. Ring samples the circumference at `emitterRadius`; line samples the origin-centred half-open interval `[-emitterWidth / 2, +emitterWidth / 2)`, half-open to match `RandomSource`'s `[0, 1)`. **Ring and line each take exactly one `RandomSource` draw; circle and rect each take two** — the draw count is per shape, not uniform across shapes, and seeded equivalence depends on knowing which. A zero-size shape collapses to the origin and takes no draw at all, so a degenerate emitter cannot silently consume the sequence.

  `ParticleEmitterCallbacks` is the sole public callback surface: `onSpawn` and `onDeath`, both `(x, y, z)` in world space. The object-pool and 2D paths pass `z = 0` rather than carrying a second 2D-shaped callback.

  **Resolves the ring/line spawn-shape breadth and emission-callback parity items.** Cone, and the format-specific spawn parameters behind it, remain open — see the Open directions.

  **Why:** Three spawn paths had drifted into three samplers, so a seeded run could not be compared across them and each new shape cost three edits. One sampler makes seeded equivalence a property of the package rather than of the path a caller happened to take, and the out-parameter form keeps it off the allocation path in the loop that runs most often. A single `(x, y, z)` callback avoids a parallel 2D callback family that would double the surface for one always-zero component.

  **Boundary worth knowing:** the sampler resolves 2D shapes only. A shape with a 3D interpretation is left at the origin for its caller to handle, so "one sampler" means one sampler for the 2D offset, not for all spawn geometry. Landed in `bcbd5e4b6`.

## Open directions

1. **`particleemitter` package shape.** The display-object wrapper that consumes the sim and drives a `ParticleEmitter` display object. Needs its own charter: what it wraps, how it bridges sim → display, whether it lives in its own package or in sprite (where it historically lived). Open to its own package.

2. **Sub-emitter design.** On-death / on-collision spawning a child emitter. Needs payload widening — `onSpawn`/`onDeath` are now `(x, y, z)` as of the 2026-09-01 Decision, and a sub-emitter wants velocity and index on top of that — plus a `'collision'` hook and config-level child-emitter references. Breaking pre-release change — design before building.

3. **Exhaustive collision response.** Currently collision is basic. Full taxonomy: `kill`, `bounce`, `stick`, `slide`. Design the response model.

4. **Arbitrary path/polygon spawn shapes, spline/orbit forces.** Future force/collider/shape types beyond the current set.

5. **Package description update.** The Package Map line should reflect the pure-sim identity after the split.
