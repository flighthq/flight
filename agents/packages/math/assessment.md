---
package: '@flighthq/math'
updated: 2026-07-02
basedOn: ./review.md
---

# math — Assessment

Sorted from `review.md` (solid, 88/100) and the direction session (2026-07-02). Six Decisions blessed. The package is feature-complete for its current scope; approved work is housekeeping within `math` plus a cross-package particles consolidation.

## Recommended

Strictly sweep-safe: within `@flighthq/math`, no cross-package coupling, no open design decision.

- **Fix the `previousPowerOfTwo` doc comment.** It says "Clear all bits below the highest set bit," but the implementation fills all low bits then does `(n + 1) >> 1`. The result is correct; the comment describes a different algorithm and actively misleads. Rewrite to match the implementation.
- **Remove the duplicate `RandomSource` re-export.** Both `random.ts` and `randomRange.ts` carry `export type { RandomSource }`. The barrel dedupes identical re-exports so it compiles, but it is redundant public surface — keep one home (or none; consumers can import from `@flighthq/types`).
- **Add an `lcm` overflow doc note.** `(|a| / g) * |b|` divides first (avoids one overflow class) but has no guard for the product exceeding `Number.MAX_SAFE_INTEGER`; large inputs silently lose precision. Add a doc note in the shape of `factorial`'s `Infinity`-above-170 note.
- **Document `saturate`'s NaN behavior and implement GPU semantics.** Currently `saturate` propagates NaN (same as `clamp`). Per Decision #3, `saturate` should follow GPU `saturate(NaN) = 0`. Add a `value !== value` guard that returns 0, and document the contract explicitly. `clamp` keeps NaN-propagation and documents it.
- **Update `package.json` description.** Change from "General math utilities: seeded random and power-of-two rounding" to a description reflecting the full scalar toolbox scope. Per Decision #6.
- **Run `npm run order:check` confirmation.** The review confirmed exports appear alphabetized from the bundle but could not verify the live tree. Confirm and `order:fix` if anything drifted.

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
