---
package: '@flighthq/easing'
updated: 2026-07-31
basedOn: ./review.md
---

# easing — Assessment

> **2026-07-31 correction.** `easeStep` never existed in tracked package source; do not
> execute the recommendation or approval below that assumes it does. `easeSteps` is the
> actual CSS steps API.

Sorted from the depth review (96/100, authoritative), the builder's landed expansion, and the direction session (2026-07-02). Five decisions blessed. The package is near-complete — a full Penner family, CSS/shader curves, combinators, parametric factories, piecewise splicing, LUT sampling, and numerical derivative. The remaining work is small polish (3 items), the spring family (blocked on physics taxonomy), and the Rust conformance pass (explicitly batched).

## Recommended

Sweep-safe: within `@flighthq/easing` and its `@flighthq/types` header entries, no cross-package coordination, no breaking change, no open design decision.

1. **Tighten the `easeStep` doc-comment's CSS mapping.** The comment equates `easeStep(0)` with `step-start` and `easeStep(1)` with `step-end`, but `t >= threshold ? 1 : 0` makes `easeStep(0)` output 1 for all `t ≥ 0` and `easeStep(1)` output 0 until `t = 1`. The behavior is fine; the equivalence claim is imprecise. Reword to describe the actual threshold semantics.

2. **Name `easeSmoothstepRange`'s return type in `@flighthq/types`.** It returns an anonymous `(x: number) => number` whose domain is `[edge0, edge1]`, not a normalized `EasingFunction`. Introduce a named header type (e.g. `ScalarRemap = (x: number) => number`) so every export's shape stays navigable from the header alone.

3. **Refresh the Package Map line for `@flighthq/easing`.** "easing functions for use with tween or any animation system" no longer hints at the combinator / factory / piecewise / LUT / derivative surface. One-line description refresh in `agents/index.md`.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Spring / physics easing family.** _Parked — cross-package design._ Blessed (Decision #1): normalized `[0,1]→[0,1]` spring in easing, unbounded integrator in tween. Implementation blocked on the broader physics taxonomy review (Open direction #1) — simple easing vs arcade physics vs rigid body decomposition needs a future cross-package review before building.

- **Spring presets** (`easeGentleSpring`, `easeWobblySpring`, etc.). _Parked — blocked on spring._ One-liners once `easeSpring` exists.

- **`@flighthq/easing-formats` neighbor.** _Parked — gated on consumer._ Blessed (Decision #3): CSS `<easing-function>` parse/serialize stays permanently out of the tree-shakable core. Build only when a real consumer appears. Content is thin today (CSS easing strings are the primary format).

- **Rust conformance pass.** _Parked — explicitly batched._ Per Decision #4, TS leads, Rust follows in parity passes. The crate has only ~28 fixed curves; the full factory/combinator/LUT/derivative surface awaits a dedicated Rust pass with `BoxedEasing` + f32/f64 divergence entry.

- **Performance / determinism gate.** _Parked — no harness._ Microbenchmark for allocation-free curves + bit-determinism note for LUT path. Open direction #4.

- **`Readonly<>` callable exception — SDK-wide doc.** _Parked — cross-package doc._ Blessed (Decision #5): `Readonly<>` on callable types strips the call signature. Worth a one-line note in the SDK-wide `Readonly<>` constraint in `index.md`. Doc-only, touches the codebase map.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: tighten easeStep CSS mapping, name easeSmoothstepRange return type in types, refresh Package Map line
