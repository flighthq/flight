---
package: '@flighthq/math'
crate: flighthq-math
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# math — Charter

## What it is

`@flighthq/math` is the SDK's **scalar numeric toolbox** — the bottom-of-the-stack library of pure, value-in/value-out math: constants, clamp/range, interpolation (basic and advanced), angles, rounding, scalar power-of-two/quantize helpers, number theory, comparison/epsilon helpers, statistics, seeded randomness, hashing, random distributions, and noise. The surface is ~80 free functions across 15 modules, all pure with explicit inputs, no hidden state, no hot-path allocation, fully tree-shakable — the cleanest C/C++-portable leaf in the SDK.

The name `math` claims a broad domain. The package is not a symbolic math library or a linear algebra library — it is a scalar utility toolbox for graphics and simulation. The boundary is drawn by what it operates on (scalars, seeds, coordinates → scalars) and what it never touches (vectors as value types, matrices, scene graphs, GPU, entities).

Where it ends vs. a neighbor:

- **vs. `@flighthq/geometry`** — `math` is _scalar_ (operates on `number`s and writes `out.x/y/z` for the few vector-sampling random helpers). Vector/matrix/rectangle value types and their algebra live in `geometry`. `math` is the substrate `geometry` and everyone else compute on top of.
- **vs. `@flighthq/materials`** — materials is a rendering subsystem (PBR taxonomy, color transforms). `randomColor` lives here in `math` alongside the other random utilities — it produces a `number` (packed RGBA), not a materials-domain object (Decision #2).
- **Noise** — value/gradient/simplex/fbm noise functions are pure scalar math (coordinates → value), not a separate domain. They belong in `math` as additional modules, built on the existing hash seed layer (Decision #1).

## North star

1. **Pure scalar primitives, no state, no allocation in hot paths.** Every export is a free function with explicit inputs; vector-sampling helpers write into an `out` parameter and are alias-safe. This is the irreducible-primitive bedrock — the thing every other package computes on top of, so it must be the most portable layer in the SDK.
2. **Canonical names from the graphics/games vocabulary.** Functions use the names a shader author or game dev already reaches for — `saturate`, `smoothStep`, `smootherStep`, `fract`, `lerp`, `damp`, `lerpAngle`, `ceilPowerOfTwo`. The right name is the industry-recognized one, full and unabbreviated.
3. **Sentinel-vs-throw applied with discipline.** Expected-failure paths return sentinels (`pick` → `undefined`, `randomWeighted` → `-1`, statistics → `NaN`, degenerate range → an endpoint); only genuine programmer misuse throws (`euclideanMod` 0 divisor, `factorial` of a negative, `randomInt` min>max). The split is part of the contract, not incidental.
4. **A refactoring destination, not a proactive expansion target.** The current AAA surface covers the full scalar toolbox. New functions are added when a concrete consumer is identified — typically by extracting duplicated scalar math from other packages into shared helpers here. No speculative additions (Decision #5).
5. **A value-typed, deterministic, portable leaf.** No GPU, no entity/graph machinery, deterministic given a seed, headlessly fingerprint-able — the cleanest Rust port target and a Wasm-mixing candidate. Nothing here should acquire hidden state, eager side effects, or a non-trivial dependency.

## Boundaries

**In scope:**

- Scalar constants, clamping/range, interpolation (basic + advanced), angle math, rounding, scalar power-of-two / quantize, number theory, comparison/epsilon helpers, statistics.
- Seeded randomness (`createRandomSource`), random ranges, random distributions, and the vector-sampling random helpers that write into an `out` (disc/circle/sphere).
- Stateless hashing (`hashUint32`, `hashCombine`, `hash2D/3D`) and the hash→PRNG bridge.
- Noise functions (value, gradient, simplex, fbm) as pure scalar math (Decision #1).
- `randomColor` — a random utility that produces a packed RGBA `number` (Decision #2).

**Non-goals:**

- **Vector / matrix / rectangle value types and their algebra** — `@flighthq/geometry`.
- **Color transforms, PBR materials, blend math** — `@flighthq/materials` is a rendering subsystem; `math` only produces random color _values_.
- **GPU, entity/runtime, or scene-graph concerns** — `math` is a pure leaf and stays one.
- **Dependencies beyond `@flighthq/types`** — keep the leaf minimal and Wasm-mixable.

## Decisions

- **[2026-07-02] Noise belongs in `math`, not a separate `@flighthq/noise` package.** Noise functions (value, gradient, simplex, fbm) are pure scalar math — coordinates in, scalar out, no state, no object. The hash layer (`hash2D`, `hash3D`, `createRandomSourceFromHash`) is already in `math` as the seed for noise; noise is the next layer of the same onion. A separate `@flighthq/noise` would be over-decomposition — blood from a stone. **Resolves Open direction #1.**

  **Why:** The bedrock test asks whether a unit is irreducibly simple or still bundles hidden primitives. Noise functions are individual pure functions, not a subsystem — they are the same kind of primitive as `lerp` or `smoothStep`. Splitting them out adds a package boundary for no tree-shaking or comprehension benefit.

- **[2026-07-02] `randomColor` belongs in `math`, not `materials`.** `materials` has grown into a rendering subsystem (PBR taxonomy, color transforms, effects). `randomColor` is a random utility that happens to produce a packed RGBA integer (`number`) — it lives alongside `randomInt`, `randomRange`, `randomGaussian`. The output format is a number, not a materials-domain object. **Resolves Open direction #2.**

  **Why:** The randomness machinery is here. Materials is a separate subsystem; `randomColor` has no relationship to PBR, blend modes, or color transforms. Placing it in materials because "it produces a color" would scatter the random family across packages for no gain.

- **[2026-07-02] `saturate` follows GPU NaN semantics (NaN → 0); `clamp` keeps NaN-propagation.** `saturate` is named after the HLSL/GLSL intrinsic and should match its behavior: NaN input returns 0. `clamp` is generic scalar clamping — JS `Math.min`/`Math.max` semantics with NaN-propagation, no extra branch. This gives users a clear choice: `saturate` for NaN-safe [0,1] clamping (GPU convention), `clamp` for raw speed with NaN-propagation. **Resolves Open direction #5.**

  **Why:** A function named after a GPU intrinsic should behave like that intrinsic. The cost is one `value !== value` check in `saturate` — negligible for a function that already does two comparisons. `clamp` stays branchless because NaN-propagation is the natural JS behavior and adding a guard to a 3-param generic clamp is a different tradeoff.

- **[2026-07-02] Particles should adopt `math` exports instead of inlining duplicates.** `@flighthq/particles` inlines `clamp01` (two copies) which is `saturate`, uses `Math.PI * 2` which is `TAU`, and inlines uniform disc sampling which is `randomInsideUnitDisc`. The `math` names are the correct generic names: `saturate` (GPU convention, better than `clamp01`), `TAU` (modern constant name), `randomInsideUnitDisc` (mathematically precise — disc = filled interior, circle = boundary). Performance must be verified equivalent; the inline scalar disc sampling avoids a scratch vector, so the builder should confirm the out-param version is equivalent or keep the inline form if it matters. **Resolves Open direction #6, cross-package.**

  **Why:** The SDK's cellular architecture exists so packages share primitives rather than inlining them. The `math` names are industry-standard and more precise than the ad-hoc inlined versions. Consolidation reduces maintenance surface and ensures consistent behavior (e.g., the NaN contract on `saturate`).

- **[2026-07-02] As-needed growth model — `math` is a refactoring destination, not a proactive expansion target.** The current ~80-function surface covers the full Bronze/Silver/Gold scalar toolbox. New functions are added only when a concrete consumer is identified — typically by extracting duplicated scalar math from other packages. Speculative additions (`wrap`/`wrapInt`, `cyclicLerp`, `mapClamped`) wait for a real use case. **Resolves Open direction #8.**

  **Why:** A bedrock package should be stable. Proactive expansion adds maintenance surface and API weight for hypothetical consumers. The "refactoring destination" model ensures every function earns its place by having a real caller.

- **[2026-07-02] Update `package.json` description to match actual scope.** The description reads "General math utilities: seeded random and power-of-two rounding" — stale from the two-function stub era. Update to reflect the full scalar toolbox. **Resolves Open direction #7 (admin).**

  **Why:** The description should match reality. The scope expansion from stub to full toolbox is acknowledged and blessed.

## Open directions

1. **Rust `flighthq-math` crate priority.** The charter front matter asserts `crate: flighthq-math` and the Rust conformance map mandates 1:1 conformance, but the crate does not exist. This is the cleanest port target in the codebase (pure free functions, deterministic, value-typed mixing leaf). Should it be prioritized as the first conformance/mixing proof? _(Was #3.)_

2. **Wasm mixing candidate tracking.** `math` is plainly a mixable leaf (pure value-typed, deterministic, no GPU). Worth recording on the mixing-candidate list alongside `surface` / `geometry` / `path`. _(Was #4.)_
