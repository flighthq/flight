---
package: '@flighthq/math'
status: solid
score: 89
updated: 2026-09-02
ingested:
  - charter.md (2026-07-02, with decisions)
  - status.md (2026-08-08)
  - assessment.md (2026-07-31)
  - review.md (prior, 2026-06-24, score 88)
  - source (all 15 source files + contract.ts + index.ts, full read)
  - tests (all 15 test files, 325 tests, full read of representative files)
  - package.json
---

# math — Review

Evidence source: live worktree (`packages/math/src/`). Rereview superseding the 2026-06-24 review (solid, 88); all six assessment sweep items from 2026-07-02 have landed, verified against source.

## Verdict

**solid -- 89/100.** The package is a mature, well-shaped scalar toolbox: 15 source modules, 73 value exports (6 constants + 67 functions) and 1 type re-export (`RandomSource`), 15 colocated test files with 325 tests. Every defect the prior review docked points for has been fixed: `previousPowerOfTwo` doc comment corrected, duplicate `RandomSource` re-export removed, `lcm` overflow note added, `saturate` GPU NaN semantics implemented (NaN returns 0), `package.json` description updated, and `order:check` confirmed green. The score ticks up one point from 88 to 89, reflecting the landed fixes and the increased test count (325, up from 277). It does not reach 90+ because the chartered noise tier and `randomColor` remain unbuilt, three files inline `Math.PI * 2` instead of importing the exported `TAU` constant, and the Rust crate is absent.

## Status-doc verification (as-claimed -- verified)

Every concrete claim in `status.md` (2026-08-08) is verified against the live tree:

- **Noise blessed but not built** -- confirmed: no `noise.ts` in `packages/math/src/`, no noise export in `contract.ts`. The hash layer (`hash2D`, `hash3D`, `createRandomSourceFromHash`) is present as the documented seed layer.
- **`randomColor` blessed but absent** -- confirmed: repo-wide grep for `randomColor` in `packages/` returns zero matches.
- **Particles inline duplicates** -- confirmed: `packages/particles/src/updateParticleObjects.ts:11` defines `const TWO_PI = Math.PI * 2` and `:143` inlines scalar disc sampling. The `clamp01` copies are gone (verified).
- **No `crates/` directory** -- confirmed.
- **15 source modules** -- verified: `angle`, `clamp`, `comparison`, `constants`, `hash`, `interpolation`, `interpolationAdvanced`, `nextPowerOfTwo`, `numberTheory`, `random`, `randomDistributions`, `randomRange`, `rounding`, `scalar`, `statistics`, all barrelled from `contract.ts`.

## Present capabilities

Grounded in `packages/math/src/`, verified against each source file:

- **`constants.ts`** -- `EPSILON` (1e-6), `TAU` (2pi), `HALF_PI`, `DEG_TO_RAD`, `RAD_TO_DEG`, `CIRCLE_KAPPA` (cubic Bezier quarter-circle control distance, pinned by formula test).
- **`clamp.ts`** -- `clamp` (NaN-propagating), `saturate` (GPU NaN semantics: NaN returns 0, with `value !== value` guard), `inRange`.
- **`interpolation.ts`** -- `lerp`, `inverseLerp` (zero-range sentinel), `remap` (zero-range sentinel), `smoothStep` (GLSL cubic), `step`.
- **`interpolationAdvanced.ts`** -- `damp` (frame-rate-independent exponential decay), `lerpAngle` (shortest-arc radians), `moveTowards`, `pingPong` (NaN-propagating on non-positive length), `repeat` (NaN-propagating), `smootherStep` (Perlin quintic).
- **`angle.ts`** -- `degToRad`, `radToDeg`, `deltaAngle` (shortest signed difference), `normalizeAngle` (wraps to `[-pi, pi)`).
- **`rounding.ts`** -- `ceilTo`, `floorTo`, `roundTo`, `fract` (sign-preserving GLSL form), `euclideanMod` (throws on 0 divisor).
- **`comparison.ts`** -- `approxEqual` (absolute epsilon), `approxEqualRelative` (magnitude-scaled with absolute floor), `approxZero`.
- **`nextPowerOfTwo.ts`** -- `nextPowerOfTwo` (bit-twiddling, unsigned shift), `previousPowerOfTwo` (unsigned shift, doc fixed), `isPowerOfTwo`, `nextMultipleOf`.
- **`scalar.ts`** -- `ceilPowerOfTwo`/`floorPowerOfTwo` (texture-sizing aliases), `quantize`, `sign` (zero-aware).
- **`numberTheory.ts`** -- `factorial` (throws on negative, returns `Infinity` above 170), `gcd` (Euclidean, throws on both-zero and non-finite), `lcm` (overflow doc note present), `hypot2`, `isEven`, `isOdd`.
- **`randomRange.ts`** -- `randomBool`, `randomInt` (throws min>max), `randomRange`, `randomSign`.
- **`randomDistributions.ts`** -- `pick` (sentinel: `undefined`), `shuffle`/`shuffleInPlace` (Fisher-Yates), `randomWeighted` (sentinel: `-1`), `randomGaussian`/`randomGaussianPair` (Box-Muller), `randomExponential` (inverse CDF, throws non-positive), `randomPoisson` (Knuth, throws non-positive), `randomOnUnitCircle`, `randomOnUnitSphere` (Marsaglia), `randomInsideUnitDisc`/`randomInsideUnitSphere` (rejection sampling). All vector-sampling helpers are alias-safe (read into locals before writing `out`).
- **`hash.ts`** -- `hashUint32` (fmix32), `hashCombine` (Murmur3-inspired, `>>> 0` unsigned), `hash2D`, `hash3D`, `createRandomSourceFromHash` (hash-to-PRNG bridge).
- **`statistics.ts`** -- `mean`, `median`, `variance`, `standardDeviation`, `weightedAverage`. All return `NaN` for empty arrays. Uses Kahan-style compensated summation with magnitude scaling to avoid overflow and preserve precision at extreme values.
- **`random.ts`** -- `createRandomSource` (mulberry32, deterministic, 32-bit unsigned seed coercion).

The surface is pure free functions with explicit inputs, no hidden state, no allocation in hot paths (except `shuffle`, `median`, and `randomGaussianPair` which allocate by documented design). The sentinel-vs-throw split is applied with discipline: expected-failure paths return sentinels (`pick` returns `undefined`, `randomWeighted` returns `-1`, statistics return `NaN`, degenerate ranges return endpoints), while programmer errors throw `RangeError` (`euclideanMod` 0 divisor, `factorial` negative/non-integer, `gcd` both-zero/non-finite, `randomInt` min>max, `randomExponential`/`randomPoisson` non-positive, `weightedAverage` length mismatch).

## Gaps

1. **Noise functions unbuilt.** `valueNoise2D`, `gradientNoise2D` (Perlin), `simplexNoise2D`, `fractalNoise`/fbm -- blessed by charter Decision #1 to live in `math`, built on the existing `hash2D`/`hash3D` seed layer, but no `noise.ts` exists. This is the largest unbuilt chartered scope.

2. **`randomColor` unbuilt.** Blessed by charter Decision #2 to live in `math` alongside the other random utilities. No definition exists anywhere in the repo. Signature design (whether alpha is always 0xFF or parameterized) is still open per the assessment.

3. **`Math.PI * 2` inlined instead of importing `TAU`.** Three source files inline `Math.PI * 2` rather than importing the exported `TAU` constant: `interpolationAdvanced.ts:23` (defines a local `const TAU = Math.PI * 2` inside `lerpAngle`), `randomDistributions.ts:46,64,122` (uses `Math.PI * 2` in `randomGaussian`, `randomGaussianPair`, and `randomOnUnitCircle`). The `constants.ts` doc comment itself says "Prefer `TAU` over `2 * Math.PI` for clarity." This is the kind of self-contradiction the charter's Decision #4 pointed out in `@flighthq/particles` -- the same pattern exists within `math` itself.

4. **No Rust crate.** Charter front matter declares `crate: flighthq-math` and charter Open direction #1 explicitly identifies this as the cleanest port target in the codebase. The `crates/` directory does not exist in this repo; the crate lives in the separate `flight-rs` repo.

5. **Particles still inline duplicates.** `updateParticleObjects.ts:11` defines `const TWO_PI = Math.PI * 2` instead of importing `TAU`, and `:143` inlines scalar disc sampling instead of `randomInsideUnitDisc`. Cross-package work (per charter Decision #4), correctly noted in `status.md`.

## Charter contradictions

None. Every chartered Decision is either implemented or explicitly acknowledged in `status.md` as not-yet-built:

- **Decision #1** (noise in `math`): correctly tracked as unbuilt in status.
- **Decision #2** (`randomColor` in `math`): correctly tracked as unbuilt in status.
- **Decision #3** (`saturate` GPU NaN semantics): implemented. `saturate` guards `value !== value` and returns 0; `clamp` propagates NaN. Both behaviors are documented in JSDoc and tested.
- **Decision #4** (particles consolidation): partially addressed (`clamp01` copies are gone); remaining duplicates tracked in status.
- **Decision #5** (as-needed growth): the surface is stable at 73 exports; no speculative additions.
- **Decision #6** (`package.json` description): landed, reads "Scalar numeric utilities -- interpolation, clamping, angles, rounding, randomness, hashing, statistics, and number theory".

## Contract & docs fit

**Aligns with the contract -- strongly:**

- **Types-first:** every shared type (`RandomSource`, `Vector2Like`, `Vector3Like`) resolves to `@flighthq/types/contract`; no cross-package type defined inline. The one `export type { RandomSource }` re-export in `random.ts` is the canonical re-export, with a well-reasoned comment in `index.ts` explaining why it must be on its own `export type` line (ESM binding survival).
- **Two-lane exports:** `index.ts` (public) is a curated named-export list (73 values + 1 type); `contract.ts` (intra-SDK) uses `export *` from all 15 modules. Both lanes carry the same surface since the package has no contract-only exports. `package.json` exports both `.` and `./contract`.
- **Naming:** full unabbreviated function names (`createRandomSource`, `createRandomSourceFromHash`, `randomInsideUnitDisc`, `approxEqualRelative`). `create*` allocation verb used correctly. `get*` / `is*` / `has*` prefixes used where appropriate (`isPowerOfTwo`, `isEven`, `isOdd`).
- **Out-param convention:** vector-sampling helpers (`randomInsideUnitDisc`, `randomOnUnitCircle`, `randomOnUnitSphere`, `randomInsideUnitSphere`) read all inputs into locals before writing `out.x/y/z`. Alias safety is documented in JSDoc and tested.
- **Sentinel-vs-throw split:** matches the design constraint precisely (see Present capabilities). Expected failures return sentinels; programmer errors throw `RangeError`.
- **`sideEffects: false`:** declared in `package.json`. No module-level side effects verified across all 15 source files.
- **Dependency leaf:** only runtime dependency is `@flighthq/types`. No imports from any other `@flighthq/*` package. No external deps.
- **Alphabetized exports:** functions are alphabetized within each file (verified by inspection). Tests mirror source order with alphabetized `describe` blocks.
- **`Readonly<T>` usage:** applied to array parameters in `statistics.ts` (all 5 public functions + all internal helpers) and `randomDistributions.ts` (`pick`, `randomWeighted`, `shuffle`). Not applicable to the scalar-only functions (primitives do not require it per convention).
- **`import type` on its own line:** verified. `random.ts`, `randomRange.ts`, `randomDistributions.ts`, and `hash.ts` all use `import type { ... } from '@flighthq/types/contract'` on a separate line from value imports.

**Minor style observations (not point deductions):**

- The `constants.ts` CIRCLE_KAPPA comment is unusually long (14 lines) for a constant, but it carries genuine durable semantic content (why it is a literal rather than the expression, why minifiers cannot fold it) and meets the "add comments when a name cannot carry the full rule" standard.
- The `statistics.ts` internal functions (`scaledSum`, `scaledVariance`, `finiteAbsoluteScale`, `unscaledMean`, `unscaledVariance`, `unscaledWeightedAverage`, `midpoint`) are placed after the exported functions per the "loose module variables at the bottom" rule.

## Candidate open directions

1. **Noise tier build-out.** The largest unbuilt chartered scope. `valueNoise2D`, `gradientNoise2D`, `simplexNoise2D`, `fractalNoise`/fbm as a new `noise.ts` module, built on the `hash2D`/`hash3D` seed layer. This is a within-package builder task, not a design question (Decision #1 settled it).

2. **`randomColor` implementation.** Small within-package scope. Signature needs design: `randomColor(random: RandomSource): number` (packed RGBA) and whether alpha is always 0xFF or parameterized (per assessment Backlog).

3. **Internal `TAU` consistency.** Three source files inline `Math.PI * 2` instead of importing `TAU`. This is a trivial cleanup that brings the package in line with its own documented preference.

4. **Particles consolidation.** Cross-package: `@flighthq/particles` should replace `TWO_PI` with `TAU` and evaluate replacing inline disc sampling with `randomInsideUnitDisc`. Performance verification required for the disc sampling case (per charter Decision #4).

5. **Rust `flighthq-math` crate.** Cross-worktree, larger scope. The cleanest port target in the codebase (charter Open direction #1).

6. **Wasm mixing candidate registration.** Administrative: record `math` on the mixing-candidate list alongside `bitmap`/`geometry`/`path` (charter Open direction #2).
