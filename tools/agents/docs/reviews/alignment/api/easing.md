# API Alignment: @flighthq/easing

**Verdict:** Strongly aligned — a clean, primitive-only functional package; the only real convention tension is that the two closure-allocating factories (`easeCubicBezier`, `easeSteps`) reuse the `ease*` prefix instead of signalling allocation, diverging from the sibling `tween` package's `create*` factories.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `easeCubicBezier`, `easeSteps` | Both **allocate** a new `EasingFunction` closure but use the same `ease*` prefix as the zero-allocation pure curves (`easeInCubic`, `easeOutBack`, …). A caller cannot tell from the name that `easeSteps(4)` allocates while `easeOutCubic` does not. The sibling `@flighthq/tween` package consistently marks closure/object factories with `create*` (`createTween`, `createTweenManager`, `createTweenTimer`). This is the allocation-by-verb and cross-package verb-consistency rule. Counterweight: the uniform `ease*` prefix gives the package one coherent, greppable vocabulary, and `easeCubicBezier(...)` reads naturally as "the cubic-bézier easing" — so this is a deliberate-tradeoff call, not a clear bug. | Either rename to `createCubicBezierEasing` / `createStepsEasing` (or `createEasingFunction*`) to align allocation with the `create*` convention, or document in the package map that `ease*` factories returning `EasingFunction` are an intentional naming exception so the divergence from `tween`'s `create*` is recorded rather than silent. |
| Low | `easeSteps` | Invalid `count` is not guarded: `easeSteps(0)` and `easeSteps(-1)` produce a function that divides by `jumps === 0`/negative and returns `NaN`/garbage rather than a sentinel or a thrown precondition error. Passing a non-positive step count is programmer error (API misuse), which the conventions say to `throw` on — currently it silently yields `NaN`. | Throw on `count < 1` (a precondition/misuse error), or document that `count` must be a positive integer. Keep it `throw`, not a sentinel, since this is misuse rather than expected failure. |

## Clean

- **Cross-package types.** `EasingFunction` and `StepPosition` are both imported from `@flighthq/types` (the header layer) — not redefined inline. The package's only dependency is `@flighthq/types`.
- **`import type {}` discipline.** Every file uses a dedicated `import type { ... } from '@flighthq/types'` line; no mixed `import { type Foo, bar }` form anywhere.
- **Full, unabbreviated names.** Every curve family is spelled out — `Quadratic`, `Quartic`, `Quintic`, `Exponential`, `Circular`, `CubicBezier` — none abbreviated (`easeInQuad`/`easeInExpo` were avoided). `In`/`Out`/`InOut` direction tokens are consistent across all families.
- **Globally unique names.** The `ease*` prefix namespaces the entire surface; no collision risk from the SDK barrel, and `easeSmootherstep` vs `easeSmoothstep` are correctly distinguished.
- **`Readonly<T>` not required.** All parameters are primitives (`number`, `string`/`StepPosition`), which are exempt from the `Readonly<>` rule. Nothing mutates a shared object.
- **No teardown / accessor / boolean surface.** No `get*`/`has*`/`is*`, `dispose*`/`destroy*`, or `acquire*`/`release*` functions exist, so none can be misused — appropriate for a pure-math package.
- **Sentinels vs throw (mostly).** No expected-failure path is forced through an exception, and no unreachable internal invariants are validated. `easeCubicBezier` clamps `t<=0`/`t>=1` to `0`/`1` rather than throwing, which is correct.
- **Module-private constants placement.** Tuning constants and helpers (`s`/`s2` in `easeBack`, `p`/`p2`/`s`/`s2` in `easeElastic`, `bounceOut` in `easeBounce`) sit at the bottom of their files, after the exported functions, per the source-style rule.
- **Doc comments carry the load-bearing semantics.** `easeCubicBezier` (WebKit `UnitBezier` Newton-Raphson + bisection) and `easeSteps` (CSS `steps()` jump-position semantics) document algorithm provenance and the `[0,1]` pre-clamp assumption rather than restating obvious code.
- **One source file per family, colocated `*.test.ts`.** Files are named for the curve domain (`easeBack.ts`, `easeElastic.ts`), and the barrel is a thin re-export.
