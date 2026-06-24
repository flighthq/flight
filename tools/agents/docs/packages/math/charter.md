---
package: '@flighthq/math'
crate: flighthq-math
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# math — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/math` is the SDK's general-purpose **scalar numeric toolbox** — the bottom-of-the-stack library of pure, value-in/value-out math: constants, clamp/range, interpolation (basic and advanced), angles, rounding, scalar power-of-two/quantize helpers, number theory, comparison/epsilon helpers, statistics, seeded randomness, hashing, and random distributions. The surface is ~80 free functions across 15 modules, all pure with explicit inputs, no hidden state, no hot-path allocation, fully tree-shakable — the cleanest C/C++-portable leaf shape the codebase asks for.

Where it ends vs. a neighbor:

- **vs. `@flighthq/geometry`** — `math` is _scalar_ (operates on `number`s and writes `out.x/y/z` for the few vector-sampling random helpers). Vector/matrix/rectangle value types and their algebra live in `geometry`. `math` is the substrate `geometry` and everyone else compute on top of.
- **vs. `@flighthq/materials`** — color/material math (packed-RGBA helpers, color transforms) leans toward `materials`; the raw randomness/interpolation machinery is here. The `randomColor` ownership line is unsettled (Open directions).
- **vs. a possible `@flighthq/noise`** — `math` deliberately builds the _seed_ layer (`hash2D`, `hash3D`, `createRandomSourceFromHash`); whether the noise _tier_ (value/gradient/simplex/fbm) lives in-package or in a neighbor is the single biggest open scope question.

## North star (proposed)

_Proposed principles, inferred from the realized design + the SDK forks. Not blessed — confirm or edit._

1. **Pure scalar primitives, no state, no allocation in hot paths.** Every export is a free function with explicit inputs; vector-sampling helpers write into an `out` parameter and are alias-safe (read all inputs into locals before writing). This is the irreducible-primitive bedrock — the thing every other package computes on top of, so it must be the most portable layer in the SDK.
2. **Canonical names from the graphics/games vocabulary.** Functions use the names a shader author or game dev already reaches for — `saturate`, `smoothStep`, `smootherStep`, `fract`, `lerp`, `damp`, `lerpAngle`, `ceilPowerOfTwo`. The right name is the industry-recognized one, full and unabbreviated.
3. **Sentinel-vs-throw applied with discipline.** Expected-failure paths return sentinels (`pick` → `undefined`, `randomWeighted` → `-1`, statistics → `NaN`, degenerate range → an endpoint); only genuine programmer misuse throws (`euclideanMod` 0 divisor, `factorial` of a negative, `randomInt` min>max). The split is part of the contract, not incidental.
4. **AAA scalar completeness — a mature sub-library, not a grab-bag.** A developer reaching for "math" should find the full Bronze/Silver/Gold toolbox (clamp/interp/angle/rounding/number-theory/ statistics/random/hash/distributions), not a thin random helper. Gaps in that scalar surface are unfinished work, not a design choice.
5. **A value-typed, deterministic, portable leaf.** No GPU, no entity/graph machinery, deterministic given a seed, headlessly fingerprint-able — which is exactly what makes it the cleanest Rust port target and a Wasm-mixing candidate. The package should stay that way: nothing here should acquire hidden state, eager side effects, or a non-trivial dependency.

## Boundaries (proposed)

_Proposed scope lines. Several are genuinely undecided — those are mirrored in Open directions._

**In scope:**

- Scalar constants, clamping/range, interpolation (basic + advanced), angle math, rounding, scalar power-of-two / quantize, number theory, comparison/epsilon helpers, statistics.
- Seeded randomness (`createRandomSource`), random ranges, random distributions, and the vector-sampling random helpers that write into an `out` (disc/circle/sphere).
- Stateless hashing (`hashUint32`, `hashCombine`, `hash2D/3D`) and the hash→PRNG bridge.

**Non-goals (proposed):**

- **Vector / matrix / rectangle value types and their algebra** — those belong to `@flighthq/geometry`. `math` provides the scalar operations those types are built from, not the types.
- **Color / packed-RGBA helpers** — leans to `@flighthq/materials` (the `randomColor` case is an open question below, not a settled exclusion).
- **GPU, entity/runtime, or scene-graph concerns** — `math` is a pure leaf and stays one.
- **Dependencies beyond `@flighthq/types`** — keep the leaf minimal and Wasm-mixable.

**Undecided boundaries (see Open directions):** whether noise functions and `randomColor` are in scope at all.

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this leaf. An agent asks here rather than assuming._

1. **Noise: in-`math` or a `@flighthq/noise` neighbor?** The hash layer (`hash2D`, `hash3D`, `createRandomSourceFromHash`) is built explicitly as the seed for value/gradient/simplex noise and fbm — the foundation is laid but the noise tier is unbuilt. Per fork E (bedrock test) and the triad pattern, a `@flighthq/noise` package would be a clean value-in/value-out leaf and a strong Wasm-mixing candidate (fork D); it may equally be a `math` sub-module. **This is the single biggest undecided scope question** and a Boundary-defining ruling.
2. **`randomColor` home: `math` or `@flighthq/materials`?** Packed-RGBA output pulls toward `materials`; the randomness machinery lives here. A cross-package ownership call.
3. **Rust `flighthq-math` priority.** The charter front matter asserts `crate: flighthq-math` and the Rust conformance map mandates 1:1 conformance, but the crate does not exist yet — the single largest contract gap. It is the _cleanest_ port target in the codebase (pure free functions, deterministic, no entity/graph machinery, headlessly fingerprint-able). Should it be prioritized as the first conformance/mixing proof? The register/conformance map should record `flighthq-math` as recommended-and-unbuilt so the gap is tracked, not silently assumed-done.
4. **Is `math` a Wasm-mixable leaf (fork D)?** It plainly is — pure value-typed, deterministic, no GPU. Worth recording on the mixing-candidate list alongside `surface` / `geometry` / `path`. Confirm the intent so it is tracked, not assumed.
5. **NaN-contract policy for hot helpers.** `clamp` documents "NaN propagates" and `saturate` follows the same pattern (returns NaN), but the GPU `saturate` it is named after returns 0 for NaN. Should the interpolation/clamp family propagate NaN or sanitize it? A small but real consistency decision for a hot-loop helper.
6. **Particle-emitter consolidation (cross-package).** `@flighthq/particles` inlines spawn geometry (`spawnShape.ts`) and a local `clamp01` in `updateParticleEmitter.ts` that now duplicate `randomInsideUnitDisc`, `randomOnUnitCircle`, `randomWeighted`, and `saturate`. Adopting the `math` helpers is a cleanup, but it is cross-package coordination — a direction question, not a sweep item.
7. **Package Map entry + charter authoring are new and unblessed.** The bundle adds the `@flighthq/math` Package Map line and the scope expansion from a 2-function stub to a full scalar toolbox; this should be acknowledged in a direction pass rather than left as an inbound-as-claimed addition.
8. **Open boundary: how far does the scalar toolbox grow?** Speculative low-value additions (`wrap`/`wrapInt`, integer `pingPong`, `cyclicLerp`, `mapClamped`/clamped-`remap`) — list-for- -completeness candidates. Worth a boundary stance on whether AAA-completeness pulls these in or the leaf stays lean.
