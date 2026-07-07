---
package: '@flighthq/easing'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# easing — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Swept the assessment's `## Recommended` list against this worktree's actual `packages/easing/src/`. Notable: the source in this worktree is at an **earlier state** than the 2026-06-24 status entry below claims — `easeStep`, `easeSmoothstepRange`, `easeCombinators.ts`, `easePower.ts`, `easePiecewise.ts`, `createEasingSamples.ts`, and `getEasingDerivative.ts` are **not present** here. Several Recommended items therefore point at functions that do not exist in this tree and were parked rather than guessed.

Done:

- **Documented the `easeSteps(count, 'jumpNone')` divide-by-zero sharp edge.** Added a doc-comment note in `easeSteps.ts` explaining that `jumps = count - 1 = 0` for `easeSteps(1, 'jumpNone')` yields `NaN`, mirroring the CSS spec which forbids `steps(1, jump-none)`. Added a guarded test in `easeSteps.test.ts` asserting the documented NaN behavior at t = 0, 0.5, 1.

Parked:

- **Tighten `easeStep` doc-comment's CSS mapping** — `easeStep` does not exist in this worktree's `easeSteps.ts` (the single-jump convenience was not present in the source here). Nothing to reword.
- **Name `easeSmoothstepRange`'s return type in `@flighthq/types`** — `easeSmoothstepRange` does not exist in this worktree's `easeSmoothstep.ts`; only `easeSmoothstep` and `easeSmootherstep` are present. The naming target (`ScalarRemap`) would also live in `@flighthq/types`, a cross-boundary edit.
- **Refresh the Package Map line for `@flighthq/easing`** — that line lives in `agents/index.md`, outside the allowed edit boundary (only `packages/easing/` and `agents/packages/easing/`). Cross-boundary.

Verification: `npm run test --workspace=packages/easing` → 14 files, 82 tests, all pass.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/easing

**Date:** 2026-06-24 **Previous score:** 90/100 (authoritative) **Estimated new score:** 97/100

## Implemented APIs

### Bronze (all implemented)

**`@flighthq/types` additions:**

- `packages/types/src/EasingFunction.ts` — extended with a full precondition doc comment: the `t ∈ [0,1]` precondition for callers, the explicit note that fixed curves are branch-free (do not clamp internally), and the overshoot output-range note. No behavior change; doc-only.
- `packages/types/src/EasingSegment.ts` — new type `EasingSegment { ease: EasingFunction; weight?: number }` for use with `easePiecewise`.

**`packages/easing/src/easeCombinators.ts`** — new file, 5 exports:

- `easeClamp(ease)` — opt-in input-clamping wrapper; the documented solution to the t-precondition gap.
- `easeClampOutput(ease, min, max)` — output-range clamp wrapper for overshoot curves.
- `easeInvert(ease)` — vertical mirror: `t => 1 - ease(t)`.
- `easeMirror(easeIn)` — derives an InOut curve from an In curve via the half-and-mirror splice.
- `easeReverse(easeIn)` — derives an Out curve from an In curve: `t => 1 - easeIn(1 - t)`.
- `easeScaleOutput(ease, fromValue, toValue)` — output range remapping (Silver feature co-located here).

**`packages/easing/src/easeSteps.ts`** — added `easeStep(threshold?)`, the single-jump CSS `step-start`/`step-end` convenience.

**Tests:** `easeCombinators.test.ts` (39 tests), `easeStep` cases added to `easeSteps.test.ts`.

### Silver (all implemented)

**`packages/easing/src/easeBack.ts`** — added three parametric factory exports alongside the baked constants:

- `easeInBackWith(overshoot?)` — configurable overshoot, default 1.70158.
- `easeInOutBackWith(overshoot?)` — configurable InOut overshoot.
- `easeOutBackWith(overshoot?)` — configurable Out overshoot.

**`packages/easing/src/easeElastic.ts`** — added three parametric factory exports:

- `easeInElasticWith(amplitude?, period?)` — configurable amplitude + period.
- `easeInOutElasticWith(amplitude?, period?)` — configurable InOut amplitude + period.
- `easeOutElasticWith(amplitude?, period?)` — configurable Out amplitude + period.

**`packages/easing/src/easePower.ts`** — new file, 3 exports:

- `easeInPower(exponent)` — generalises easeInQuadratic→easeInQuintic to any real exponent.
- `easeInOutPower(exponent)` — InOut form.
- `easeOutPower(exponent)` — Out form (derived via reversal).

**`packages/easing/src/easePiecewise.ts`** — new file, 1 export:

- `easePiecewise(segments)` — splices multiple `EasingFunction`s across `[0,1]` at weighted breakpoints. Throws programmer-error for empty/zero-weight arrays.

**`packages/easing/src/createEasingSamples.ts`** — new file, 1 export:

- `createEasingSamples(ease, count, out?)` — samples a curve uniformly into a `Float32Array` for LUT/GPU/conformance use. Out-param, alias-safe, throws on invalid `count`.

**Tests:** `easeBack.test.ts` extended (6 new describes), `easeElastic.test.ts` extended (3 new describes), `easePower.test.ts` (new, 3 describes), `easePiecewise.test.ts` (new, 1 describe), `createEasingSamples.test.ts` (new, 1 describe).

### Gold (partially implemented)

**`packages/easing/src/getEasingDerivative.ts`** — new file, 1 export:

- `getEasingDerivative(ease, t, epsilon?)` — numerical derivative via centered finite-difference (forward/backward at boundaries). Returns instantaneous velocity for motion hand-off.

**`packages/easing/src/easeSmoothstep.ts`** — added 1 export:

- `easeSmoothstepRange(edge0, edge1)` — GLSL-compatible `smoothstep(edge0, edge1, x)` with arbitrary input range and built-in clamping.

**Tests:** `getEasingDerivative.test.ts` (new, 1 describe), `easeSmoothstep.test.ts` extended with `easeSmoothstepRange` describe.

## Deferred Items and Why

### Spring easing (design decision — intentionally NOT built)

The roadmap explicitly flags this as the single most consequential cross-package design decision: does `@flighthq/easing` own a normalized `[0,1]→[0,1]` spring curve, or do springs live entirely in `@flighthq/tween`? The boundary matters because:

- A normalized spring requires a time-to-settle estimate (otherwise the normalization is arbitrary).
- `SpringEasingOptions` placement in `@flighthq/types` is contingent on the answer — it may belong under the tween domain rather than the easing domain.
- The Rust port has a symmetric question about where `flighthq-spring` lives.

**Recommendation to surface:** Add `easeSpring({ stiffness, damping, mass, velocity? })` to `@flighthq/easing`, with `SpringEasingOptions` in `@flighthq/types`. The tween layer owns the time-unbounded physics integrator; the easing layer owns the normalized version (pre-integrated to settle at t=1). This is the same split Framer Motion uses. Implement `solveSpringDuration` as a helper so the tween layer can drive a physically-correct duration without hardcoding one.

### Spring presets (blocked on spring design decision)

`easeGentleSpring`, `easeWobblySpring`, `easeStiffSpring`, `easeSlowSpring` — the React Spring preset vocabulary. These are one-liners once `easeSpring` exists.

### `@flighthq/easing-formats` neighbor package (gated on confirmed need)

`parseCssEasingFunction(source)` and `serializeEasingToCss(fn)` — a string/registry layer. Correctly deferred: the depth review noted this would fight tree-shaking in the core package. Build only when a real consumer (scene serialization, animation theme files) appears. The `-formats` naming pattern is already established.

### Rust-port conformance (`flighthq-easing`)

The Gold roadmap calls for porting all new factories and combinators to the Rust crate, introducing `BoxedEasing = Box<dyn Fn(f32) -> f32>` for closure-returning functions, and adding the curve set to the parity matrix differ. The f32-vs-f64 divergence must be documented in the conformance map. This is a dedicated Rust-workspace pass and was not acted on here.

### Performance / determinism gate

A microbenchmark suite asserting the fixed curves stay allocation-free, and a bit-determinism note for the LUT path so it can serve as a conformance reference. Deferred — these require a benchmarking harness (`vitest bench` or a similar tool) that is not currently set up in the package.

## Concerns and Surprises

- **`Readonly<EasingFunction>` is uncallable in TypeScript.** `EasingFunction = (t: number) => number` is itself a function type; `Readonly<>` on a function type strips the call signature in the TypeScript type system, making the parameter uncallable. All combinator and utility parameters were changed from `Readonly<EasingFunction>` to plain `EasingFunction`. This is correct — function values are already immutable references in JS/TS (you cannot mutate a function through a reference); the `Readonly<>` rule from the codebase guide applies to object types, not function types.
- **Elastic amplitude=1 baked constant vs factory mismatch.** The baked `easeInElastic` uses amplitude=1 implicitly (no `Math.asin(1/amplitude)` division), while the factory with `amplitude=1` computes `Math.asin(1/1) = π/2`, yielding the same shift. The factory output matches the baked constant to floating-point precision — verified in tests.
- **The `easeInOutBack` block comment** was placed before `easeInOutBackWith` in the source; the linter reordered exports alphabetically (easeInBack → easeInBackWith → easeInOutBack → easeInOutBackWith → easeOutBack → easeOutBackWith). The block comment describing all three factories was consolidated above the first factory to preserve readability after reordering.

## Suggestions for Future Sessions

1. **Decide the spring boundary** (see Deferred above). This is the one meaningful gap remaining before the package can be called fully authoritative at Gold.
2. **`@flighthq/easing-formats`** — once a parser consumer appears (scene file loader, CSS-in-JS theme system), the package is a mechanical 1–2 day scope.
3. **Rust conformance pass** — port the factories and combinators (with `BoxedEasing`), add the LUT generator as the canonical parity probe, and document the f32/f64 divergence in the conformance map. This is the bulk of remaining Gold work.
4. **Tree-shake verification** — run `npm run size` against an example that imports only one fixed curve (e.g. `easeInCubic`) to confirm the new files (combinators, factories, piecewise, LUT) do not pull into the bundle when unused.
