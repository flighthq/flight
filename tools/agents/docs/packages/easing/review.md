---
package: '@flighthq/easing'
status: authoritative
score: 96
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/easing.md
  - reviews/maturation/depth/easing.md
  - source
---

# Review: @flighthq/easing

## Verdict

`authoritative — 96/100`. This was already a canonical curve set at 90; the incoming bundle closes nearly every convenience, parametrization, and meta-utility gap the depth review and maturation roadmap named — combinators, parametric Back/Elastic/Power factories, piecewise splicing, a LUT generator, and a numerical derivative — all tree-shakable, all tested. The only material gaps left are the deliberately-deferred spring family (a genuine cross-package design fork) and the un-started Rust conformance pass. Every status-doc claim verified against source.

## Present capabilities

The package keeps its one-file-per-family shape; every export conforms to `EasingFunction = (t: number) => number` from `@flighthq/types`, so the fixed curves stay allocation-free and the factories are honest `create*`-style closure allocators.

Pre-existing core (unchanged, still complete): the full Penner family (`Linear`, `Quadratic`, `Cubic`, `Quartic`, `Quintic`, `Sine`, `Exponential`, `Circular`, `Back`, `Elastic`, `Bounce`) with In/Out/InOut each; the CSS primitives `easeSteps` (all four `StepPosition` modes) and `easeCubicBezier` (WebKit `UnitBezier` Newton+bisection solver); the shader staples `easeSmoothstep`/`easeSmootherstep`.

New in this bundle, all grounded in source and each with a colocated, alphabetized `*.test.ts`:

- **Combinators** (`easeCombinators.ts`, 6 exports): `easeClamp` (opt-in input clamp — the documented answer to the `t`-precondition gap), `easeClampOutput`, `easeInvert` (vertical mirror), `easeMirror` (In→InOut half-and-mirror splice), `easeReverse` (In→Out `1 − easeIn(1 − t)`), `easeScaleOutput` (output remap to `[from,to]`). The file header documents allocation and alias-safety explicitly.
- **Parametric Back** (`easeBack.ts`): `easeInBackWith` / `easeInOutBackWith` / `easeOutBackWith`, default overshoot 1.70158, alongside the baked constants.
- **Parametric Elastic** (`easeElastic.ts`): `easeInElasticWith` / `easeInOutElasticWith` / `easeOutElasticWith`, configurable `amplitude`/`period` with the canonical `Math.asin(1/amplitude)` phase shift.
- **Power** (`easePower.ts`, 3 exports): `easeInPower` / `easeInOutPower` / `easeOutPower` — generalize Quadratic→Quintic to any real exponent, including sub-linear `0<exp<1`.
- **Piecewise** (`easePiecewise.ts`): `easePiecewise(segments)` splices weighted `EasingFunction`s across `[0,1]`; relative weights normalized internally; throws on empty/zero-weight input.
- **LUT** (`createEasingSamples.ts`): `createEasingSamples(ease, count, out?)` — uniform sampling into a `Float32Array`, out-param with alias-safe local reads, exact endpoint pinning, throws on `count < 1`/non-finite. The intended value-typed conformance probe.
- **Derivative** (`getEasingDerivative.ts`): `getEasingDerivative(ease, t, epsilon?)` — centered finite-difference with forward/backward fallback at the boundaries; never throws.
- **Step convenience** (`easeSteps.ts`): `easeStep(threshold?)` — the single-jump degenerate case.
- **Smoothstep range** (`easeSmoothstep.ts`): `easeSmoothstepRange(edge0, edge1)` — GLSL `smoothstep(edge0, edge1, x)` over an arbitrary input range with built-in clamping.

`@flighthq/types` gained `EasingSegment` (`{ ease; weight? }`, both `readonly`) and a substantial doc-comment on `EasingFunction` codifying the `t ∈ [0,1]` precondition, the branch-free hot-path note, and the overshoot output-range note — the header-first design surface the roadmap asked for.

The reported test counts hold up: `easeCombinators.test.ts` (21 `it`s across 6 describes), `easeBack`/`easeElastic` each grew three `*With` describes, `easeSteps.test.ts` gained an `easeStep` describe, `easeSmoothstep.test.ts` an `easeSmoothstepRange` describe, and the four new files each carry their own. Every exported function has a colocated test (`exports:check` should pass).

## Gaps

- **Spring / physics easing — absent (deferred by design).** No `easeSpring`, no React-Spring presets (`easeGentleSpring` et al.), no `solveSpringDuration`, no `SpringEasingOptions` in `@flighthq/types`. This is the single largest remaining feature and the one the maturation roadmap flagged as the most consequential decision. It is correctly _not_ built here because it is a cross-package ownership fork (see Candidate open directions), not because it is hard.
- **Rust conformance not started.** `crates/flighthq-easing/src/lib.rs` still exposes only the ~28 fixed-curve `fn(f32)->f32` functions; none of the new factories, combinators, `easePiecewise`, `createEasingSamples`, or `getEasingDerivative` are ported, and there is no `BoxedEasing` closure type, no parity-matrix entry, and no f32/f64 divergence record in the conformance map. The TS surface has now moved well ahead of the crate — the conformance debt is real and growing.
- **`-formats` (CSS easing parse/serialize) — absent (correctly gated).** No `parseCssEasingFunction`/`serializeEasingToCss`. The roadmap and status both gate this on a confirmed consumer; nothing here contradicts that.
- **No performance/determinism gate.** No microbenchmark asserting the fixed curves stay allocation-free, and no committed bit-determinism note for the LUT path (which `createEasingSamples` is explicitly meant to serve as). Deferred for lack of a bench harness.
- **Minor: `easeSteps(1, 'jumpNone')` divides by zero** (`jumps = count − 1 = 0`), yielding `NaN`. This is pre-existing (not introduced by this bundle) and matches the CSS spec forbidding that combination, but it is an undocumented sharp edge in a function that otherwise clamps carefully.

## Charter contradictions

None — the charter's body (North star / Boundaries / Decisions / Open directions) is still all `TODO`, so there is no stated principle to contradict. The work is judged against the codebase-map AAA standard below, and the silence is surfaced as candidate open directions rather than scored as a violation.

## Contract & docs fit

Strong alignment with the SDK contract:

- **`@flighthq/types`-first** — `EasingSegment` and the `EasingFunction` precondition doc live in the header layer, implemented against afterward. Exactly the prescribed order.
- **Full unabbreviated names** — `easeInOutPower`, `easeScaleOutput`, `getEasingDerivative`, `createEasingSamples`; no `Quad`/`Expo`/`vel` abbreviations. `get*` for the accessor, `create*` for the allocator — verb conventions respected.
- **Sentinels vs throws** — `createEasingSamples`/`easePiecewise` throw only on genuine programmer error (empty/zero-weight/non-finite count); `getEasingDerivative` never throws; the curves return values. Correct per the misuse-vs-sentinel rule.
- **`out`-param + alias safety** — `createEasingSamples` reads `t` into a local before writing `result` and pins endpoints; documented as alias-safe.
- **Single root export, `sideEffects: false`** — `index.ts` is a thin alphabetized barrel of 19 re-exports; `package.json` declares `sideEffects: false` and no subpaths. Tree-shaking intact.
- **`Readonly<>` nuance handled correctly** — combinator/utility parameters use plain `EasingFunction`, not `Readonly<EasingFunction>`, because `Readonly<>` on a callable type strips its call signature in TS. The worker documented this in the file header; it is the right call and worth promoting into the global `Readonly<>` constraint as a known exception (function values are already immutable references).

Candidate contract/docs revisions (the user's gate, not the reviewer's):

- **`easeSmoothstepRange` returns an anonymous `(x: number) => number`, not `EasingFunction`** — and rightly so, since its input `x` is _not_ a normalized `t ∈ [0,1]`. But that makes it a distinct contract: a remap function whose domain is `[edge0, edge1]`. The anonymous inline type is the one export here that does not name its shape in `@flighthq/types`. Consider a named header type (e.g. `ScalarRemap = (x: number) => number`) so the API surface stays navigable from the header alone, per the header-layer rule. Minor.
- **`easeStep` doc vs CSS mapping** — the header comment equates `easeStep(0)` with CSS `step-start` and `easeStep(1)` with `step-end`, but the implementation `t >= threshold ? 1 : 0` makes `easeStep(0)` output 1 for all `t ≥ 0` and `easeStep(1)` output 0 until `t = 1`. The behavior is reasonable; the `step-start`/`step-end` equivalence claim is imprecise and could mislead. Tighten the comment.
- **Package Map line is accurate but thin** — "easing functions for use with tween or any animation system" no longer hints at the now-substantial combinator/factory/LUT/derivative surface. Not wrong, just under-describing a package that has grown into a full sub-library. Optional refresh.

## Candidate open directions

The charter is a stub; these are the questions the review had to assume past, each a seed for the charter's Open directions:

- **Spring ownership (the structural fork).** Does `@flighthq/easing` own a _normalized_ `[0,1]→[0,1]` spring (pre-integrated to settle at `t=1`), with `@flighthq/tween` owning the time-unbounded integrator — or do springs live entirely in tween? This determines whether `SpringEasingOptions` belongs in `@flighthq/types` under the easing or the tween domain, and it has a symmetric Rust question (`flighthq-spring` placement). This is the one item that must be _decided_ before built, and is the gate on calling the package fully Gold. Cross-package → surface, do not auto-build.
- **Is the Rust crate held to live conformance, or allowed to lag the TS surface?** The crate is now materially behind. The charter should state whether each TS easing addition is expected to land in `flighthq-easing` in the same pass (with the `BoxedEasing` closure decision and the f32/f64 divergence entry), or whether easing is explicitly a "TS-leads, Rust-follows-in-batches" package. This frames the largest remaining chunk of work.
- **Does `easing` ever own a name→curve registry / CSS parse-serialize, or is that permanently a `-formats` neighbor?** The depth review's tree-shaking argument says neighbor; the charter should bless that boundary explicitly (with the triad `-formats` pattern) so a future agent does not add a registry into the tree-shakable core.
- **Output-range vocabulary.** `easeScaleOutput` and `easeSmoothstepRange` push the package slightly past pure `[0,1]→[0,1]` curves into value remapping. Is remap-into-a-target-range in scope for `easing`, or does it belong in `@flighthq/math` (which already owns `remap`/`lerp`)? Worth a boundary ruling to avoid overlap with `math`.
