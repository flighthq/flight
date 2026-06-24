---
package: '@flighthq/particles'
crate: flighthq-particles
lastDirection: 2026-06-24
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# particles — Charter

> Durable vision and core values for `@flighthq/particles`. Authored from the user's direction; it is the rubric `review.md` and `assessment.md` are judged against. No status here. See ../CONTRACT.md.

## What it is

The CPU **simulation core** for 2D particle effects — emitter state as typed-array SoA (plus a parallel object-pool path), spawn shapes, lifetime and appearance-over-lifetime curves, data-descriptor forces and colliders, deterministic via an injected `RandomSource`. It produces simulation buffers (and a sort order); it does not parse authoring formats (that's `particles-formats`). Whether the _renderable particle node_ also lives here or in the node layer is an open question — see Open directions.

## North star

- **Deterministic.** Same seed → identical buffers, always (`RandomSource`-injected). The package stays a pure, headless, fingerprintable value-leaf — a property to protect: it is the first Rust mixing/conformance target (buffer-in/buffer-out, no GPU, no scene graph).
- **Allocation-explicit.** SoA buffers, opt-in capacity growth, `out`-params in hot loops; a feature an emitter does not use costs it nothing (e.g. `spawnOrigins` allocated only for radial/tangential).
- **Forces and colliders are plain data descriptors**, applied by passes the caller invokes by name — no hidden per-frame work.
- **CPU-first.** Any GPU/compute path is a swappable backend behind the same buffers, never a fork of the simulation.

## Boundaries

- **In:** emitter simulation, spawn shapes, lifetime, appearance-over-lifetime curves, forces, colliders, sort-order production, prewarm, world-space trails.
- **Not:** authoring-format import/export (`particles-formats`); scalar/easing primitives (`math`/`easing`).
- **Under review:** the renderable particle node (drawing/batching) — see the first Open direction.

## Decisions

_Append-only, dated, blessed rulings. None blessed yet — the sim/draw boundary is under review._

## Open directions

- **Source-data vs. renderable-node separation** _(cross-package; plan with the user)_. Historically `particles` = simulation, `sprite` = batch-rendered node primitives (`Sprite`/`QuadBatch`/`Tilemap`). Since `sprite` now extends `displayobject`, 2D nodes span packages, and `ParticleEmitter` does not align with the texture-region nodes (it wraps a _simulation_, not a region) — and both packages currently export `*ParticleEmitter*` names. Question: does the renderable particle node live in the node layer while `particles` stays a pure sim source-data leaf, and how is the dual export name resolved? Lean: keep `particles` pure-sim to protect the deterministic value-leaf property.
- **Sub-emitters / nested effects** _(breaking API reshape)_. Death bursts, trails-of-trails, and spawn-on-collision need widening `onSpawn`/`onDeath` from `(x, y)` to `(x, y, vx, vy, index)` — a breaking change to every existing caller (acceptable pre-release, but deliberate), plus a `'collision'` hook. Decide before building.
- **Open forces/colliders to a registry** _(parked 2026-06-24)_. Move from closed `switch(kind)` unions to `registerParticleForce`/`registerParticleCollider` (vendor-extensible, mirroring effects/filters). The type files already flag this. Revisit later.
- **GPU/compute simulation backend** _(to discuss)_. A `ParticleSimulationBackend` seam so a WebGPU/compute (and Rust-wgpu) backend can drive the same buffers, CPU staying the default. Has cross-package and Rust-parity implications — talk through before committing.
