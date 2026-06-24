---
package: '@flighthq/math'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/math.md
  - source
  - incoming/builder-67dc46d64
---

# math — Review

## Verdict

`solid — 88/100`. The package made the leap the prior depth review (`stub — 8/100`) recommended: it went from two functions (`createRandomSource`, `nextPowerOfTwo`) to a full Bronze/Silver/Gold scalar toolbox — 15 source modules, ~80 exported functions, 15 colocated test files with 277 assertions, all verified present in the bundle. The "build out to AAA `math` scope" fork was taken (over the alternative rename-to-`@flighthq/random`), and the Package Map now carries a real `@flighthq/math` entry. The worker's self-reported 92/100 is close; I land slightly lower because the Rust crate is absent (a hard charter/contract requirement, not just a roadmap nicety), one doc comment is wrong, and a couple of micro-redundancies/robustness gaps remain. None of this is structural — it is a genuinely mature, well-shaped leaf package.

## Status-doc verification (AS-CLAIMED → verified)

Every concrete claim in `status.md` checks out against the bundle source:

- **15 test files / 277 tests** — verified exactly (`ls *.test.ts` = 15; `grep -c it(` sums to 277).
- **Module/function inventory** (constants, clamp, interpolation, angle, rounding, comparison, nextPowerOfTwo, randomRange, interpolationAdvanced, numberTheory, randomDistributions, scalar, hash, statistics) — every listed file and function is present with the claimed signature.
- **Package Map addition** — confirmed: `base/tools/agents/docs/index.md` had zero `@flighthq/math` matches; the bundle `head` adds a full descriptive entry. **This is scope expansion** — flag to the user per the ingest rule (a new Package Map line + a charter authoring pass, both still pending — the charter is a seeded stub).
- **`package.json` description** — updated to the full scope, `sideEffects: false`, single `.` export, only `@flighthq/types` as a runtime dep. Verified.
- **Benchmarks in `bench/` outside `src/`** — verified present; correctly kept out of the tsconfig `include` so `packages:check`'s no-top-level-side-effects rule does not flag `bench()`/`describe()`.
- **Alias-safety / out-params** (`randomInsideUnitDisc`, `randomOnUnitCircle`, `randomOnUnitSphere`, `randomInsideUnitSphere`) — verified: all read inputs into locals before writing `out.x/y/z`.
- **Types-first** — `RandomSource`, `Vector2Like`, `Vector3Like` all resolve to `@flighthq/types`; no cross-package type is defined inline. Verified.

The status doc is trustworthy. The 92 vs 88 delta is judgement on weighting (see below), not a factual dispute.

## Present capabilities

Grounded in `incoming/builder-67dc46d64/head/packages/math/src/`:

- **`constants.ts`** — `EPSILON` (1e-6), `TAU`, `HALF_PI`, `DEG_TO_RAD`, `RAD_TO_DEG`.
- **`clamp.ts`** — `clamp`, `saturate` (HLSL/GLSL name), `inRange`.
- **`interpolation.ts`** — `lerp`, `inverseLerp`, `remap`, `smoothStep`, `step`. Division-by-zero guarded (`inverseLerp`/`remap` return a sentinel on a zero range).
- **`interpolationAdvanced.ts`** — `damp` (frame-rate-independent exponential decay), `lerpAngle`, `moveTowards`, `pingPong`, `repeat`, `smootherStep` (Perlin quintic).
- **`angle.ts`** — `degToRad`, `radToDeg`, `deltaAngle`, `normalizeAngle` (wraps to `[-π, π)`; π → -π, documented).
- **`rounding.ts`** — `ceilTo`, `floorTo`, `roundTo`, `fract` (sign-preserving GLSL form), `euclideanMod` (true positive modulo, throws on 0 divisor).
- **`comparison.ts`** — `approxEqual` (absolute), `approxEqualRelative` (magnitude-scaled with an absolute floor), `approxZero`.
- **`nextPowerOfTwo.ts`** — `nextPowerOfTwo` (now bit-twiddling, fixing the depth review's `Math.pow`/`log2` precision-drift concern), `previousPowerOfTwo`, `isPowerOfTwo`, `nextMultipleOf`.
- **`scalar.ts`** — `ceilPowerOfTwo`/`floorPowerOfTwo` (texture-sizing aliases), `quantize`, `sign` (zero-aware).
- **`numberTheory.ts`** — `factorial`, `gcd`, `lcm`, `hypot2`, `isEven`, `isOdd`.
- **`randomRange.ts`** — `randomBool`, `randomInt`, `randomRange`, `randomSign`.
- **`randomDistributions.ts`** — `pick`, `shuffle`/`shuffleInPlace` (Fisher–Yates), `randomWeighted`, `randomGaussian`/`randomGaussianPair` (Box–Muller), `randomExponential` (inverse CDF), `randomPoisson` (Knuth), `randomOnUnitCircle`, `randomOnUnitSphere` (Marsaglia), `randomInsideUnitDisc`/`randomInsideUnitSphere` (rejection sampling).
- **`hash.ts`** — `hashUint32` (fmix32), `hashCombine` (Murmur3-inspired, correctly `>>> 0` unsigned), `hash2D`, `hash3D`, `createRandomSourceFromHash` (the stateless-hash → seeded-PRNG bridge).
- **`statistics.ts`** — `mean`, `median`, `variance`, `standardDeviation`, `weightedAverage` (NaN sentinels for empty/zero-weight).
- **`random.ts`** — `createRandomSource` (mulberry32; carried over, unchanged, still the well-built core).

The whole surface is pure free functions with explicit inputs, no hidden state, no allocation in the hot paths, fully tree-shakable — exactly the C/C++-portable shape the codebase map asks for. The sentinel-vs-throw split is applied with care: expected-failure paths return sentinels (`pick` → `undefined`, `randomWeighted` → `-1`, statistics → `NaN`, range-mapping → endpoint), while genuine programmer errors throw `RangeError` (`euclideanMod` 0 divisor, `factorial` negative, `gcd(0,0)`, `randomInt` min>max, `randomExponential`/`randomPoisson` non-positive parameter, `weightedAverage` length mismatch). This matches the design constraint precisely.

## Gaps

A mature graphics/game math library still has room above this:

1. **Noise functions absent** — `valueNoise2D`, `gradientNoise2D` (Perlin), `simplexNoise2D`, `fractalNoise`/fbm. The `hash2D`/`hash3D`/`createRandomSourceFromHash` primitives are explicitly built as the seed layer for these, so the foundation is laid but the noise tier is unbuilt. The worker correctly flags this as a `math`-vs-`@flighthq/noise` neighbor-package design call — a candidate Open direction, not an in-scope omission.
2. **No Rust crate** — `flighthq-math` does not exist. The charter front matter declares `crate: flighthq-math` and the Rust map mandates 1:1 conformance; this is the single largest contract gap. The package is the _cleanest_ possible port target (pure free functions, no entity/graph machinery, deterministic, headlessly fingerprint-able — and a value-typed mixing leaf), so the gap is purely "not yet done in the rust worktree," not a design obstacle.
3. **`randomColor` not present** — packed-RGBA random helper. A cross-package ownership question (`math` vs `@flighthq/materials`); unresolved.
4. **`previousPowerOfTwo` doc comment is wrong** — it says "Clear all bits below the highest set bit," but the implementation _fills_ all low bits then does `(n + 1) >> 1`. The result is correct; the comment describes a different algorithm. Per "add comments only when they carry the rule, and leave files cleaner," this comment actively misleads and should be fixed.
5. **`lcm` overflow / order-of-operations** — `(|a| / g) * |b|` divides first (good, avoids one overflow class) but still has no guard for `|a*b|` exceeding `Number.MAX_SAFE_INTEGER`; large inputs silently lose precision. Acceptable for the SDK's use, but worth a doc note like `factorial`'s `Infinity`-above-170 note.
6. **Duplicate `RandomSource` re-export** — both `random.ts` and `randomRange.ts` carry `export type { RandomSource }`. The barrel dedupes identical re-exports so it compiles, but it is redundant public surface; one home (or none — consumers import it from `@flighthq/types`) is cleaner.
7. **`saturate`/`clamp` NaN behavior is inconsistent and undocumented** — `clamp` documents "NaN propagates" (true: `NaN < min` and `NaN > max` are both false → returns NaN), but `saturate` uses the same pattern and also returns NaN, while the GPU `saturate` it is named after returns 0 for NaN. Minor, but a hot-loop helper's NaN contract is worth stating explicitly.
8. **No combinatorics / smoothing breadth** — `clamp01` is covered by `saturate`, but a fuller toolbox might add `wrap`/`wrapInt`, `pingPong` for integers, `cyclicLerp`, or `mapClamped` (a clamped `remap`). These are low-value and speculative — listing for completeness, not as a real gap.

## Charter contradictions

None. The charter's "What it is" line (scalar helpers, randomness, interpolation, number-theory, range/clamp utilities) is fully and faithfully realized — the code is a superset of what the charter names. North star / Boundaries / Decisions are all `TODO`, so there is nothing more to contradict; the package cannot violate a rubric that has not been written. That silence is the dominant finding here (see Candidate open directions).

## Contract & docs fit

**Lives up to the contract — strongly:**

- Types-first: every shared type (`RandomSource`, `Vector2Like`, `Vector3Like`) resolves to `@flighthq/types`; no inline cross-package type. ✅
- Full unabbreviated names, `create*` allocation verb (`createRandomSource`, `createRandomSourceFromHash`), `out`-param convention with documented alias-safety, sentinels-over-throws with throws reserved for misuse. ✅
- Single root `.` export, `sideEffects: false`, thin barrel (`export *` only), only `@flighthq/types` as a dependency. ✅
- Exports appear alphabetized within each file (e.g. `randomDistributions.ts`: `pick`, `randomExponential`, `randomGaussian`, …) per source style; tests mirror source. ✅ (worth a final `npm run order:check` on the live tree, not verifiable from the bundle alone.)

**Where the contract/admin docs need revising (candidate revisions — user's gate):**

- **Charter is a seeded stub.** North star, Boundaries, and Decisions are all `TODO`. Given the package is now `solid`, the charter is the weakest link in the cell. It needs a direction pass — in particular a Boundary ruling on noise (in-package vs `@flighthq/noise`) and on `randomColor` (here vs `materials`).
- **`crate: flighthq-math` is asserted but unrealized.** The charter front matter and the conformance map imply a crate that does not exist yet. Not a doc error, but the register/conformance map should record `flighthq-math` as recommended-and-unbuilt so the gap is tracked, not silently assumed-done.
- **Package Map entry is new and unblessed.** The bundle adds the `@flighthq/math` Package Map line; this is scope expansion that should be acknowledged in a direction pass, not left as an inbound-as-claimed addition.

## Candidate open directions

The charter's silence forces these assumptions; each should become a real Open direction for the user to settle:

1. **Noise: in-`math` or a `@flighthq/noise` neighbor?** The hash layer is deliberately built as the seed for noise. Per structural-fork E (bedrock test) and the triad pattern, a noise package would be a clean value-in/value-out leaf and a strong Wasm-mixing candidate (fork D) — but it may equally be a `math` sub-module. This is the single biggest undecided scope question.
2. **`randomColor` home: `math` or `materials`?** Packed-RGBA output pulls toward `materials`; the randomness machinery lives here. A cross-package ownership call.
3. **Rust `flighthq-math` priority.** It is the cleanest port target in the codebase and a mixing leaf; should it be prioritized as the first conformance/mixing proof?
4. **Particle-emitter consolidation.** `@flighthq/particles` inlines spawn geometry (`spawnShape.ts`) and a local `clamp01` in `updateParticleEmitter.ts` that now duplicate `randomInsideUnitDisc`, `randomOnUnitCircle`, `randomWeighted`, and `saturate`. Adopting the `math` helpers is a cleanup, not a bug fix — and a cross-package coordination, so it is a direction question, not a sweep item.
5. **Is `math` a Wasm-mixable leaf (fork D)?** It plainly is (pure value-typed, deterministic, no GPU). Worth recording on the mixing-candidate list alongside `surface`/`geometry`/`path`.
6. **NaN-contract policy for hot helpers.** Whether `saturate`/`clamp` should propagate NaN or sanitize it — a small but real consistency decision for the interpolation/clamp family.
