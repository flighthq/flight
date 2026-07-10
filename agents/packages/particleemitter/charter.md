---
package: '@flighthq/particleemitter'
crate: flighthq-particleemitter
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# particleemitter — Charter

## What it is

`@flighthq/particleemitter` is the **display-object composition layer** for particles — it owns the `ParticleEmitter` display node and drives it from the `@flighthq/particles` simulation. Same decomposition pattern as timeline/movieclip: `@flighthq/particles` is the pure, headless sim (spawn, lifetime, forces, colliders, curves); particleemitter is where that sim meets the scene graph as a drawable node.

The `ParticleEmitter` node historically lived in `@flighthq/sprite`, and the sim-driving glue (`updateParticleEmitter`, `emitParticleBurst`) ended up in `@flighthq/particles` — where it imported `@flighthq/sprite`, violating particles' pure-leaf charter. This package is the node's **permanent home**, and gathering it here restores particles to a dependency-free-of-sprite leaf.

## North star

The scene-graph face of the particle system: a `ParticleEmitter` display object that a user adds to the tree, advances from the sim each frame, and renders through the normal display pipeline. AAA target is a mature emitter node — pooled particle buffers, sort-order-aware draw, burst and continuous emission, and a clean render path — with the *simulation* staying entirely in `@flighthq/particles` so the sim is usable headless (tests, servers, tooling) without pulling in display or rendering weight.

## Boundaries

**In scope:**

- The `ParticleEmitter` display node — entity/data/runtime, particle buffer management (`createParticleEmitter`, `reserveParticleEmitter`, append/remove/compact, bounds), relocated from `@flighthq/sprite`.
- The sim→node glue: `updateParticleEmitter` (advance the node's particles from the sim) and `emitParticleBurst`, relocated from `@flighthq/particles`.
- Sort-order consumption and the render feed (how the node's particle buffers reach the renderer).

**Non-goals:**

- The particle *simulation* — spawn rules, lifetime, forces, colliders, curves, emitter config/state/signals — stays in `@flighthq/particles` (the pure sim). particleemitter consumes it.
- Rendering itself — renderers consume the node; the concrete draw lives in the `render-*`/`sprite` batch layers.

**Dependencies:** `particles` (sim: curve sampling, emitter state/signals/config) + `displayobject` + `geometry` + `node` + `types`.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Name is `@flighthq/particleemitter`** (no dash, no plural-mismatch). The composition-layer package is named the lowercased form of the type it owns — `particleemitter` ← `ParticleEmitter`, exactly as `movieclip` ← `MovieClip`. A dash (`particle-emitter`) would wrongly imply a `particle` singular base package; `particles-emitter` (the `-subpackage` neighbor form) is for codec/format neighbors like `particles-formats`, not a first-level display domain. The SDK's first-level compound domains are smashed no-dash (`displayobject`, `textureatlas`, `textinput`, `spritesheet`, `movieclip`), so this joins that family. User-directed 2026-07-10.

- **[2026-07-10] Full scope: relocate the `ParticleEmitter` node out of `@flighthq/sprite`.** Not just the two glue files — the node itself (`packages/sprite/src/particleEmitter.ts`, which is self-contained: it imports only displayobject/geometry/node/types and nothing else in sprite consumes it) moves here, making particleemitter the node's real home per the charter. `@flighthq/particles` keeps the sim (curves, `ParticleEmitterState`/`ensureParticleEmitterStateCapacity`, `ParticleEmitterSignals`/`getParticleEmitterSignals`, config), exposing whatever the node needs through its barrel, and **drops its `@flighthq/sprite` dependency** — restoring the pure-leaf charter. User-directed 2026-07-10.

### Origin decisions (from particles charter)

- **[2026-07-02 · particles charter]** Sim/node split. Particles is the pure sim; the emitter node is the display-object wrapper.
- **[2026-07-02 · particles charter]** Own package (historically lived in sprite).

## Open directions (maturation)

1. **Render integration.** How the emitter node feeds the renderer — quad batch (as it did inside sprite), instanced draw, or a dedicated pass. The extraction preserves the current sprite-batch-compatible path; the AAA render shape is the open question.
2. **Sort-order consumption.** The sim produces sorted index arrays; settle how the node reads them for draw order across backends.
