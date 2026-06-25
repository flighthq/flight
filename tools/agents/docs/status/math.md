# @flighthq/math — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation had pruned `packages/math/src/` down to three files (`index.ts`, `nextPowerOfTwo.ts`, `random.ts`), but `dist/` proved a much larger module set had been authored and compiled. Reconstructed the lost `.ts` by merging `dist/<m>.js` (implementation + verbatim `//`-comments) with `dist/<m>.d.ts` (types) — the validated camera pattern — and reconstructed each `*.test.ts` from `dist/<m>.test.js`.

### Recovered modules (full module + colocated test)

- `angle.ts` — degToRad, deltaAngle, normalizeAngle, radToDeg
- `clamp.ts` — clamp, inRange, saturate
- `comparison.ts` — approxEqual, approxEqualRelative, approxZero
- `constants.ts` — EPSILON, TAU, HALF_PI, DEG_TO_RAD, RAD_TO_DEG
- `hash.ts` — createRandomSourceFromHash, hash2D, hash3D, hashCombine, hashUint32
- `interpolation.ts` — inverseLerp, lerp, remap, smoothStep, step
- `interpolationAdvanced.ts` — damp, lerpAngle, moveTowards, pingPong, repeat, smootherStep
- `numberTheory.ts` — factorial, gcd, hypot2, isEven, isOdd, lcm
- `randomDistributions.ts` — pick, randomExponential, randomGaussian, randomGaussianPair, randomInsideUnitDisc, randomInsideUnitSphere, randomOnUnitCircle, randomOnUnitSphere, randomPoisson, randomWeighted, shuffle, shuffleInPlace
- `randomRange.ts` — randomBool, randomInt, randomRange, randomSign (+ re-exports the `RandomSource` type)
- `rounding.ts` — ceilTo, euclideanMod, floorTo, fract, roundTo
- `scalar.ts` — ceilPowerOfTwo, floorPowerOfTwo, quantize, sign
- `statistics.ts` — mean, median, standardDeviation, variance, weightedAverage

### Functions recovered into an existing file

- `nextPowerOfTwo.ts` — added isPowerOfTwo, nextMultipleOf, previousPowerOfTwo (3 missing exports). Also replaced the surviving `nextPowerOfTwo` body: the pruned src used `Math.pow(2, Math.ceil(Math.log2(n)))`; the dist canonical uses integer bit-twiddling (stable on large values). Test expanded to mirror all four exports.

### index.ts

Added `export *` lines for all recovered modules, kept alphabetized.

### Types

All cross-package types the recovered modules need are present in `@flighthq/types`: `RandomSource` (RandomSource.ts), `Vector2Like` (Vector2.ts), `Vector3Like` (Vector3.ts). No `@flighthq/types` edits were required.

### Fossils skipped

None. Every recovered module is genuine scalar/random/geometry math — none implements any of the deliberately-dropped DisplayObject/Stage/Bitmap/Video/ Loader concepts.

### Parked

None.

### Test result

`npm run test --workspace=packages/math`: 15 files, 277 tests, all pass. Package typecheck (`tsc -p tsconfig.json --noEmit`): clean (exit 0). The duplicate `RandomSource` type re-export from both `random.ts` and `randomRange.ts` resolves to the same `@flighthq/types` declaration and is not an ambiguity error.
