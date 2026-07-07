---
package: '@flighthq/sprite'
status: partial
score: 62
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/sprite.md
  - reviews/maturation/depth/sprite.md
  - source
  - changes.patch
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# sprite — Review

> **Merge-gate review.** Frame: the approved floor is `origin/main` (`eb73c3d74`) at `incoming/integration-b2824e3d8/base/packages/sprite/`; the candidate is the integration branch at `incoming/integration-b2824e3d8/head/packages/sprite/`. This review judges **only the delta** (head vs base, plus the `packages/sprite/` hunks of `incoming/integration-b2824e3d8/changes.patch`) as a gate into the approved baseline. It does not re-survey or re-score the package as a whole — see the prior `builder-67dc46d64` review for the standalone capability map. The score below grades the delta's fitness-to-merge, not the package's maturity.

## Verdict

**partial — 62/100. Do not merge as-is.** The delta is large, well-shaped, and well-tested in isolation, but it **does not compile against its own bundle** and **breaks packaging hygiene** — two hard, mechanical, delta-introduced blockers that `npm run check` / `npm run packages:check` / `tsc -b` would each fail on. The design and test work behind the delta is good; it is the header-layer and manifest wiring that did not land with the source. Both blockers are narrow and fixable; this is a "wire it up" gate, not a "redesign it" gate.

The base sprite (`eb73c3d74`) is the pre-second-wave package: bounds + hit-test + capacity for `QuadBatch`, plain grid ops for `Tilemap`, and the bare quartets for `Sprite`/`ParticleEmitter`. The delta adds the **entire second wave** in one move: per-instance/per-tile/per-particle accessors and mutators, `append*`/`remove*`/`clear*`, `clone*` for every kind, `compact*`, QuadBatch range/iterate/transform-type-switch and exact-polygon hit test, full Tilemap navigation, and an opt-in **signals group** for `Sprite`/`QuadBatch`/`Tilemap`. The signals subsystem is the source of both blockers.

## Blocking findings (grounded in the delta)

### B1 — The signals types are imported from `@flighthq/types` but never defined there (compile break, types-first violation)

All three signals-bearing source files import their `*Signals` interface from `@flighthq/types`:

- `b2824e3d8:packages/sprite/src/quadBatch.ts` line 16 — `import type { … QuadBatchSignals … } from '@flighthq/types';`
- `b2824e3d8:packages/sprite/src/sprite.ts` line 15 — `import type { … SpriteSignals … } from '@flighthq/types';`
- `b2824e3d8:packages/sprite/src/tilemap.ts` line 15 — `import type { … TilemapSignals … } from '@flighthq/types';`

These three interfaces **exist nowhere in `@flighthq/types`**. The bundled header files `incoming/integration-b2824e3d8/head/packages/types/src/{QuadBatch,Sprite,Tilemap}.ts` define `*Data`/`*Runtime`/`*Kind` but no `*Signals` (e.g. `Sprite.ts` declares `export interface SpriteRuntime extends DisplayObjectRuntime {}` and stops there). The integration patch confirms the omission is intentional-to-the-diff, not a capture artifact: `changes.patch` never touches `types/src/QuadBatch.ts`, `types/src/Sprite.ts`, or `types/src/Tilemap.ts`, and a search for `interface QuadBatchSignals|interface SpriteSignals|interface TilemapSignals` over the whole patch returns nothing. The sprite source consumes a header surface that was never written. `tsc -b` on `@flighthq/sprite` fails with "Module '@flighthq/types' has no exported member 'QuadBatchSignals'" (and the two siblings). This also violates the contract's **types-first** rule (charter North star #4, codebase-map header-layer discipline): cross-package types must be defined in `@flighthq/types` first, then implemented against.

### B2 — `@flighthq/signals` is a new runtime import but is not a declared dependency (packaging break)

The delta adds a value import of `createSignal` to three files — `b2824e3d8:packages/sprite/src/sprite.ts` line 6 (`import { createSignal } from '@flighthq/signals';`), and the same line in `quadBatch.ts` and `tilemap.ts`. The base imported `@flighthq/signals` in **none** of its files. Yet `b2824e3d8:packages/sprite/package.json` is **unchanged by the patch** (it is not in `changes.patch`) and its `dependencies` block lists only `@flighthq/displayobject`, `@flighthq/geometry`, `@flighthq/node`, `@flighthq/types` — no `@flighthq/signals`. A package that imports from a workspace package it does not declare fails `npm run packages:check` (workspace dependency-mismatch) and is a real publish-shape defect. The fix is one line in the manifest.

## Non-blocking observations on the delta

These are correctness/clarity edges the delta introduces. The first two are already held as the charter's Open directions #1 and #3 — they are **design forks the user owns**, not merge blockers, so they are routed to the dispatch brief's open questions and the assessment's Notes, not to must-fix.

- **`transformType` stride corruption in the vector2-only mutators.** `appendQuadBatchInstance` (`b2824e3d8:packages/sprite/src/quadBatch.ts` lines 34-44) and `setQuadBatchInstance` (lines 473-480) always write `index * QUAD_VECTOR2_STRIDE` regardless of `data.transformType`. Called on a `matrix3x2` batch they write a stride-2 layout into a stride-6 buffer, silently corrupting it. The doc comments state the precondition ("Target must use `transformType === 'vector2'`"), so this is documented-precondition-only behavior — within the contract's latitude — but it is the delta's main silent-corruption surface. Charter Open direction #3 already asks whether these should hard-guard.

- **The `0xffff` sentinel that nothing writes.** `compactQuadBatch` (`b2824e3d8:packages/sprite/src/quadBatch.ts` lines 88-112) and `compactParticleEmitter` (`particleEmitter.ts` lines 101-129) filter on `data.ids[read] === 0xffff` as a "deleted" sentinel, but no function in the package ever writes `0xffff` (removal is swap-remove + count-decrement). The quadBatch doc comment even argues with itself ("this is a no-op for the common case… The only meaningful compaction is when callers zero-out ids"). As shipped these are no-ops for every workflow the package itself supports. Charter Open direction #1 already asks: bless a named `mark-deleted then compact` seam, or remove the compact functions.

- **Third spelling of `{ x: number; y: number }`.** `getQuadBatchInstanceTransform` (`b2824e3d8:packages/sprite/src/quadBatch.ts` line 252 — `out: Vector2Like`) reads cleanly, but `getTilemapColumnRowAtPoint` (`tilemap.ts` line 114) and `getParticleEmitterParticleVelocity` (`particleEmitter.ts` line 248) take an inline `out: { x: number; y: number }` rather than `Vector2Like`. A one-line SDK-wide convention ruling removes the third spelling; charter Open direction #6.

## What the delta does well (passes its standards)

- **Composition / bedrock (pass).** Four value-typed buffer quartets, each a flat family of side-effect-free free functions. No config-gated feature fusion, no subject mixing. Internal stride constants (`QUAD_VECTOR2_STRIDE`/`QUAD_MATRIX3X2_STRIDE` at `quadBatch.ts` lines 25-26; `PARTICLE_*_STRIDE` at `particleEmitter.ts` lines 21-23) keep `i*2`/`i*6` math out of callers.
- **Naming (pass).** Every new export carries the full unabbreviated type word and the right verb prefix: `appendQuadBatchInstance`, `getTilemapColumnRowAtPoint`, `hitTestQuadBatchPointExactXY`, `setParticleEmitterParticleVelocity`, `enable*Signals`/`get*Signals`/`create*Signals`. No abbreviations, no vague names.
- **Tree-shaking / side-effects (pass).** Thin 4-file barrel (`index.ts` unchanged from base); `package.json` keeps `"sideEffects": false`; signals are opt-in via `enable*Signals` with a `Symbol`-keyed runtime slot (`quadBatchSignalsSlot` etc.), so the signal cost is zero until enabled and no importer of a primitive pays for it. The signal-emit checks in the mutators are a single `getQuadBatchSignals(target) !== null` guard, not a new shared switch.
- **Registry vs closed union (n/a).** The one closed switch is the two-member `transformType` (`vector2`/`matrix3x2`) — a genuinely closed, tight value type, correctly left as a union per the contract's "closed union for a tight loop within a closed system" carve-out. No growing kind family is mis-modeled as a switch.
- **Subject triad (n/a).** No format codecs or backends added; nothing mis-homed; no premature split.
- **Out-params + alias-safety + sentinels (pass).** Readers return `-1`/`false` and mutators no-op on out-of-range (`getQuadBatchInstanceId` line 241-244, `removeQuadBatchInstance` line 422-446, `setTilemapTile` line 208-214). `setQuadBatchTransformType` (lines 544-574) documents and respects its in-place re-stride direction (expand fills in reverse, collapse `dst < src`), which is the alias-safety concern for that function.
- **Tests & honesty (pass, and a regression-from-the-prior-bundle fix).** Every exported function in all four files has a colocated, alphabetized `describe` block mirroring the export list (verified by diffing export names against `describe(` blocks in each `*.test.ts`). The prior `builder-67dc46d64` review's central defect — "~26 second-wave exports untested, `exports:check` would fail" — is **resolved** in this bundle; the delta lands its tests. The claim and the code now match.

## Contract / charter notes surfaced by the delta

- The charter (still `draft: true`) describes the realized head as already upholding header-layer discipline ("Cross-package types … live in `@flighthq/types`"). The delta as bundled **does not** — B1 shows the `*Signals` types never reached the header. The charter prose is aspirational here, not descriptive of `b2824e3d8`.
- The Rust `flighthq-sprite` mirror is not in this bundle; conformance of the new buffer math is unverified (charter Open direction #10). No action for this gate.
