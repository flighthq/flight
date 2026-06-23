# Depth Review: @flighthq/easing

**Domain:** Easing / interpolation timing functions for animation (the `t ∈ [0,1] → eased value` curve library that tween/timeline systems consume).

**Verdict:** authoritative — **90/100**

Taken alone, this is a complete, canonical easing library. It covers the entire industry-standard Penner family with correct In/Out/InOut variants, plus the modern CSS Easing primitives (`steps()` and `cubic-bezier()`) and the GPU-shader staples (smoothstep / smootherstep). The few gaps are convenience and parametrization niceties, not missing core curves.

## Present capabilities

Every export conforms to one shared contract: `EasingFunction = (t: number) => number` (defined in `@flighthq/types`), keeping the package value-typed, allocation-free for the fixed curves, and trivially tree-shakable (one file per family).

Polynomial / classic Penner families, each with `In` / `Out` / `InOut`:

- `easeLinear` (single function)
- `easeIn/Out/InOutQuadratic` (power 2)
- `easeIn/Out/InOutCubic` (power 3)
- `easeIn/Out/InOutQuartic` (power 4)
- `easeIn/Out/InOutQuintic` (power 5)
- `easeIn/Out/InOutSine`
- `easeIn/Out/InOutExponential` (with the canonical 0/1 endpoint guards)
- `easeIn/Out/InOutCircular`
- `easeIn/Out/InOutBack` (overshoot, standard `s = 1.70158`, InOut `s * 1.525`)
- `easeIn/Out/InOutElastic` (standard period/amplitude constants)
- `easeIn/Out/InOutBounce` (canonical 4-segment `7.5625` bounce)

Beyond Penner — the additions that distinguish this from a stale "Penner only" port:

- `easeSmoothstep` (Hermite `3t² − 2t³`) and `easeSmootherstep` (Perlin's `6t⁵ − 15t⁴ + 10t³`), the shader/procedural-graphics standards, correctly documented as zero-derivative-at-endpoints sigmoids.
- `easeSteps(count, position)` — a real CSS Easing Level 1 step function with all four `StepPosition` modes (`jumpStart` / `jumpEnd` / `jumpNone` / `jumpBoth`), implementing the proper jump-count and clamp algorithm, not a naive `floor`.
- `easeCubicBezier(x1, y1, x2, y2)` — the WebKit `UnitBezier` solver: polynomial coefficient setup, Newton-Raphson x→parameter inversion with a bisection fallback when the derivative collapses, and endpoint short-circuits. This is the authoritative implementation, not an approximation.

Test coverage is thorough: every source file has a colocated `*.test.ts`, including the harder cases (bezier accuracy, step semantics per position, elastic/bounce endpoints).

## Gaps vs an authoritative easing library

These are real but minor — convenience and meta-utilities rather than missing curves:

- **No curve combinators.** No `easeReverse(fn)` (mirror an In into an Out), no `easeInOut(inFn)` / `easeMirror`, no `easeChain`/`composeEasing` to splice two curves at a midpoint. Authoritative libraries (and d3-ease) often expose at least the "derive Out/InOut from In" transform. Here every variant is hand-written, which is fine for the fixed set but offers no way to lift a _user-supplied_ In curve.
- **No parametric overshoot/elastic.** `Back` and `Elastic` bake their constants (`1.70158`, period `0.4`). d3 and GSAP expose `backOut(overshoot)` and `elastic(amplitude, period)` configurable factories. Missing-by-omission for a "full-featured" claim, though most consumers never tune them.
- **No spring / physics easing.** No `easeSpring`/damped-harmonic generator (stiffness/damping/mass). Modern UI animation stacks (Framer Motion, React Spring) treat spring as a first-class easing source. This is the most defensible "missing-by-design" candidate — springs are time-unbounded and arguably belong in the tween/physics layer, not a pure `[0,1]→[0,1]` curve library — but an authoritative easing lib usually still ships a normalized spring.
- **No registry / name lookup.** No `getEasingByName('easeInOutCubic')` or a `Easing` name map. Reasonable to omit deliberately (a string registry would fight tree-shaking and the package's free-function style), but it's a feature CSS-parser/serialization consumers sometimes expect. Missing-by-design.
- **No input clamping by contract.** Fixed curves assume `t` is pre-clamped to `[0,1]` (documented in `easeSmoothstep`). `easeSteps`/`easeCubicBezier` do clamp; the polynomial families do not. An authoritative library would either clamp uniformly or document the precondition on the shared type. Minor consistency gap, not a missing feature.

Notably **not** gaps: the Penner set is complete, all three directions exist for every family, and the CSS + shader primitives are present. There is no "stub" smell anywhere.

## Naming / API-shape notes

- Naming is excellent and fully consistent with the project's "full unabbreviated type word" rule: `easeInOutQuadratic`, not `easeInOutQuad`; `easeExponential`, not `easeExpo`; `easeCircular`, not `easeCirc`. This is more correct than nearly every existing JS easing library, which abbreviate.
- The `easeIn` / `easeOut` / `easeInOut` ordering within files follows the alphabetized-export rule, and the family-per-file split is ideal for grepability and tree-shaking.
- `easeSteps` and `easeCubicBezier` are correctly modeled as _factories_ returning an `EasingFunction`, matching CSS semantics and the `create*`-allocates convention. The fixed curves are bare constants — the right call.
- `StepPosition` lives in `@flighthq/types` (the header layer), as required, rather than inline.
- One naming nit: `easeSmoothstep`/`easeSmootherstep` and `easeLinear` have no In/Out/InOut axis, which is correct (they are symmetric), but a reader scanning the API for symmetry should note these are intentionally single-form.

## Recommendation

Ship as-is for the core; it already qualifies as an authoritative easing library by curve coverage and implementation quality. To close the last 10 points and reach unambiguous AAA:

1. Add curve combinators that operate on an arbitrary `EasingFunction`: `easeReverse(fn)` (→ Out from In), `easeInOutFrom(fn)`, and an `easeMirror`. These are tiny, tree-shakable, and unlock user-supplied curves without hand-writing variants.
2. Add parametric factories `easeBack(overshoot)` and `easeElastic(amplitude, period)` alongside the baked constants, matching d3/GSAP.
3. Decide explicitly on spring: either add a normalized `easeSpring({ stiffness, damping, mass })` here, or document in the Package Map that springs are owned by the tween/physics layer (making it missing-by-design rather than by-omission).
4. Unify the clamping contract — either clamp `t` in the polynomial families too, or document the `[0,1]` precondition once on `EasingFunction` in `@flighthq/types`.
