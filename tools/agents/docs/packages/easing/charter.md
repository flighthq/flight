---
package: '@flighthq/easing'
crate: flighthq-easing
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# easing — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/easing` is the timing-curve library of the SDK: the canonical set of normalized interpolation functions `(t: number) => number` over `t ∈ [0,1]`, plus the combinators, parametric factories, and meta-utilities (piecewise splicing, LUT sampling, numerical derivative) that compose those curves. Every export conforms to `EasingFunction` from `@flighthq/types`, so the fixed curves stay allocation-free and the factories are honest `create*`/`*With`-style closure allocators.

It is a pure, value-typed leaf — no scene graph, no runtime objects, no host. It sits _below_ `@flighthq/tween` and `@flighthq/timeline`, which consume its curves; it does not own time, playback, or the animation loop. It also sits beside `@flighthq/math` (which owns `remap`/`lerp`): easing owns the _shape_ of the curve, not general value remapping. Where it ends and a neighbor begins is one of the open questions below (output-range vocabulary, spring ownership, name→curve registries).

## North star (proposed)

- **Curves are branch-free, allocation-free values on the hot path.** A fixed curve is a pure `(t) => number` that allocates nothing and is safe to call every frame for every tween. Allocation is confined to the explicit `create*`/`*With` factories, which honestly return closures.
- **`@flighthq/types`-first.** Every shape — `EasingFunction`, `EasingSegment`, and any future spring/remap type — is defined in the header layer and implemented against, never inlined. The package's API is navigable from the header alone.
- **Canonical and unabbreviated.** The curve set covers the recognized vocabulary (Penner family, CSS primitives, shader staples) under full, self-identifying names (`easeInOutPower`, not `easeInOutExpo`). A developer reaching for a standard easing finds it here under the name they expected.
- **Tree-shakable to the single curve.** One root barrel, `sideEffects: false`, no registry or closed `switch(kind)` in the core — importing one curve never pulls in the family. Registry/codec concerns, if ever needed, live in a neighbor, not the leaf.
- **A clean conformance seam.** The value-typed surface (especially the LUT path) is meant to be the deterministic Rust↔TS conformance probe and a Wasm-mixable leaf candidate.

## Boundaries (proposed)

In scope:

- The normalized `[0,1] → value` curve set: Penner family (In/Out/InOut), CSS primitives (`easeSteps`, `easeCubicBezier`), shader staples (`easeSmoothstep`/`easeSmootherstep`).
- Combinators over `EasingFunction` (`easeClamp`, `easeInvert`, `easeMirror`, `easeReverse`, …).
- Parametric factories (`*With` overshoot/amplitude/period, `easeInPower`, …) and piecewise splicing.
- Curve meta-utilities: LUT sampling (`createEasingSamples`), numerical derivative (`getEasingDerivative`).

Non-goals (proposed — confirm):

- **No time, playback, or animation loop** — those belong to `tween`/`timeline`. Easing is the curve, not the clock.
- **No name→curve registry or CSS parse/serialize in the core** — gated to a `-formats` neighbor on a confirmed consumer (see Open directions).
- **No general value remapping** — `remap`/`lerp` live in `@flighthq/math`; the output-range exports here are a boundary question, not a settled scope claim.
- **No spring/physics easing yet** — deferred pending a cross-package ownership decision (see Open directions).

## Decisions

None blessed yet.

## Open directions

These are the real questions a future agent must not silently answer. Each is a candidate for an explicit direction conversation.

- **Spring / physics easing ownership (structural fork — touches `tween`).** Does `@flighthq/easing` own a _normalized_ `[0,1]→[0,1]` spring (pre-integrated to settle at `t=1`), with `@flighthq/tween` owning the time-unbounded integrator — or do springs live entirely in `tween`? This decides whether `SpringEasingOptions` and presets (`easeGentleSpring`, `solveSpringDuration`) belong under the easing or tween domain in `@flighthq/types`, and has a symmetric Rust placement question (`flighthq-spring`). This is the single largest remaining feature and must be _decided before built_. Cross-package → surfaced, not auto-built.

- **Rust conformance posture (TS-leads-Rust-follows, or lockstep?).** The crate currently exposes only the ~28 fixed-curve `fn(f32)->f32` functions; none of the new factories, combinators, `easePiecewise`, `createEasingSamples`, or `getEasingDerivative` are ported, and there is no `BoxedEasing` closure type, parity-matrix entry, or f32/f64 divergence record. Should each TS addition land in `flighthq-easing` in the same pass, or is easing explicitly a "TS-leads, Rust-follows-in-batches" package? This frames the largest chunk of outstanding work.

- **Does `easing` ever own a name→curve registry or CSS parse/serialize, or is that permanently a `-formats` neighbor?** The tree-shaking argument says neighbor (the subject-triad `-formats` pattern); the charter should bless that boundary explicitly so a future agent does not add a registry into the tree-shakable core. Gated on a confirmed consumer.

- **Output-range vocabulary — easing or `math`?** `easeScaleOutput` and `easeSmoothstepRange` push the package past pure `[0,1]→[0,1]` curves into value remapping, overlapping `@flighthq/math`'s `remap`/`lerp`. Is remap-into-a-target-range in scope for `easing`, or does it belong in `math`? A boundary ruling is needed to avoid overlap.

- **`-formats` (CSS easing parse/serialize) — confirm it stays gated.** No `parseCssEasingFunction`/`serializeEasingToCss` today; the roadmap gates these on a confirmed consumer. Confirm the gate, or name the consumer.

- **Performance / determinism gate.** There is no microbenchmark asserting the fixed curves stay allocation-free, and no committed bit-determinism note for the LUT path (which `createEasingSamples` is meant to serve). Is a bench/determinism gate wanted, and where does the harness live?

- **Contract/docs refinements (reviewer-surfaced, your gate).** (a) `easeSmoothstepRange` returns an anonymous `(x: number) => number` whose domain is `[edge0, edge1]`, not normalized `t` — should it get a named header type (e.g. `ScalarRemap`) so the surface stays navigable from `@flighthq/types`? (b) The `easeStep` doc equates `easeStep(0)`/`easeStep(1)` with CSS `step-start`/`step-end`, which is imprecise against the implementation — tighten or re-spec? (c) `easeSteps(1, 'jumpNone')` divides by zero and yields `NaN` (pre-existing, matches the CSS spec forbidding it) — document the sharp edge, or guard it? (d) Promote the documented `Readonly<EasingFunction>` exception (it strips the call signature in TS) into the global `Readonly<>` constraint as a known exception?
