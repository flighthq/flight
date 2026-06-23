# Depth Review: @flighthq/math

**Domain:** General-purpose numeric / math utilities (scalar helpers, randomness, interpolation, number-theory, range/clamp utilities) for a graphics + application SDK.

**Verdict:** stub — completeness 8/100

The package currently exports exactly two free functions: `createRandomSource(seed)` (a mulberry32 seeded PRNG returning a `RandomSource` callable in `[0, 1)`) and `nextPowerOfTwo(n)`. The package.json description is candid about this: "General math utilities: seeded random and power-of-two rounding." It is not even listed in the Package Map in `tools/agents/docs/index.md`, so there is no documented scope to measure intent against — but the package name `math` claims an extremely broad domain, and against that claim it is a stub.

## Present capabilities

- `createRandomSource(seed: number): RandomSource` — deterministic mulberry32 PRNG. Genuinely well done for what it is: 32-bit state coercion, non-finite seed handling (collapses to 0), cross-platform-stable output, good doc comment, tested. This single function is solid and authoritative for "seeded uniform float source."
- `nextPowerOfTwo(n: number): number` — rounds up to the next power of two (`n <= 1 → 1`). Correct and tested. Note it uses `Math.pow(2, Math.ceil(Math.log2(n)))` rather than the bit-twiddling integer form, which can drift on exact powers of two near float precision limits for very large inputs; a `(n--, n|=n>>1, …)` integer variant is the canonical implementation.

Both files are colocated-tested (`nextPowerOfTwo.test.ts`, `random.test.ts`) and the package is `sideEffects: false` and tree-shakable. Quality of the two existing functions is good; the problem is purely scope.

## Gaps vs an authoritative math-utilities library

A canonical numeric-utility module for a graphics/game SDK (compare: gl-matrix's common, three.js `MathUtils`, Unity `Mathf`, lodash math, `bottosson`/`almost-equal` style helpers) is expected to provide a broad scalar toolbox. Essentially all of it is absent here:

- **Clamping / ranges:** `clamp`, `saturate` (clamp01), `wrap`/`repeat`, `pingPong`, `inRange`.
- **Interpolation:** `lerp`, `inverseLerp`, `remap`/`mapRange`, `smoothStep`, `smootherStep`, `moveTowards`, `damp`/exponential decay, `lerpAngle`. (Note: easing curves are documented as living in `@flighthq/easing`, so curve easing is missing-by-design; but plain `lerp`/`smoothStep` are core math, not easing, and are missing-by-omission.)
- **Angles:** `degToRad`/`radToDeg`, `normalizeAngle`/`wrapAngle`, `deltaAngle`, `PI` family / `TAU` constants.
- **Rounding / quantization:** `roundTo`/`snap`/`quantize`, `floorTo`, `ceilTo`, `sign`, `fract`/`frac`, `mod`/`euclideanMod` (true modulo for negatives).
- **Comparison:** `approxEqual`/`almostEqual` with epsilon, `EPSILON` constant — important for a graphics SDK and conspicuously absent.
- **Power-of-two family:** only `nextPowerOfTwo` exists. Missing `isPowerOfTwo`, `previousPowerOfTwo`, `ceilPowerOfTwo`/`floorPowerOfTwo`, `nextMultipleOf` — the standard texture-sizing companions.
- **Random conveniences:** the PRNG is good, but the canonical companions are missing — `randomRange(rng, min, max)`, `randomInt`, `randomSign`, `randomBool`, `pick`/`sample`, `shuffle` (seeded), `randomGaussian`/normal distribution, `randomOnUnitCircle`/`randomInsideUnitDisc` (heavily used by particle emitters, which the docs explicitly cite as the PRNG's consumer).
- **Misc scalar:** `hypot2`, `gcd`/`lcm`, `factorial`, `isEven`/`isOdd`, bit helpers, `clamp01`, `step`.

Vector / matrix / rectangle math is correctly out of scope (owned by `@flighthq/geometry`), so those are missing-by-design and not counted against this package. But the scalar-utility surface above is the core identity of a package literally named `math`, and it is essentially empty.

## Naming / API-shape notes

- `createRandomSource` follows the SDK's `create*` allocation verb and returns a `RandomSource` type owned by `@flighthq/types` (header-layer-first, correct). Good.
- `nextPowerOfTwo` does not include a type word because it operates on a bare `number`; this is acceptable for scalar helpers, but the SDK's broader naming rule ("full unabbreviated type word") would suggest the future random companions adopt a consistent prefix (e.g. `randomRange`/`randomInt` taking a `RandomSource` as first arg, matching out-param/free-function style).
- Both functions are pure free functions with explicit inputs and no hidden state — fully aligned with the SDK's free-function, tree-shakable, C/C++-portable philosophy. The shape is right; the breadth is not.
- The package is absent from the documented Package Map, so its intended ceiling is undefined. Either it should be scoped down explicitly (e.g. renamed `@flighthq/random` if seeded randomness is truly the only intended responsibility) or built out to justify the `math` name.

## Recommendation

Treat this as an unfinished package, not a deliberate minimal one. Two paths:

1. **Build out to AAA `math` scope** (preferred given the name): add the scalar toolbox above — clamp/saturate, lerp/inverseLerp/remap/smoothStep, angle conversion + wrap/delta, approxEqual + EPSILON, the full power-of-two family, and seeded random conveniences (`randomRange`/`randomInt`/`pick`/`shuffle`/`randomGaussian`/`randomInsideUnitDisc`). Define any shared types in `@flighthq/types` first, colocate tests, and add the package to the Package Map. This is the highest-leverage work because particles, tweening, and procedural backgrounds all want these primitives and would otherwise reimplement them at call sites.
2. **Or rename to its true scope** — if the design intent is genuinely "seeded randomness + texture sizing," call it that (`@flighthq/random`, with `nextPowerOfTwo` moved to `geometry`/`surface` capacity helpers) so the name stops over-promising.

As it stands, the two functions present are correct and well-built, but the package does not approach the depth of an authoritative math-utilities library.
