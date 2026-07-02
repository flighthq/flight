---
package: '@flighthq/particles'
crate: flighthq-particles
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# particles — Charter

## What it is

`@flighthq/particles` is the **CPU simulation core** for 2D particle effects — emitter state as typed-array SoA (plus a parallel object-pool path), spawn shapes, lifetime and appearance-over-lifetime curves, data-descriptor forces and colliders, deterministic via an injected `RandomSource`. It produces simulation buffers (and a sort order); it does not parse authoring formats (that's `particles-formats`) and it does not own the renderable display-object node (that's `particle-emitter`).

The package is a **pure, headless value-leaf** — no scene-graph coupling, no display-object dependency. The current code violates this (2 files import from `sprite`/`node`) but the direction is clear: extract the display-object-specific wiring into `@flighthq/particle-emitter`, leaving particles as a clean simulation kernel. This is the same decomposition pattern as timeline/movieclip.

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

- Renderable display-object node — `@flighthq/particle-emitter` (wraps sim + drives display object).
- Authoring-format import/export — `@flighthq/particles-formats`.
- Scalar/easing primitives — `@flighthq/math` / `@flighthq/easing`.
- GPU/compute simulation — future backend seam; don't close the door, don't build it now.

## Decisions

- **[2026-07-02] Sim/node split: particles is the pure sim, particle-emitter is the display-object wrapper.** The current code has `ParticleEmitter extends DisplayObject` and imports from `sprite`/`node` — this violates the pure-leaf charter. Extract the 2 files' display-object wiring into `@flighthq/particle-emitter` (open to its own package). Particles retains zero scene-graph coupling. Same decomposition pattern as timeline/movieclip.

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

## Open directions

1. **`particle-emitter` package shape.** The display-object wrapper that consumes the sim and drives a `ParticleEmitter` display object. Needs its own charter: what it wraps, how it bridges sim → display, whether it lives in its own package or in sprite (where it historically lived). Open to its own package.

2. **Sub-emitter design.** On-death / on-collision spawning a child emitter. Needs payload widening (`onSpawn`/`onDeath` from `(x, y)` to `(x, y, vx, vy, index)`), a `'collision'` hook, and config-level child-emitter references. Breaking pre-release change — design before building.

3. **Exhaustive collision response.** Currently collision is basic. Full taxonomy: `kill`, `bounce`, `stick`, `slide`. Design the response model.

4. **Arbitrary path/polygon spawn shapes, spline/orbit forces.** Future force/collider/shape types beyond the current set.

5. **Package description update.** The Package Map line should reflect the pure-sim identity after the split.
