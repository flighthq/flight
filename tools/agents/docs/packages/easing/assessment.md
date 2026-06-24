---
package: '@flighthq/easing'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/easing

The review verifies `authoritative — 96/100`. The incoming bundle already absorbed nearly the entire Bronze and Silver/Gold _convenience_ surface from the maturation roadmap — combinators, parametric Back/Elastic/Power factories, `easePiecewise`, `createEasingSamples`, `getEasingDerivative`, `easeStep`, `easeSmoothstepRange`, and the header-layer `EasingSegment` / `EasingFunction` doc. What remains splits cleanly: a handful of small within-package polish items (Recommended), and the genuinely parked work — the spring family, the Rust conformance pass, and `-formats` — all of which carry a cross-package design fork or a confirmed-consumer gate (Backlog), with the design questions routed to the charter's Open directions.

## Recommended

Sweep-safe: within `@flighthq/easing` (or its already-owned `@flighthq/types` header entries), no cross-package coordination, no breaking change, no open design decision.

- **Document the `easeSteps(count, 'jumpNone')` divide-by-zero sharp edge.** `jumps = count − 1 = 0` yields `NaN` for `easeSteps(1, 'jumpNone')`. Pre-existing, and it matches the CSS spec forbidding that combination, but it is undocumented in a function that otherwise clamps carefully. Add a header/doc note (and optionally a guarded test asserting the documented behavior). Source: review.md › Gaps (Minor).
- **Tighten the `easeStep` doc-comment's CSS mapping.** The comment equates `easeStep(0)` with `step-start` and `easeStep(1)` with `step-end`, but `t >= threshold ? 1 : 0` makes `easeStep(0)` output 1 for all `t ≥ 0` and `easeStep(1)` output 0 until `t = 1`. The behavior is fine; the equivalence claim is imprecise. Reword to describe the actual threshold semantics. Source: review.md › Contract & docs fit (candidate revisions).
- **Name `easeSmoothstepRange`'s return type in `@flighthq/types`.** It returns an anonymous `(x: number) => number` whose domain is `[edge0, edge1]`, not a normalized `t`-domain `EasingFunction`. Introduce a named header type (e.g. `ScalarRemap = (x: number) => number`) so every export's shape stays navigable from the header alone, per the header-layer rule. Within easing's own `@flighthq/types` surface; no consumer coupling. Source: review.md › Contract & docs fit (candidate revisions).
- **Refresh the Package Map line for `@flighthq/easing`.** "easing functions for use with tween or any animation system" no longer hints at the combinator / factory / piecewise / LUT / derivative surface the package has grown into. A one-line description refresh. Source: review.md › Contract & docs fit (candidate revisions). _(Edits the codebase-map Package Map line for this package only — no code, no cross-package change.)_

## Backlog

Parked: each waits on a cross-package design decision, a confirmed consumer, or out-of-package tooling. The design questions among these are also surfaced to the charter's Open directions (below) — the charter is the place they get _decided_; this section only records why they cannot be swept.

- **Spring / physics easing family** (`easeSpring`, the React-Spring presets `easeGentleSpring` / `easeWobblySpring` / `easeStiffSpring` / `easeSlowSpring`, `solveSpringDuration`, and `SpringEasingOptions` in `@flighthq/types`). **Parked: blocked on a cross-package ownership fork** — does `@flighthq/easing` own a _normalized_ `[0,1]→[0,1]` spring with `@flighthq/tween` owning the time-unbounded integrator, or do springs live entirely in tween? This determines where `SpringEasingOptions` is homed and has a symmetric Rust question (`flighthq-spring` placement). Must be _decided_ before built; it is the gate on calling the package fully Gold. Source: review.md › Gaps + Candidate open directions; roadmap Silver/Gold.
- **Rust conformance pass for the new surface** (`flighthq-easing`). The crate still exposes only the ~28 fixed-curve `fn(f32)->f32` functions; none of the factories, combinators, `easePiecewise`, `createEasingSamples`, or `getEasingDerivative` are ported. Needs the `BoxedEasing` (`Box<dyn Fn(f32)->f32>`) closure decision, a parity-matrix entry sampling each curve in `ts` vs `rust` cells, and the f32/f64 divergence recorded in the conformance map. **Parked: out-of-package** — touches the Rust workspace and the parity/conformance tooling, and waits on the charter's ruling on whether easing is held to live conformance or is explicitly "TS-leads, Rust-follows-in-batches." Source: review.md › Gaps + Candidate open directions; roadmap Gold.
- **`@flighthq/easing-formats` neighbor (CSS `<easing-function>` parse/serialize)** — `parseCssEasingFunction` / `serializeEasingToCss`. **Parked: gated on a confirmed consumer** and is a _new package_ (subject-triad `-formats` layer). The bedrock test passes its name (a CSS easing string is an honest `-format`, a real codec subject), but the triad plurality/consumer guard says do not build speculatively — spin it up only when serialization / theme / animation-file loading actually needs it. Keeping the string/registry concern out of the tree-shakable core is the correct boundary. Source: review.md › Gaps + Candidate open directions; roadmap Silver/Gold.
- **Performance / determinism gate** — a microbenchmark asserting the fixed curves stay allocation-free and branch-light, plus a committed bit-determinism note for the `createEasingSamples` LUT path (its intended role as a value-typed conformance probe), and a `npm run size` check that importing one curve does not pull combinators/spring. **Parked: needs a bench harness** that does not yet exist, and the determinism note is most useful paired with the Rust conformance pass it feeds. Source: review.md › Gaps; roadmap Gold.

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._

---

### Surfaced to the charter's Open directions

Routed for the user to decide — recorded here, **not** edited into the charter by this pass:

1. **Spring ownership (the structural fork).** Normalized `[0,1]→[0,1]` spring in `easing` + unbounded integrator in `tween`, or springs entirely in tween? Determines `SpringEasingOptions` placement in `@flighthq/types` and the symmetric `flighthq-spring` Rust question.
2. **Rust conformance posture.** Is `flighthq-easing` held to land each TS addition in the same pass (with `BoxedEasing` + the f32/f64 divergence entry), or is easing explicitly TS-leads / Rust-follows-in-batches?
3. **`-formats` boundary.** Bless that a name→curve registry / CSS parse-serialize lives permanently in a `-formats` neighbor (never inside the tree-shakable core), per the triad pattern.
4. **Output-range vocabulary.** `easeScaleOutput` and `easeSmoothstepRange` push past pure `[0,1]→[0,1]` curves into value remapping. Is remap-into-a-target-range in scope for `easing`, or does it belong in `@flighthq/math` (which already owns `remap`/`lerp`)? A boundary ruling avoids overlap.
5. **Promote the `Readonly<EasingFunction>` exception** into the global `Readonly<>` design constraint — `Readonly<>` on a callable type strips its call signature in TS, so easing's combinators correctly use plain `EasingFunction`. A known, documented exception worth recording SDK-wide.

_Seed for removal: this assessment absorbs `reviews/maturation/depth/easing.md`; that roadmap is one-time seed and may be removed once this lands._
