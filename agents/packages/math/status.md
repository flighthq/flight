---
package: '@flighthq/math'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# math — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Attempted the assessment's five Recommended items. **All five parked — blocked by a source/assessment discrepancy in this worktree.**

Live state of `packages/math/src/` in this worktree:

- `index.ts` (barrel: `export * from './nextPowerOfTwo'` and `'./random'`)
- `nextPowerOfTwo.ts` (+ test) — only `nextPowerOfTwo`
- `random.ts` (+ test) — only `createRandomSource` and `export type { RandomSource }`

That is a two-function stub. The assessment (2026-06-24), this status log's prior entry ("277 tests passing across 15 files"), and the package's `dist/` (which still contains compiled `clamp.js`, `comparison.js`, `constants.js`, `hash.js`, `interpolation.js`, `interpolationAdvanced.js`, `rounding.js`, `scalar.js`, `statistics.js`, `randomRange.js`, `randomDistributions.js`, `angle.js`, …) all describe a fully-built ~15-module AAA package. The `dist/` is a stale build from that fuller state; the current `src/` no longer contains those modules.

Consequence: every Recommended item targets a function that is **absent from the live `src/`**, so none is executable as a minimal doc/cleanup sweep:

1. `previousPowerOfTwo` doc comment — function not in `src/` (only `nextPowerOfTwo` exists).
2. Duplicate `RandomSource` re-export — only `random.ts` exists; `randomRange.ts` is not in `src/`, so there is no duplicate to remove. The single re-export in `random.ts` is already the lone home.
3. `lcm` overflow doc note — `lcm` not in `src/`.
4. `saturate`/`clamp` NaN doc — neither `saturate` nor `clamp` in `src/`.
5. `order:check` confirmation — not run (Phase-3 forbids order commands); the live `src/` is two single-function files plus an alphabetized barrel, so ordering is trivially satisfied.

No source edits made. Own-tests verified green (`npm run test --workspace=packages/math`: 2 files, 9 tests passing) against the current stub. **Surfaced to user:** the live `src/` appears to have regressed to a stub relative to the assessment/status/`dist`. Re-authoring the missing modules is a build, not a Recommended sweep, and is out of this task's scope. Recommend a direction/review pass to confirm whether the reduction was intentional before the sweep items can apply.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/math

**Session date:** 2026-06-24 **Estimated score:** 92/100 (Gold)

## Decision resolved

The `math` vs `random` scope question was resolved in favor of **build out to AAA `math` scope**, matching the depth review's preferred path. The package is added to the Package Map in `agents/index.md` and the `package.json` description reflects the full scope.

## Implemented APIs

### Bronze — Constants, clamping, interpolation, angles, rounding, comparison, power-of-two family, random conveniences

**`constants.ts`**

- `EPSILON` — smallest useful floating-point comparison tolerance (1e-6)
- `TAU` — full circle (2π)
- `HALF_PI` — π/2
- `DEG_TO_RAD` — degrees → radians multiplier
- `RAD_TO_DEG` — radians → degrees multiplier

**`clamp.ts`**

- `clamp(value, min, max)` — inclusive range clamp
- `saturate(value)` — clamp to [0, 1], named after HLSL/GLSL convention
- `inRange(value, min, max)` — range membership test

**`interpolation.ts`**

- `inverseLerp(a, b, value)` — inverse of lerp, safe for a === b
- `lerp(a, b, t)` — linear interpolation, unclamped
- `remap(value, inMin, inMax, outMin, outMax)` — range mapping
- `smoothStep(edge0, edge1, x)` — cubic Hermite (GLSL smoothstep)
- `step(edge, x)` — GLSL step function

**`angle.ts`**

- `degToRad(degrees)`
- `deltaAngle(from, to)` — shortest signed arc in (-π, π]
- `normalizeAngle(radians)` — wraps to [-π, π); note π maps to -π
- `radToDeg(radians)`

**`rounding.ts`**

- `ceilTo(value, step)` — ceil to nearest multiple of step
- `euclideanMod(value, divisor)` — always-positive modulo; throws on divisor === 0
- `floorTo(value, step)` — floor to nearest multiple of step
- `fract(value)` — fractional part, sign-preserving (mirrors GLSL)
- `roundTo(value, step)` — round to nearest multiple (snap/quantize)

**`comparison.ts`**

- `approxEqual(a, b, epsilon?)` — absolute-epsilon equality
- `approxEqualRelative(a, b, relativeEpsilon?)` — relative-epsilon, scales with magnitude
- `approxZero(value, epsilon?)` — near-zero test

**`nextPowerOfTwo.ts`**

- `isPowerOfTwo(n)` — exact power-of-two test
- `nextMultipleOf(value, multiple)` — ceiling to nearest multiple
- `nextPowerOfTwo(n)` — bit-twiddling (not Math.pow-based, stable on large ints)
- `previousPowerOfTwo(n)` — floor to power of two

**`randomRange.ts`** — random convenience functions

- `randomBool(random, probability?)` — random boolean with given probability
- `randomInt(random, min, max)` — uniform integer in [min, max]
- `randomRange(random, min, max)` — uniform float in [min, max)
- `randomSign(random)` — returns 1 or -1 equally

### Silver — Advanced interpolation, number theory, random distributions, scalar extras

**`interpolationAdvanced.ts`**

- `damp(current, target, lambda, deltaTime)` — frame-rate-independent exponential decay
- `lerpAngle(a, b, t)` — shortest-arc angle interpolation
- `moveTowards(current, target, maxDelta)` — clamped approach, no overshoot
- `pingPong(t, length)` — bounce/ping-pong oscillation
- `repeat(t, length)` — wrapping repeat
- `smootherStep(edge0, edge1, x)` — Ken Perlin quintic (zero first+second derivative at edges)

**`numberTheory.ts`**

- `factorial(n)` — non-negative integer factorial; throws for negative/non-integer
- `gcd(a, b)` — Euclidean GCD; throws for (0, 0)
- `hypot2(x, y)` — squared hypotenuse, allocation-free distance comparison
- `isEven(n)` / `isOdd(n)` — parity tests
- `lcm(a, b)` — least common multiple

**`randomDistributions.ts`** — full particle-emitter distribution set (Silver coverage)

- `pick(random, items)` — uniform element selection (undefined for empty)
- `randomGaussian(random, mean?, stdDev?)` — Box-Muller normal distribution
- `randomGaussianPair(random, mean?, stdDev?)` — full Box-Muller pair (2 values, 2 draws)
- `randomInsideUnitDisc(random, out)` — uniform disc, rejection sampling, alias-safe
- `randomOnUnitCircle(random, out)` — unit circle (x² + y² = 1), alias-safe
- `randomOnUnitSphere(random, out)` — unit sphere (Marsaglia method), alias-safe, Vector3Like out
- `randomWeighted(random, weights)` — proportional index selection; -1 for empty/zero
- `shuffle(random, items)` — Fisher-Yates copy (allocates)
- `shuffleInPlace(random, items)` — Fisher-Yates in-place mutating variant

**`scalar.ts`**

- `ceilPowerOfTwo(n)` — alias for nextPowerOfTwo, texture-sizing clarity
- `floorPowerOfTwo(n)` — alias for previousPowerOfTwo, texture-sizing clarity
- `quantize(value, steps, min, max)` — discretize into N+1 equal buckets
- `sign(value)` — zero-aware sign: returns -1, 0, or 1

### Gold — Hashing, statistics, robust comparison, additional distributions, benchmarks

**`hash.ts`**

- `createRandomSourceFromHash(x, y)` — grid-cell → independent RandomSource bridge
- `hash2D(x, y)` — stateless 2D integer grid hash
- `hash3D(x, y, z)` — stateless 3D integer grid hash
- `hashCombine(seed, value)` — Murmur3-inspired hash combiner
- `hashUint32(value)` — fmix32 finalizer, deterministic uint32

**`statistics.ts`**

- `mean(values)` — arithmetic mean; NaN for empty
- `median(values)` — median (allocates sorted copy); NaN for empty
- `standardDeviation(values)` — population std dev; NaN for empty
- `variance(values)` — population variance; NaN for empty
- `weightedAverage(values, weights)` — proportionally weighted mean; NaN for zero total weight

**`randomDistributions.ts`** (Gold additions — second pass)

- `randomExponential(random, rate?)` — exponential distribution via inverse CDF; throws rate ≤ 0
- `randomInsideUnitSphere(random, out)` — uniform ball interior, 3D rejection sampling, alias-safe, Vector3Like out
- `randomPoisson(random, lambda?)` — Poisson integers via Knuth's multiplicative algorithm; throws lambda ≤ 0

**`bench/math.bench.ts`** — Vitest benchmark suite (development-only, not in `src/` or compiled dist)

- Covers: `clamp`, `saturate`, `lerp`, `smoothStep`, `smootherStep`, `damp`, `lerpAngle`, `moveTowards`
- Covers: `randomBool`, `randomInt`, `randomRange`
- Covers: `randomGaussian`, `randomExponential`, `randomPoisson`, `randomOnUnitCircle`, `randomInsideUnitDisc`, `randomOnUnitSphere`, `randomInsideUnitSphere`
- Observed throughput: ~12-15M ops/sec for clamp/lerp/saturate; ~9-11M ops/sec for Gaussian/Poisson/OnSphere

## SDK barrel

`@flighthq/math` is re-exported from `@flighthq/sdk` via `packages/sdk/src/index.ts` (line 38: `export * from '@flighthq/math'`). All math functions are tree-shakable from the SDK barrel.

## Test results

All 277 tests pass across 15 test files. Tests cover:

- Determinism (same seed → same sequence) for all random functions
- Alias-safety for all out-parameter functions (`randomOnUnitCircle`, `randomInsideUnitDisc`, `randomOnUnitSphere`, `randomInsideUnitSphere`)
- Edge cases: empty arrays, zero divisors, inverted ranges, NaN, out-of-range t values, rate/lambda ≤ 0
- Frame-rate independence property of `damp`
- Range invariants: `randomExponential` always ≥ 0, `randomPoisson` always non-negative integer
- Statistical mean properties: exponential mean ≈ 1/rate, Poisson mean ≈ lambda (verified at 5000 samples)
- Sphere interior: `randomInsideUnitSphere` produces points with radius ≤ 1

## Deferred items and why

### `@flighthq/noise` neighbor package split (Gold, large scope)

The roadmap suggests `valueNoise2D`, `gradientNoise2D`, Perlin/simplex/fbm noise as either part of `math` or a neighbor `@flighthq/noise` package. The hashing primitives (`hashUint32`, `hash2D`, `hash3D`) provide the foundation. Deferred because: (a) noise adds significant scope (5–8 files), (b) the roadmap explicitly flags the neighbor-package split as a design decision for the user, and (c) the threshold for inclusion in `math` vs a separate package is unclear.

### `randomColor` (Gold)

The roadmap notes `randomColor` helpers (packed RGBA) as a Gold item with the question: does this belong in `math` or `@flighthq/materials`? Deferred — this is a cross-package design call.

### Rust parity (`flighthq-math` crate)

The Gold roadmap requires a 1:1 Rust port with `create_random_source` (mulberry32), the full scalar toolbox, hashing, and noise as free functions. This is in the `rust` worktree, not the `builder` worktree. The TS Gold surface is now stable (all distributions implemented), making this a clean porting target. Deferred: it should be its own Rust-worktree session. Add to conformance map when implementing.

### Particle emitter integration

The `@flighthq/particles` package has its own inline spawn geometry in `spawnShape.ts` and a local `clamp01` helper in `updateParticleEmitter.ts`. The `randomInsideUnitDisc`, `randomOnUnitCircle`, and related functions from `@flighthq/math` are directly applicable to the spawn shape calculations. Deferred because: (a) the particles package owns its own simulation and the integration requires coordinating across package boundaries, and (b) the existing spawn math is already correct and performant — adopting math helpers would be a cleanup, not a bug fix.

## Design choices made in this session

### `randomExponential` — inverse CDF method

Uses `-ln(U) / rate`. The alternative (generating via a Poisson process incrementally) is slower and less numerically clean. Throws on rate ≤ 0 (programmer error — no valid exponential distribution exists for non-positive rates).

Zero protection: `u === 0 ? Number.EPSILON : u` avoids `ln(0) = -Infinity`. A PRNG producing exactly 0 is extremely rare but not impossible (mulberry32 can produce it).

### `randomPoisson` — Knuth multiplicative algorithm

Generates k by multiplying uniform samples until their product drops below `exp(-lambda)`. Simple, exact, and fast for small lambda (≤ ~30). For large lambda the Gaussian approximation (`randomGaussian(random, lambda, sqrt(lambda))`) is preferred. Throws on lambda ≤ 0.

Alternative (Gallagher method) would be faster for large lambda but adds complexity; at lambda=3 this implementation runs at ~9.8M ops/sec which is adequate for particle emitters.

### `randomInsideUnitSphere` — 3D box rejection sampling

Samples from `[-1, 1]³` until inside the unit sphere. Expected draws ≈ 1.91 (π/6 sphere-to-cube ratio). Alternatives: cosine-weighted hemispherical sampling (not uniform over the whole sphere), or a 2D + radius approach (more complex without clear advantage for the general case).

### Benchmark placement — `bench/` outside `src/`

The `packages:check` script enforces no top-level side effects in `src/` modules, which correctly flags `describe()`/`bench()` calls. Benchmark files are placed in `bench/` (outside `src/`, outside the tsconfig `include`) so they are development-only tools, not compiled artifacts. They import via `@flighthq/math` so the built package is what gets benchmarked.

Run benchmarks with: `npx vitest bench --config packages/math/vitest.config.ts`

## Concerns and surprises

- **`normalizeAngle` range is `[-π, π)` not `[-π, π]`**: π maps to -π (documented, test expectations corrected in first pass)
- **`hashCombine` signed integer**: original used `| 0` (signed) — fixed to `>>> 0` (unsigned) in first pass
- **`randomPoisson` for large lambda**: the Knuth algorithm degenerates for lambda > 30 (many multiplications). The function's doc comment notes this and points to `randomGaussian` as the approximation. No throw — the function still produces valid results, just slowly.

## Score rationale (92/100)

**Strengths (+92):**

- Complete Bronze/Silver/Gold scalar toolbox as defined in the maturation roadmap
- All Gold distributions implemented: Gaussian, Gaussian-pair, Exponential, Poisson, on-unit-circle, on-unit-sphere, inside-disc, inside-sphere, weighted, pick, shuffle
- Deterministic hashing suite (hash2D/3D, hashCombine, hashUint32, createRandomSourceFromHash)
- Statistics module (mean, median, variance, stddev, weightedAverage)
- Benchmarks for hot helpers with documented throughput
- 277 tests passing across 15 files
- No package check errors (math-specific)
- SDK barrel integration confirmed
- All exports alphabetized, functions alias-safe, out-params documented

**Gaps (−8):**

- No noise functions (value, gradient, simplex, fbm) — deferred as neighbor-package design call (−4)
- No Rust port (`flighthq-math` crate) — deferred as cross-worktree work (−3)
- `randomColor` not implemented — cross-package ownership question unresolved (−1)

## Suggestions for future sessions

1. **Implement `@flighthq/noise`** as a neighbor package — `hash2D`/`hash3D` are ready as the seed layer. Start with `valueNoise2D` (table lookup via hash), then `gradientNoise2D` (Perlin), then `simplexNoise2D`, then `fractalNoise`/fbm. The clean value-in/value-out seam makes this a candidate for the **mixing** tier (Rust wasm drop-in).
2. **Rust port** — implement `flighthq-math` in `crates/` following the conformance map. All functions are pure free functions with no dependencies on entity/graph machinery, making this the cleanest Rust-port target in the codebase. Add conformance tests verifying identical output for same-seed sequences.
3. **`randomColor` design call** — decide math vs. materials ownership, then implement.
4. **Particle emitter cleanup** — coordinate with `@flighthq/particles` to use `randomInsideUnitDisc`, `randomOnUnitCircle`, `randomGaussian`, and `randomWeighted` instead of inlining spawn math. The local `clamp01` in `updateParticleEmitter.ts` could use `saturate` from `@flighthq/math`.
