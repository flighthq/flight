---
package: '@flighthq/easing'
status: authoritative
score: 92
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/easing

> **2026-09-02 correction of prior review.** The 2026-07-31 review claimed six parametric
> Back/Elastic factories existed (`easeInBackWith`, `easeOutBackWith`, `easeInOutBackWith`,
> `easeInElasticWith`, `easeOutElasticWith`, `easeInOutElasticWith`). None of these exist in
> the source. The actual parametric elastic family is `easeDampedSine` (`easeInDampedSine`,
> `easeInOutDampedSine`, `easeOutDampedSine` in `easeDampedSine.ts`), which takes
> `(amplitude, period)` and is tested for conformance against the fixed elastic constants.
> There is no parametric Back variant at all. The prior review also claimed `easeStep(threshold?)`
> existed; it does not.

## Verdict

`authoritative -- 92/100`. A canonical, well-structured timing-curve library covering the full
Penner family (11 families x In/Out/InOut), CSS primitives, shader staples, a complete combinator
set, a parametric power family, a parametric damped-sine (elastic) family, piecewise splicing,
LUT sampling, and a numerical derivative. The guard seam implements the diagnostics inversion rule.
Types live in `@flighthq/types`. The score dips from the prior 96 because two gaps that the prior
review misreported as present remain genuinely absent: parametric Back (`easeInBackWith(overshoot)`)
and a single-step convenience (`easeStep`). Neither is structurally hard, but they are missing
vocabulary a user reaching for them would expect.

## Present capabilities

21 source files, 21 colocated test files. 51 exports on the public lane (`index.ts`), 54 on the
contract lane (`contract.ts` adds `enableEasingGuards`, `disableEasingGuards`, `setEasingStepsGuard`).
Every export conforms to `EasingFunction = (t: number) => number` from `@flighthq/types/contract`,
except `easeSmoothstepRange` (returns `ScalarRemap`), `createEasingSamples` (returns `Float32Array`),
`getEasingDerivative` (returns `number`), and the guard/seam functions.

### Fixed curve families (constants, allocation-free)

Each family exports three `const` values typed as `EasingFunction`:

- **Polynomial** -- `easeLinear` (`easeLinear.ts`), `easeInQuadratic`/`easeOutQuadratic`/`easeInOutQuadratic` (`easeQuadratic.ts`), same pattern through `Cubic`, `Quartic`, `Quintic` -- 13 constants total.
- **Trigonometric** -- `easeInSine`/`easeOutSine`/`easeInOutSine` (`easeSine.ts`).
- **Circular** -- `easeInCircular`/`easeOutCircular`/`easeInOutCircular` (`easeCircular.ts`).
- **Exponential** -- `easeInExponential`/`easeOutExponential`/`easeInOutExponential` (`easeExponential.ts`); correctly handles the t=0/t=1 exact-endpoint cases.
- **Back** -- `easeInBack`/`easeOutBack`/`easeInOutBack` (`easeBack.ts`); baked overshoot constant `s = 1.70158`, InOut variant scales by `1.525` (correctly documented as a family that deliberately differs from the scaled-halves form).
- **Elastic** -- `easeInElastic`/`easeOutElastic`/`easeInOutElastic` (`easeElastic.ts`); baked period constants `p = 0.4` (In/Out) and `p2 = 0.45` (InOut).
- **Bounce** -- `easeInBounce`/`easeOutBounce`/`easeInOutBounce` (`easeBounce.ts`); piecewise polynomial via internal `bounceOut`.
- **Shader staples** -- `easeSmoothstep` (Hermite), `easeSmootherstep` (Perlin's 6th-degree) (`easeSmoothstep.ts`).

### Parametric factories (closure allocators)

- **Power** (`easePower.ts`) -- `easeInPower(exponent)`, `easeOutPower(exponent)`, `easeInOutPower(exponent)`. Generalizes Quadratic-through-Quintic to any real exponent including sub-linear `0 < exp < 1`. Tested against the fixed families for conformance at integer exponents.
- **Damped sine** (`easeDampedSine.ts`) -- `easeInDampedSine(amplitude, period)`, `easeOutDampedSine(amplitude, period)`, `easeInOutDampedSine(amplitude, period)`. This IS the parametric form of the elastic family: tested to match the fixed `easeInElastic`/`easeOutElastic`/`easeInOutElastic` at the same constants. Well-documented degenerate-case handling: amplitude below 1 is raised to 1 (the smallest defined curve), non-positive period falls back to 0.4. Both choices are Flight's own.
- **Cubic bezier** (`easeCubicBezier.ts`) -- `easeCubicBezier(x1, y1, x2, y2)`. The CSS `cubic-bezier()` curve. WebKit `UnitBezier`-style Newton-Raphson + bisection solver. Clamps endpoints exactly. Tested against the CSS `ease` reference value.
- **Steps** (`easeSteps.ts`) -- `easeSteps(count, position?)`. All four CSS `StepPosition` modes (`jumpEnd` default, `jumpStart`, `jumpNone`, `jumpBoth`). The degenerate `easeSteps(1, 'jumpNone')` produces NaN (matching CSS spec); the silent failure routes through the guard seam.
- **Piecewise** (`easePiecewise.ts`) -- `easePiecewise(segments)`. Weighted segment splicing across `[0,1]`; `EasingSegment` from `@flighthq/types` (`{ ease, weight? }`). Relative weights normalized internally. Throws on empty/zero-weight (programmer error).
- **Smoothstep range** (`easeSmoothstep.ts`) -- `easeSmoothstepRange(edge0, edge1): ScalarRemap`. GLSL-style arbitrary-domain smoothstep. Returns `ScalarRemap` (from `@flighthq/types`), not `EasingFunction`, because its domain is `[edge0, edge1]`, not `[0, 1]`.

### Combinators (`easeCombinators.ts`)

Six functions, each returning a new `EasingFunction` closure:

- `easeClamp(ease)` -- opt-in input clamping to `[0, 1]`.
- `easeClampOutput(ease, min, max)` -- output clamping.
- `easeInvert(ease)` -- vertical mirror: `t => 1 - ease(t)`.
- `easeMirror(easeIn)` -- In-to-InOut via half-and-mirror splice.
- `easeReverse(easeIn)` -- In-to-Out: `t => 1 - easeIn(1 - t)`.
- `easeScaleOutput(ease, from, to)` -- output remap to `[from, to]`.

File header documents allocation behavior and alias-safety explicitly.

### Meta-utilities

- `createEasingSamples(ease, count, out?)` (`createEasingSamples.ts`) -- uniform LUT sampling into `Float32Array`. Out-parameter with alias-safe local reads. Exact endpoint pinning. Throws on `count < 1` or non-finite.
- `getEasingDerivative(ease, t, epsilon?)` (`getEasingDerivative.ts`) -- centered finite-difference numerical derivative with forward/backward fallback at boundaries. Never throws.

### Guard layer (`enableEasingGuards.ts`)

- `enableEasingGuards()` / `disableEasingGuards()` on the contract lane (not public lane). Installs a `@flighthq/log` warning for the degenerate `easeSteps(1, 'jumpNone')` NaN case via `setEasingStepsGuard`. Follows the diagnostics inversion rule: the guard module is separately importable and shakeable, so a build that never imports it never pulls `@flighthq/log`.

### Testing

Every source file has a colocated `*.test.ts`. The `easingFamilies.test.ts` cross-family test is noteworthy: it tests pairwise distinctness across 201 sample points (catching copy-paste defects), endpoint exactness (with documented floating-point exceptions for Back and Sine), the In/Out reflection relationship (`easeOut(t) === 1 - easeIn(1 - t)`), the InOut halves relationship (with deliberate exceptions for Back and Elastic), midpoint continuity via gap-shrinking rather than fixed-tolerance, monotonicity for applicable families, and overshoot assertions for Back/Elastic/Bounce. This is well-crafted testing.

## Gaps

Listed as observation; sequencing and priority are the assessment layer's concern.

- **No parametric Back (`easeInBackWith(overshoot)` etc.).** The Back family exports only baked constants with `s = 1.70158`. A user who needs a different overshoot has no factory. The status doc from 2026-08-08 correctly identifies this. This is the most prominent missing parametric form.
- **No single-step `easeStep(threshold?)`.** The CSS `step-start`/`step-end` convenience. `easeSteps(1, 'jumpStart')` and `easeSteps(1, 'jumpEnd')` achieve the effect, but a direct `easeStep` would be the name a user reaches for. The status doc identifies this.
- **No spring easing.** `easeSpring`, `SpringEasingOptions`, `solveSpringDuration` do not exist. The assessment backlog records this as resolved: `@flighthq/spring` owns the physics integrator and a normalized spring easing would contradict its duration-less, overshoot-capable nature. This is correctly out of scope per the current assessment.
- **No `@flighthq/easing-formats` neighbor.** No CSS `<easing-function>` parse/serialize. Correctly gated on consumer (Decision #3).
- **No performance/determinism gate.** No microbenchmark for allocation-free curves, no bit-determinism pinning for the LUT path. Open direction #4 in the charter.
- **Rust conformance not started.** Per Decision #4, TS leads and Rust follows in batches. The Rust crate remains behind the TS surface.

## Charter contradictions

None found. The source aligns with all five charter decisions and the four North-star principles:

1. **Branch-free, allocation-free hot path** -- fixed curves are `const` arrow functions, no allocations. Factories are honest closure allocators. Correct.
2. **`@flighthq/types`-first** -- `EasingFunction`, `EasingSegment`, `ScalarRemap`, `StepPosition`, `EasingStepsGuard` all live in `@flighthq/types`. The package imports them from `@flighthq/types/contract`. Correct.
3. **Canonical and unabbreviated** -- full names throughout (`easeInQuadratic`, not `easeInQuad`; `easeInExponential`, not `easeInExpo`). Correct.
4. **Tree-shakable to the single curve** -- one barrel, `sideEffects: false`, no registry. Correct.
5. **Clean conformance seam** -- `createEasingSamples` is the intended LUT probe. Not yet exercised cross-platform, but the seam exists. Correct in intent.

The five Decisions are all respected: normalized spring correctly not built here (Decision #1 + backlog resolution), output-range combinators in scope (Decision #2), no registry in core (Decision #3), Rust batched (Decision #4), `Readonly<>` callable exception (Decision #5).

## Contract & docs fit

### Package against contract -- strong alignment

- **`@flighthq/types`-first** -- five types defined in the header layer, implemented against.
- **Full unabbreviated names** -- `easeInOutPower`, `easeScaleOutput`, `getEasingDerivative`, `createEasingSamples`. No abbreviations.
- **`get*` / `create*` verb conventions** -- `getEasingDerivative` (accessor), `createEasingSamples` (allocator). Correct.
- **Sentinels vs throws** -- `createEasingSamples` and `easePiecewise` throw on programmer error only; `getEasingDerivative` never throws; curves return values. Correct.
- **Out-param + alias safety** -- `createEasingSamples` reads `t` into locals before writing, pins endpoints. Documented.
- **Two export lanes** -- `index.ts` (public, 51 exports), `contract.ts` (full, 54 exports including guard functions). Correct.
- **`sideEffects: false`** -- declared, and nothing at module top level registers or patches. Correct.
- **Dependencies** -- only `@flighthq/types` and `@flighthq/log`. The `@flighthq/log` import is confined to the separately-importable guard module.

### Contract/docs revision candidates (user's gate)

- **`package.json` description is still thin.** It reads `"Easing functions for animation"`, which does not hint at the combinator/factory/piecewise/LUT/derivative surface. The charter's Open direction #2 names this. The catalog entry was refreshed (per assessment Landed #3), but the npm description was not.
- **`easeSmoothstep.test.ts` line 24 is a no-op assertion.** `expect(easeSmootherstep(0.25)).toBeLessThan(easeSmootherstep(0.25))` compares `easeSmootherstep` against itself, not against `easeSmoothstep` (the lower-order variant). The test always fails or is vacuously true; it does not test what the comment claims ("approaches endpoints more gently than smoothstep"). Minor but incorrect.
- **The prior review's ingested list is stale.** It references `reviews/depth/easing.md` and `reviews/maturation/depth/easing.md`, which were removed from the repository on 2026-07-03 per `index.md`.

## Candidate open directions

Questions the charter does not answer that this review had to assume past:

1. **Parametric Back naming.** If `easeInBackWith(overshoot)` is added, the naming should be consistent with the DampedSine family. The DampedSine family uses a distinct name (`easeInDampedSine`) rather than `easeInElasticWith`, which is a deliberate choice documented in its file header. Should parametric Back follow the same pattern (a distinct name like `easeInOvershoot`) or use the `*With` suffix? The charter does not speak to parametric naming conventions.

2. **DampedSine vs ElasticWith naming rationale.** The parametric elastic is named `easeInDampedSine` (describing its mathematical form) rather than `easeInElasticWith` (describing its relationship to the fixed curve). This is a defensible choice -- it names the curve by what it IS rather than by what it generalizes -- but the charter does not record the rationale, and a future developer reaching for `easeInElasticWith` will not find it. Whether to add an alias, a re-export, or a doc note.

3. **Physics taxonomy review.** Open direction #1 in the charter remains open. The spring question was resolved (out of scope), but the broader physics taxonomy is unsettled.
