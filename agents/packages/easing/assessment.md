---
package: '@flighthq/easing'
updated: 2026-07-31
basedOn: ./review.md
---

# easing — Assessment

Sorted from the depth review (96/100, authoritative), the builder's landed expansion, and the direction session (2026-07-02). Five decisions blessed. Re-verified against the live tree on 2026-07-31 (22 source files, 20 test files, 152 tests, 48 exports): all three sweep items have landed, so the open work is now only the parked backlog — the spring family (blocked on physics taxonomy), the Rust conformance pass (explicitly batched), and two cross-cutting doc items.

## Recommended

_None open._ All three sweep items landed and were re-verified against live source on 2026-07-31; they are
recorded under [Landed](#landed) below, outside this section so the TODO generator stops reporting them as
work.

## Landed

1. ~~**Tighten the `easeStep` doc-comment's CSS mapping.**~~ Landed, and the item is now obsolete in its
   original terms: there is no `easeStep`. The export is `easeSteps(count, position)`, a full CSS `steps()`
   implementation over a `StepPosition`, so the `t >= threshold ? 1 : 0` behaviour the item described no
   longer exists to document. Its current comment is accurate and goes further than the item asked, naming
   the silent `easeSteps(1, 'jumpNone')` NaN edge and routing it through the guard seam that
   `enableEasingGuards` turns into a warning.

2. ~~**Name `easeSmoothstepRange`'s return type in `@flighthq/types`.**~~ Landed. `ScalarRemap = (x: number)
   => number` lives in `packages/types/src/ScalarRemap.ts` and is exported from both type lanes;
   `easeSmoothstepRange(edge0, edge1): ScalarRemap`.

3. ~~**Refresh the Package Map line for `@flighthq/easing`.**~~ Landed. The catalog entry now reads "timing
   curves: Penner/CSS/shader families, combinators, parametric factories, piecewise splicing, LUT sampling,
   numerical derivative", which carries the surface the old one-liner omitted.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Spring / physics easing family.** _Resolved differently — no longer parked, and no longer easing's._ The
  2026-07-02 shape (a normalized `[0,1]→[0,1]` `easeSpring` inside easing, unbounded integrator in tween) was
  superseded: `@flighthq/spring` now exists as its own package, carrying plain-data damped-harmonic springs
  over a closed-form analytic integrator. Easing exports no `easeSpring` and should not grow one — a spring
  is duration-less and overshoot-capable, which is precisely what a fixed-duration easing curve is not.

- **Spring presets** (`easeGentleSpring`, `easeWobblySpring`, etc.). _Dropped with the item above._ Presets, if
  wanted, belong beside the solver in `@flighthq/spring`, not as easing curves.

- **`@flighthq/easing-formats` neighbor.** _Parked — gated on consumer._ Blessed (Decision #3): CSS `<easing-function>` parse/serialize stays permanently out of the tree-shakable core. Build only when a real consumer appears. Content is thin today (CSS easing strings are the primary format).

- **Rust conformance pass.** _Parked — explicitly batched._ Per Decision #4, TS leads, Rust follows in parity passes. The crate has only ~28 fixed curves; the full factory/combinator/LUT/derivative surface awaits a dedicated Rust pass with `BoxedEasing` + f32/f64 divergence entry.

- **Performance / determinism gate.** _Parked — no harness._ Microbenchmark for allocation-free curves + bit-determinism note for LUT path. Open direction #4.

- **`Readonly<>` callable exception — SDK-wide doc.** _Parked — cross-package doc._ Blessed (Decision #5): `Readonly<>` on callable types strips the call signature. Worth a one-line note in the SDK-wide `Readonly<>` constraint in `index.md`. Doc-only, touches the codebase map.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: tighten easeStep CSS mapping, name easeSmoothstepRange return type in types, refresh Package Map line
