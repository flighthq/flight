# Maturation Roadmap: @flighthq/easing

**Current verdict:** authoritative — 90/100; a complete, canonical curve set (full Penner family + CSS `steps`/`cubic-bezier` + smoothstep/smootherstep), with only convenience, parametrization, and meta-utility gaps remaining.

This package is already past "minimum viable." The tiers below therefore treat Bronze as targeted polish that closes the most-felt gaps, Silver as feature-parity with the best-regarded easing libraries (d3-ease, GSAP), and Gold as the genuine frontier — exhaustive parametrization, a complete spring family, and locked 1:1 Rust-port conformance. Each tier is cumulative.

## Bronze

The 20% that closes the most-cited gaps with tiny, tree-shakable additions. All operate on the existing `EasingFunction` contract; no new backend, no new dependency.

- **Curve combinators (new `easeCombinators.ts`)** — free functions that lift an arbitrary user-supplied `EasingFunction` instead of hand-writing variants:
  - `easeReverse(easeIn: Readonly<EasingFunction>): EasingFunction` — derive an Out curve from an In curve (`t => 1 - easeIn(1 - t)`).
  - `easeMirror(easeIn: Readonly<EasingFunction>): EasingFunction` — derive an InOut curve from an In curve (the standard half-and-mirror splice).
  - `easeInvert(ease: Readonly<EasingFunction>): EasingFunction` — vertical flip (`t => 1 - ease(t)`), distinct from `easeReverse`.
  - These return new closures, so they are `create*`-style allocators by nature; name them as transforms, not `create*`, since they consume and return an `EasingFunction` value. Document allocation in the file header.
- **Clamping contract decision (in `@flighthq/types` first).** Resolve the inconsistency the depth review flagged: the polynomial families assume pre-clamped `t` while `easeSteps`/`easeCubicBezier` clamp. Pick one and apply uniformly:
  - Preferred: document the `t ∈ [0,1]` precondition once on `EasingFunction` in `@flighthq/types/EasingFunction.ts` (a doc comment on the type alias), and add an explicit, opt-in `easeClamp(ease: Readonly<EasingFunction>): EasingFunction` combinator for callers who pass unclamped input. This keeps the hot fixed curves branch-free.
- **`easeStep(threshold = 0.5): EasingFunction`** — the single-jump CSS `step-start`/`step-end` convenience (0 below threshold, 1 at/after), the degenerate case of `easeSteps` that consumers reach for constantly. Co-locate with `easeSteps`.
- **Tests for every new export** (`easeCombinators.test.ts`, `easeStep` cases in `easeSteps.test.ts`), including the alias-safe / composition cases (combinator-of-combinator).

Effort: small (1–2 days). No cross-package coordination beyond the one-line type doc.

## Silver

Match what a good, well-regarded easing library offers: parametric factories for the tunable curves, a normalized spring, and a few professional conveniences. Still pure `[0,1]→number`, still tree-shakable.

- **Parametric overshoot/elastic factories** (alongside the existing baked constants, not replacing them):
  - `easeBack(overshoot = 1.70158): { easeIn; easeOut; easeInOut }` or three sibling factories `easeInBackWith(overshoot)`, `easeOutBackWith(overshoot)`, `easeInOutBackWith(overshoot)` — pick the trio form to keep each export a single `EasingFunction` factory (matches `easeCubicBezier`/`easeSteps`). Mirrors d3 `backOut.overshoot()` and GSAP `Back.config()`.
  - `easeInElasticWith(amplitude, period)`, `easeOutElasticWith(amplitude, period)`, `easeInOutElasticWith(amplitude, period)` — configurable amplitude/period, default to the current canonical constants. Mirrors d3 `elastic.amplitude().period()`.
- **Normalized spring family (new `easeSpring.ts`)** — `easeSpring(options: Readonly<SpringEasingOptions>): EasingFunction` where `SpringEasingOptions = { stiffness; damping; mass; velocity? }` is defined in `@flighthq/types` first. Returns a curve normalized to `f(0)=0, f(1)=1` by sampling the damped-harmonic solution and rescaling to a settled unit interval. This is the most-requested "missing" feature (Framer Motion / React Spring make spring a first-class easing source). See the design-decision note in Sequencing — the boundary between this normalized form and the time-unbounded physics integrator in the tween layer must be settled explicitly.
- **`easeChain(...)` / `easePiecewise(segments: Readonly<EasingSegment[]>): EasingFunction`** — splice multiple `EasingFunction`s across `[0,1]` at given breakpoints, each segment optionally weighted. `EasingSegment = { ease: EasingFunction; weight?: number }` in `@flighthq/types`. Covers "ease in, hold, ease out" sequences without a timeline.
- **`easeScale(ease, fromValue, toValue): EasingFunction`** and **`easeClampOutput(ease, min, max)`** — output-range remapping convenience (the curve produces a value outside `[0,1]`, e.g. `Back`/`Elastic` overshoot, and the caller wants it remapped/clamped).
- **`samplePolyline` LUT generator** — `createEasingSamples(ease: Readonly<EasingFunction>, count, out?: Float32Array): Float32Array` — bake a curve to a uniform sample table (out-param, explicit allocation only when `out` omitted) for cheap GPU/large-batch evaluation and for the parity differ. Sentinel: returns the (possibly newly allocated) array; never throws.
- **`@flighthq/easing-formats` neighbor package (only if a parsing need is confirmed)** — a bounded importer for the CSS `<easing-function>` grammar: `parseCssEasingFunction(source: string): EasingFunction | null` (handles `linear`, `ease`, `ease-in/out/in-out`, `steps(...)`, `cubic-bezier(...)`, returns `null` on malformed input — sentinel, not throw) and `serializeEasingToCss(...)` where representable. This keeps the string/registry concern out of the tree-shakable core (the depth review correctly flagged that a name registry would fight tree-shaking inside the main package) and follows the established `-formats` pattern. Defer until a real consumer (serialization, theme/animation files) appears; surface as a question rather than build speculatively.

Effort: medium (spring + factories ~3–5 days; the `-formats` package is its own 2–3 day scope and is gated on a confirmed need).

## Gold

Authoritative reference for the domain: exhaustive parametrization, performance instrumentation, full edge-case handling, and locked Rust conformance. Nothing a domain expert would find missing.

- **Complete the spring family.** Beyond the normalized `easeSpring`: `easeGentleSpring`, `easeWobblySpring`, `easeStiffSpring`, `easeSlowSpring` as named presets (the React Spring preset vocabulary), each a tuned `SpringEasingOptions`. Optional duration-solving helper `solveSpringDuration(options): number` that reports the time-to-settle so the tween layer can drive a physically-derived spring without hardcoding a duration.
- **Derivative / velocity sampling** — `getEasingVelocity(ease, t, epsilon?): number` (numerical derivative) so motion systems can hand off velocity at curve boundaries (the seam between a finishing tween and a starting spring). Analytic derivatives for the closed-form families where exact velocity matters.
- **Exhaustive parametric coverage** — round out the tunable curves: `easeStepsWithRange` (non-`[0,1]` step domains), configurable smoothstep edge0/edge1 (`easeSmoothstepRange(edge0, edge1)` matching the GLSL `smoothstep(edge0, edge1, x)` signature), and a generalized `easePower(exponent)` factory that subsumes Quadratic→Quintic for arbitrary fractional powers.
- **Performance + determinism gate** — a microbenchmark suite asserting the fixed curves stay allocation-free and branch-light; a bit-determinism note for the LUT/sample path so it can serve as a conformance reference. Verify tree-shaking with `npm run size` (importing one curve must not pull combinators/spring).
- **Full error/edge contract** — uniform, documented handling of `NaN`/`Infinity`/out-of-range `t` across every export; factories validate genuinely impossible parameters (negative `count` in `easeSteps`, non-finite spring mass) as programmer-error throws per the misuse-vs-sentinel rule, and return sentinels nowhere a value is expected. Audit `easeCubicBezier` Newton/bisection fallback against pathological control points.
- **Docs** — a curve gallery / reference doc under `tools/agents/docs` (or the package README) cataloguing every family with its formula, endpoint behavior, and the In/Out/InOut/symmetric axis, plus the combinator and spring vocabulary. Explicitly record in the Package Map whether spring lives here or in the tween/physics layer.
- **1:1 Rust-port conformance (`flighthq-easing`).** The crate currently mirrors only the bare fixed curves via `EasingFn = fn(f32) -> f32`. Bring it to full parity:
  - Port the factories and combinators. Because `fn` pointers cannot capture parameters, introduce `BoxedEasing = Box<dyn Fn(f32) -> f32>` (or a returned closure type) for `ease_steps`, `ease_cubic_bezier`, `ease_back_with`, `ease_elastic_with`, `ease_spring`, and the combinators (`ease_reverse`, `ease_mirror`, `ease_invert`, `ease_piecewise`).
  - Port `create_easing_samples(ease, count, out: &mut [f32])` as the alias-safe out-param LUT generator — this is the natural value-typed conformance probe.
  - Add the curve set to the parity matrix differ: sample each curve at N points in `ts` and `rust` cells and assert agreement within tolerance. Record any intentional float32-vs-float64 divergence (the Rust crate is `f32`, TS is `f64`) in the conformance divergence map — this is a real, expected divergence that must be auditable, not a silent mismatch.
  - Mirror `SpringEasingOptions`/`StepPosition`/`EasingSegment` field-for-field.

Effort: large. The Rust conformance work and the parity-matrix integration are the bulk; the spring presets and derivative sampling are small once `easeSpring` exists.

## Sequencing & effort

Recommended order, with dependencies and items to surface before building:

1. **Bronze first (self-contained, ~1–2 days).** Start with the `@flighthq/types` doc edits — the `EasingFunction` precondition comment and (if added) `SpringEasingOptions` placeholder — because the header layer is the design surface and everything downstream types against it. Then the combinators, `easeStep`, `easeClamp`, and tests. Run `npm run exports:check` (every new export needs a colocated test), `npm run order:fix`, and `npm run fix`.
2. **Silver parametric factories (~2 days).** `easeBack*With` / `easeElastic*With` are mechanical reworks of the existing baked-constant curves and have no external dependency — do them before spring.
3. **Spring — design decision before code (DECISION TO SURFACE).** The boundary between a normalized `[0,1]→[0,1]` spring easing here and a time-unbounded damped-harmonic integrator in `@flighthq/tween`/physics is a cross-package design question. Decide and record it in the Package Map: does `@flighthq/easing` own a normalized spring (and `@flighthq/tween` owns the unbounded integrator), or do springs live entirely in the tween layer? Do not build `easeSpring` until this is settled — it determines whether `SpringEasingOptions` belongs in `@flighthq/types` for easing or for tween. This is the single most consequential decision in the roadmap.
4. **`easeChain`/`easePiecewise` + output remapping + LUT (~1–2 days).** Depends only on Bronze combinators. `EasingSegment` lands in `@flighthq/types` first.
5. **`-formats` package — gated (CROSS-PACKAGE, build only on confirmed need).** Spin up `@flighthq/easing-formats` only when a real consumer needs CSS easing parse/serialize (scene serialization, animation/theme files). It is the correct home for the string-registry/name-lookup feature the depth review flagged as fighting tree-shaking in the core. Surface as a suggestion; do not build speculatively.
6. **Gold (large, last).** Spring presets and derivative sampling are quick follow-ons once `easeSpring` exists. The heavy items are (a) Rust-port conformance — needs the `BoxedEasing` closure decision in `flighthq-easing` and coordination with the parity-matrix differ — and (b) the float32/float64 divergence entry in the conformance map. These touch the Rust workspace and the conformance tooling, so schedule them as a dedicated pass rather than interleaving with TS feature work.

Cross-package / type dependencies summary:

- `@flighthq/types` edits (header-first): `EasingFunction` precondition doc (Bronze); `SpringEasingOptions`, `EasingSegment` (Silver) — placement of `SpringEasingOptions` is contingent on the spring ownership decision above.
- `@flighthq/tween` / physics: the spring-ownership boundary (design decision, blocking the spring work).
- `flighthq-easing` (Rust) + parity/conformance tooling: the Gold conformance pass, including the documented f32/f64 divergence.
- A new `@flighthq/easing-formats` neighbor package: gated on a confirmed parsing/serialization consumer.
