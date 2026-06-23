---
id: math
title: '@flighthq/math'
type: depth
target: math
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/math.md
  - tools/agents/docs/reviews/depth/math.md
depends_on: []
updated: 2026-06-23
---

## Summary

stub — completeness 8/100. Two solid free functions (`createRandomSource`, `nextPowerOfTwo`) against a package name that claims the entire scalar-math domain; the scalar toolbox (clamp/lerp/angles/approxEqual/random conveniences) is essentially empty, and the package is absent from the Package Map.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% of scalar helpers that particles, tween, easing, surface sizing, and procedural backgrounds all reimplement at call sites today. All pure free functions on `number`, no new `@flighthq/types` entries needed except a `RandomSource`-adjacent decision (none required — `RandomSource` already exists).

- **Decision + docs (gate):** choose `math` (build-out) vs `random` (rename); add the chosen package to the Package Map in `tools/agents/docs/index.md`; rewrite the `package.json` description to match real scope.
- **Constants module** (`constants.ts`): `EPSILON`, `TAU` (`2π`), `HALF_PI`, `DEG_TO_RAD`, `RAD_TO_DEG`. Plain exported `const`s.
- **Clamp / range:** `clamp(value, min, max)`, `saturate(value)` (clamp01), `inRange(value, min, max)`.
- **Interpolation:** `lerp(a, b, t)`, `inverseLerp(a, b, value)`, `remap(value, inMin, inMax, outMin, outMax)`, `smoothStep(edge0, edge1, x)`, `step(edge, x)`.
- **Angles:** `degToRad(degrees)`, `radToDeg(radians)`, `normalizeAngle(radians)` (wrap to `[-π, π)`), `deltaAngle(from, to)`.
- **Rounding / quantization:** `roundTo(value, step)` (snap), `floorTo`, `ceilTo`, `fract(value)`, `euclideanMod(value, divisor)` (true non-negative modulo).
- **Comparison:** `approxEqual(a, b, epsilon = EPSILON)`.
- **Power-of-two family** (completes the existing companion): `isPowerOfTwo(n)`, `previousPowerOfTwo(n)`, `nextMultipleOf(value, multiple)`. Switch `nextPowerOfTwo` to the integer bit-twiddling form (`n--, n|=n>>1, …`) the review flagged for float drift on exact large powers.
- **Seeded random conveniences** (over the existing `RandomSource`, passed as first arg, free-function style): `randomRange(random, min, max)`, `randomInt(random, min, max)`, `randomSign(random)`, `randomBool(random, probability = 0.5)`.

Effort: ~1–2 days. Mechanical, one-file-per-function with colocated `*.test.ts`, alphabetized exports. No cross-package coordination beyond the Map entry.

### Silver

Competitive with three.js `MathUtils` / Unity `Mathf` / gl-matrix common: the professional edge cases, frame-rate-independent motion, and the random toolbox particle emitters actually want.

- **Interpolation, advanced:** `smootherStep(edge0, edge1, x)` (Ken Perlin's quintic), `moveTowards(current, target, maxDelta)`, `damp(current, target, lambda, deltaTime)` (frame-rate-independent exponential decay), `lerpAngle(a, b, t)` (shortest-arc), `pingPong(t, length)`, `repeat(t, length)` (wrap).
- **Rounding extras:** `ceilPowerOfTwo`/`floorPowerOfTwo` aliases for clarity at texture-sizing call sites, `sign(value)` (zero-aware), `quantize(value, steps, min, max)`.
- **Scalar number-theory / misc:** `gcd(a, b)`, `lcm(a, b)`, `factorial(n)`, `isEven(n)`/`isOdd(n)`, `hypot2(x, y)` (squared, allocation-free distance compares).
- **Random distributions + collections** (the emitter-facing set the review highlights):
  - `randomGaussian(random, mean = 0, standardDeviation = 1)` (Box–Muller / Marsaglia polar).
  - `randomOnUnitCircle(random, out)` and `randomInsideUnitDisc(random, out)` — out-param `Vector2`-shaped writes (use the `Vector2Like` structural input from `@flighthq/types`; do **not** depend on `@flighthq/geometry` — write into a caller-supplied `{ x, y }` out so the leaf stays dependency-light).
  - `pick(random, items)` / `sample` (single element), `shuffleInPlace(random, items)` (deterministic Fisher–Yates, mutates), `shuffle(random, items)` (allocates a copy).
  - `randomWeighted(random, weights)` — index by weight (particle spawn rules).
- **Determinism contract:** document and test that every `random*` helper is a pure function of the `RandomSource` state — same seed → same sequence across platforms (the existing PRNG's strongest property, now extended to the whole family). Add cross-run fingerprint tests.
- **Aliased out-param safety:** the `randomOnUnitCircle`/`randomInsideUnitDisc` out-params must be alias-safe (read before write) and tested in the aliased case per the SDK rule.

Effort: ~3–4 days. The only cross-package question is the out-param vector shape — settle on `Vector2Like` from `@flighthq/types` (header-first) so emitters can pass a geometry `Vector2` without `math` importing `geometry`.

### Gold

Authoritative scalar-math reference: exhaustive coverage, the deterministic hashing/noise frontier that procedural backgrounds need, full edge-case/error handling, and 1:1 Rust parity.

- **Deterministic hashing (`hash.ts`):** `hashUint32(value)`, `hashCombine(seed, value)`, `hash2D(x, y)`/`hash3D(x, y, z)` — stateless, position-seeded hashing so procedural content is reproducible without threading a `RandomSource`. Pairs with a `createRandomSourceFromHash` bridge.
- **Value/gradient noise (decision: keep here vs spawn `@flighthq/noise` neighbor):** `valueNoise2D`, `gradientNoise2D` (Perlin), `simplexNoise2D`/`3D`, `fractalNoise`/`fbm` (octaves, lacunarity, gain), `tilingNoise2D`. If this grows past a few files, split into a `@flighthq/noise` neighbor package (it has a clean, bounded, value-in/value-out seam) rather than bloating `math`. Surface this split as a design decision.
- **Statistics / aggregation:** `mean`, `median`, `variance`, `standardDeviation`, `clampedSum`, `weightedAverage` over readonly number arrays (analytics, auto-ranging).
- **Robust comparison:** `approxEqualRelative(a, b, relativeEpsilon)` (ULP/relative-tolerance variant for large magnitudes), `approxZero(value, epsilon)`.
- **Additional random distributions:** `randomGaussianPair`, `randomExponential`, `randomPoisson`, `randomOnUnitSphere(random, out)` / `randomInsideUnitSphere` (3D `Vector3Like` out) for 3D `@flighthq/scene` emitters, `randomColor` helpers (packed RGBA, matching the SDK color convention — surface as a decision: belongs in `math` or `materials`?).
- **Performance + portability:** integer/bit-twiddling implementations throughout (no `Math.pow`/`Math.log2` where an integer form exists), benchmarks for the hot helpers (`lerp`, `clamp`, `random*` in particle loops), and a documented "safe in hot loops, no allocation" contract per function.
- **Error/edge handling:** NaN/Infinity propagation tests for every helper, degenerate-range behavior (`min === max`, inverted ranges, `t` outside `[0,1]`), and `euclideanMod`/`gcd` zero-divisor sentinels (throw on misuse only — e.g. `gcd(0,0)`; clamp/lerp must never throw).
- **Docs + API sweep:** every export carries a doc comment with range, allocation, and determinism notes; `npm run api math` reads as a complete, symmetric scalar toolbox; entry promoted in the Package Map as AAA.
- **Rust parity (`flighthq-math` crate):** 1:1 port — `create_random_source` (mulberry32), `next_power_of_two`, the full scalar toolbox, hashing, and noise as free functions with `&mut`/out-params and snake_case names carrying the full type word. Conformance-tested against the TS output (same seed → identical sequences; same noise inputs → identical samples). Record in the conformance map; this is a value-typed leaf, so it is also a clean **mixing** candidate (`math-rs` wasm drop-in).

Effort: ~1–1.5 weeks for the TS Gold tier plus separate Rust port effort. Noise is the largest single chunk and the most likely neighbor-package split.

## Sequencing & effort

1. **Decision first (blocks everything):** `math` build-out vs `random` rename; add to Package Map; fix `package.json` description. If renamed, `nextPowerOfTwo` moves to `geometry`/`surface` capacity helpers and the rest of this roadmap collapses to the random tiers only. Recommend **build-out** per the depth review — particles, tween, easing, and surface sizing all want these primitives.
2. **Bronze** — pure scalar helpers + PoT family + basic random conveniences. No dependencies; ship immediately after the decision.
3. **Silver** — advanced interpolation, distributions, and collection random. **Cross-package dependency:** the `randomOnUnitCircle`/`randomInsideUnitDisc` out-param shape needs `Vector2Like` defined/confirmed in `@flighthq/types` (header-first); keep `math` free of a `@flighthq/geometry` dependency by writing into structural `{ x, y }` outs.
4. **Gold** — hashing → noise → stats → 3D distributions → Rust port. The Rust mirror should follow the TS Gold surface so it ports a stable API once.

**Cross-package / design items to surface to the user:**

- **Scope/name decision** (`math` vs `@flighthq/random`) and **Package Map omission** — must be resolved before any build-out; the package currently over-promises.
- **`@flighthq/noise` neighbor split** — likely warranted at Gold; clean value-in/value-out seam, keeps `math` from bloating. A design call, not autonomous.
- **`Vector2Like`/`Vector3Like` out-param shape** for random-on-shape helpers — confirm the header-layer type so emitters interoperate with `geometry` vectors without a `math → geometry` dependency.
- **`randomColor`** ownership — `math` (packed RGBA scalar) vs `@flighthq/materials`; decide before adding.
- **Particle emitter consumers** (`ParticleEmitterState`, `ParticleObjectsState` already hold a `RandomSource`) are the primary downstream — coordinate the random-family naming with whoever owns `@flighthq/particles` so emitters adopt the shared helpers instead of inlining spawn math.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/math` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
