---
package: '@flighthq/math'
updated: 2026-06-24
basedOn: ./review.md
---

# math — Assessment

The package made the full Bronze→Silver→Gold leap the maturation roadmap laid out: the constants module, clamp/range, interpolation (basic + advanced), angles, rounding, comparison, the power-of-two family, number theory, the seeded-random toolbox, distributions, hashing, and statistics are all built and verified in the bundle (review verdict: `solid — 88/100`). The roadmap is therefore almost entirely _absorbed_ — what remains is a short list of in-package polish items and a larger band of cross-package / design-gated work that the roadmap itself flagged for the user.

This assessment sorts that remainder. The maturation roadmap (`reviews/maturation/depth/math.md`) is fully absorbed here and can be removed as one-time seed.

## Recommended

Sweep-safe: within `@flighthq/math`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can bless these as a set.

- **Fix the `previousPowerOfTwo` doc comment.** It says "Clear all bits below the highest set bit," but the implementation _fills_ all low bits then does `(n + 1) >> 1`. The result is correct; the comment describes a different algorithm and actively misleads. Rewrite to match the implementation. (review.md Gaps #4)
- **Remove the duplicate `RandomSource` re-export.** Both `random.ts` and `randomRange.ts` carry `export type { RandomSource }`. The barrel dedupes identical re-exports so it compiles, but it is redundant public surface — keep one home (or none; consumers can import it from `@flighthq/types`). Within-package, no signature change. (review.md Gaps #6)
- **Add an `lcm` overflow doc note.** `(|a| / g) * |b|` divides first (avoids one overflow class) but has no guard for the product exceeding `Number.MAX_SAFE_INTEGER`; large inputs silently lose precision. Add a doc note in the shape of `factorial`'s `Infinity`-above-170 note — documentation only, no behavior change. (review.md Gaps #5)
- **Document the current `saturate`/`clamp` NaN behavior.** Both propagate NaN today (the `<`/`>` comparisons are false for NaN). `clamp` already documents this; `saturate` does not. State `saturate`'s NaN contract explicitly so a hot-loop helper's behavior is not silent. This is the _documentation_ of existing behavior only — **changing** the contract (GPU `saturate` returns 0 for NaN) is a policy decision and is routed to Open directions, not swept. (review.md Gaps #7)
- **Run `npm run order:check` on the live tree.** The review confirmed exports _appear_ alphabetized per file from the bundle but could not run the check against the live worktree. A confirmation pass (and `order:fix` if anything drifted) closes that loose end. (review.md Contract & docs fit)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Each notes why.

- **Noise tier** (`valueNoise2D`, `gradientNoise2D`/Perlin, `simplexNoise2D`, `fractalNoise`/fbm). _Parked — Open direction._ The `hash2D`/`hash3D`/`createRandomSourceFromHash` primitives are deliberately built as the seed layer for noise, but whether noise lives in `math` or spins out as a `@flighthq/noise` neighbor is the single biggest undecided scope question (structural fork E bedrock test; a clean value-in/value-out leaf and a Wasm-mixing candidate). Routed to the charter's Open directions. (review.md Gaps #1, Candidate open directions #1)
- **Rust `flighthq-math` crate.** _Parked — cross-worktree, larger scope._ The charter front matter declares `crate: flighthq-math` and the Rust map mandates 1:1 conformance, but the crate does not exist. It is the cleanest port target in the codebase (pure free functions, deterministic, a value-typed mixing leaf), so the gap is "not yet done in the rust worktree," not a design obstacle — but it is not a within-package TS sweep item. The register/conformance map should record `flighthq-math` as recommended-and-unbuilt. (review.md Gaps #2, Candidate open directions #3)
- **`randomColor` (packed-RGBA random helper).** _Parked — Open direction._ Cross-package ownership question: the randomness machinery lives in `math`, but packed-RGBA output pulls toward `@flighthq/materials`. Routed to the charter's Open directions. (review.md Gaps #3, Candidate open directions #2)
- **`saturate`/`clamp` NaN-contract policy.** _Parked — Open direction._ Whether the clamp/interpolation family should propagate NaN or sanitize it (GPU `saturate` → 0) is a small but real consistency decision across the family, not a unilateral sweep. The _current-behavior documentation_ is in Recommended; the _policy change_ waits on the user. (review.md Candidate open directions #6)
- **Particle-emitter consolidation.** _Parked — cross-package coordination._ `@flighthq/particles` inlines spawn geometry (`spawnShape.ts`) and a local `clamp01` in `updateParticleEmitter.ts` that now duplicate `math`'s `randomInsideUnitDisc`, `randomOnUnitCircle`, `randomWeighted`, and `saturate`. Adopting the shared helpers is a cleanup, but it touches another package, so it is a direction question. (review.md Candidate open directions #4)
- **`clampedSum` statistics helper.** _Parked — low value, verify intent first._ The maturation Gold tier listed `clampedSum` alongside the statistics set that did ship (`mean`/`median`/`variance`/ `standardDeviation`/`weightedAverage`). It is a within-package pure-function add and would be sweep-safe in isolation, but its use case is thin and the worker omitted it deliberately; parked pending a confirmation that it is wanted rather than padding the surface. (reviews/maturation Gold)
- **Combinatorics / smoothing breadth** (`wrap`/`wrapInt`, integer `pingPong`, `cyclicLerp`, `mapClamped`). _Parked — speculative._ The review lists these for completeness, not as real gaps; they are low-value and should wait for a concrete consumer. (review.md Gaps #8)

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._
