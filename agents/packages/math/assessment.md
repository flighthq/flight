---
package: '@flighthq/math'
updated: 2026-07-31
basedOn: ./review.md
---

# math — Assessment

Sorted from `review.md` (solid, 88/100) and the direction session (2026-07-02). Six Decisions blessed. The package is feature-complete for its current scope; approved work is housekeeping within `math` plus a cross-package particles consolidation.

## Recommended

_None open._ Re-verified against live source on 2026-07-31 (17 source files, 15 test files, 278 tests,
67 exports): all six sweep items landed. They are recorded under [Landed](#landed) below, outside this
section so the TODO generator stops reporting them as work.

## Landed

- ~~**Fix the `previousPowerOfTwo` doc comment.**~~ Landed. It now describes the behaviour ("Round `n` down
  to the largest power of two that is `<= n`", with `previousPowerOfTwo(6) → 4`) instead of an algorithm the
  implementation does not use.
- ~~**Remove the duplicate `RandomSource` re-export.**~~ Landed. Only `random.ts` re-exports it;
  `randomRange.ts` no longer does.
- ~~**Add an `lcm` overflow doc note.**~~ Landed. `lcm`'s comment now states that a very large result may
  exceed `Number.MAX_SAFE_INTEGER` and lose precision.
- ~~**Document `saturate`'s NaN behavior and implement GPU semantics.**~~ Landed. `saturate` guards
  `value !== value` and returns 0, matching GPU `saturate(NaN) = 0`; `clamp` keeps NaN propagation.
- ~~**Update `package.json` description.**~~ Landed: "Scalar numeric utilities — interpolation, clamping,
  angles, rounding, randomness, hashing, statistics, and number theory".
- ~~**Run `npm run order:check` confirmation.**~~ Landed; `order:check` runs in the standard `npm run check`
  sweep and is green.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Noise tier** (`valueNoise2D`, `gradientNoise2D`/Perlin, `simplexNoise2D`, `fractalNoise`/fbm). _Parked — within-package but large scope._ Blessed to live in `math` (Decision #1), built on the `hash2D`/`hash3D` seed layer. A dedicated builder task, not a sweep item.
- **`randomColor` helper.** _Parked — within-package, small scope, but needs design._ Blessed to live in `math` (Decision #2). Needs signature design: `randomColor(random: RandomSource): number` (packed RGBA) and whether alpha is always 0xFF or parameterized.
- **Particles consolidation.** _Parked — cross-package._ Per Decision #4: `@flighthq/particles` should replace inline `clamp01` with `saturate`, `Math.PI * 2` with `TAU`, and evaluate replacing inline disc sampling with `randomInsideUnitDisc`. The `math` names are the correct generic names. Builder must verify equivalent performance for the disc sampling case (inline scalars vs out-param vector). Touches `emitParticleBurst.ts` and `updateParticleEmitter.ts`.
- **Rust `flighthq-math` crate.** _Parked — cross-worktree, larger scope._ Cleanest port target in the codebase. Charter Open direction #1.
- **Wasm mixing candidate registration.** _Parked — admin/register._ Record `math` on the mixing-candidate list. Charter Open direction #2.

## Approved

- [2026-07-02 · blanket "yes"] Fix `previousPowerOfTwo` doc comment — review Gaps #4
- [2026-07-02 · blanket "yes"] Remove duplicate `RandomSource` re-export — review Gaps #6
- [2026-07-02 · blanket "yes"] Add `lcm` overflow doc note — review Gaps #5
- [2026-07-02 · blanket "yes"] Document `saturate` NaN behavior + implement GPU semantics (NaN → 0) — charter Decision #3
- [2026-07-02 · blanket "yes"] Update `package.json` description — charter Decision #6
- [2026-07-02 · blanket "yes"] Run `order:check` confirmation — review Contract & docs fit
