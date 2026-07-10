---
package: '@flighthq/particle-emitter'
crate: flighthq-particle-emitter
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# particle-emitter — Charter

## What it is

`@flighthq/particle-emitter` is the **display-object composition layer** for particles — wraps the `@flighthq/particles` simulation and drives a `ParticleEmitter` display object. Same decomposition pattern as timeline/movieclip: the sim is the bedrock primitive, the emitter node is a composition of it.

Historically the `ParticleEmitter` node lived in `@flighthq/sprite`. It was moved to `@flighthq/particles` but that violated particles' pure-leaf charter. This package is its permanent home.

Blessed as a new package during the particles direction session (2026-07-02). Source currently lives in `packages/particles/src/updateParticleEmitter.ts` and `emitParticleBurst.ts` (the 2 files that import from `sprite`/`node`).

_(Needs a full direction session to design the display-object binding, sort-order consumption, and render integration.)_

## North star

_TODO — needs direction session._

## Boundaries

_TODO — needs direction session._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet — package is pre-direction._

### Origin decisions (from particles charter)

- **[2026-07-02 · particles charter]** Sim/node split. Particles is the pure sim; particle-emitter is the display-object wrapper.
- **[2026-07-02 · particles charter]** Open to its own package (historically lived in sprite).

## Open directions

1. **Package vs. in-sprite.** Own package, or back in sprite? Own package seems cleaner (particles charter suggests it).
2. **Sort-order consumption.** The sim produces sorted index arrays; the emitter node reads them for draw order.
3. **Render integration.** How the emitter node feeds the renderer — quad batch, instanced draw, etc.
