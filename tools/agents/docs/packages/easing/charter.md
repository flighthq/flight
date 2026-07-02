---
package: '@flighthq/easing'
crate: flighthq-easing
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# easing — Charter

## What it is

`@flighthq/easing` is the **timing-curve library**: the canonical set of normalized interpolation functions `(t: number) => number` over `t ∈ [0,1]`, plus the combinators, parametric factories, and meta-utilities (piecewise splicing, LUT sampling, numerical derivative, output-range remapping) that compose those curves. Every export conforms to `EasingFunction` from `@flighthq/types`, so the fixed curves stay allocation-free and the factories are honest `create*`/`*With`-style closure allocators.

It is a pure, value-typed leaf — no scene graph, no runtime objects, no host. It sits _below_ `@flighthq/tween` and `@flighthq/timeline`, which consume its curves; it does not own time, playback, or the animation loop. It also sits beside `@flighthq/math` (which owns linear `remap`/`lerp`): easing owns the _shape_ of the curve and curve-shaped remapping, not general linear value remapping.

## North star

1. **Curves are branch-free, allocation-free values on the hot path.** A fixed curve is a pure `(t) => number` that allocates nothing and is safe to call every frame for every tween. Allocation is confined to the explicit `create*`/`*With` factories, which honestly return closures.
2. **`@flighthq/types`-first.** Every shape — `EasingFunction`, `EasingSegment`, and any future spring/remap type — is defined in the header layer and implemented against, never inlined. The package's API is navigable from the header alone.
3. **Canonical and unabbreviated.** The curve set covers the recognized vocabulary (Penner family, CSS primitives, shader staples) under full, self-identifying names. A developer reaching for a standard easing finds it here under the name they expected.
4. **Tree-shakable to the single curve.** One root barrel, `sideEffects: false`, no registry or closed `switch(kind)` in the core — importing one curve never pulls in the family. Registry/codec concerns live in a `-formats` neighbor, never the leaf.
5. **A clean conformance seam.** The value-typed surface (especially the LUT path) is the deterministic Rust↔TS conformance probe and a Wasm-mixable leaf candidate.

## Boundaries

**In scope:**

- The normalized `[0,1] → value` curve set: Penner family (In/Out/InOut × 11), CSS primitives (`easeSteps`, `easeCubicBezier`), shader staples (`easeSmoothstep`/`easeSmootherstep`).
- Combinators over `EasingFunction` (`easeClamp`, `easeInvert`, `easeMirror`, `easeReverse`, `easeClampOutput`, `easeScaleOutput`).
- Parametric factories (`*With` overshoot/amplitude/period, `easeInPower`, …) and piecewise splicing (`easePiecewise`).
- Curve meta-utilities: LUT sampling (`createEasingSamples`), numerical derivative (`getEasingDerivative`).
- Output-range curve remapping (`easeScaleOutput`, `easeSmoothstepRange`) — curve-shaped remapping over easing functions. This is distinct from `math`'s linear `remap`/`lerp`.
- Normalized `[0,1]→[0,1]` spring easing (pre-integrated to settle at t=1) + `solveSpringDuration`. The tween layer owns the time-unbounded physics integrator; the easing layer owns the normalized version.

**Non-goals:**

- No time, playback, or animation loop — those belong to `tween`/`timeline`. Easing is the curve, not the clock.
- No name→curve registry or CSS parse/serialize in the core — permanently gated to a `-formats` neighbor when a consumer appears.
- No general linear value remapping — `remap`/`lerp` live in `@flighthq/math`.
- No time-unbounded physics integration — springs here are normalized `[0,1]` only; the unbounded integrator is `tween`'s.

## Decisions

- **[2026-07-02] Normalized spring easing belongs in easing; unbounded integrator in tween.** A normalized `[0,1]→[0,1]` spring (pre-integrated to settle at t=1) lives here, with `SpringEasingOptions` in `@flighthq/types` under the easing domain. `solveSpringDuration` lives here as a helper so `tween` can drive physically-correct duration. The time-unbounded physics integrator lives in `tween`. This is the Framer Motion split.

  **Why:** A normalized spring IS an easing function — it maps `[0,1]→[0,1]`. The easing layer owns the curve shape; the tween layer owns time and playback. Broader physics taxonomy (simple easing vs arcade physics vs rigid body) is a future cross-package review.

- **[2026-07-02] Output-range combinators stay in easing.** `easeScaleOutput` (curve-shaped output remapping) and `easeSmoothstepRange` (smoothstep over arbitrary input domain) are in scope. They compose with easing functions and are curve-shaped, not linear. `math`'s `remap`/`lerp` is the linear map; easing's combinators are the curve-shaped equivalents. No overlap.

  **Why:** These are combinators over easing functions — they take or produce easing-domain curves. The domain ownership is clean.

- **[2026-07-02] No registry or CSS parse/serialize in the core — `-formats` neighbor, gated.** Name→curve registries and CSS `<easing-function>` parse/serialize stay permanently out of the tree-shakable core. When a consumer appears (scene file loader, CSS theme system), they land in `@flighthq/easing-formats` or fold into a broader animation-formats package. The gate stays until a consumer materializes.

  **Why:** Tree-shaking. Importing one curve must never pull in a registry or parser. The `-formats` pattern is established (particles-formats, spritesheet-formats, path-formats). CSS easing strings are the primary format; the content is thin today.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** `flighthq-easing` is explicitly "TS-leads, Rust-follows-in-batches." Each TS addition does not need a same-pass Rust port. The Rust crate catches up in dedicated conformance passes.

  **Why:** TS is the authoritative specification. The Rust crate conforms to it — parity is a property measured after the fact, not a same-pass obligation.

- **[2026-07-02] `Readonly<>` exception for callable types — SDK-wide rule.** `Readonly<>` on a callable type strips the call signature in TypeScript, making the parameter uncallable. Function values are already immutable references. The rule: apply `Readonly<>` to object types, not callable types (`EasingFunction`, callbacks, handlers). This is a known TS limitation, not a design choice.

  **Why:** `Readonly<EasingFunction>` is uncallable — the TS type system removes the call signature. The `Readonly<>` design constraint targets mutation of object fields, which is inapplicable to function references.

## Open directions

1. **Physics taxonomy review.** The broader physics story — simple easing, arcade physics, rigid body simulation — needs a future cross-package review to determine where each layer lives. The normalized spring decision above settles the easing→tween boundary for springs specifically, but the larger physics decomposition is unsettled.

2. **Package description update.** The current description understates the package. Should reflect the full combinator / factory / piecewise / LUT / derivative surface.

3. **`easeSmoothstepRange` return type.** Returns an anonymous `(x: number) => number` whose domain is `[edge0, edge1]`, not a normalized `t`-domain `EasingFunction`. Whether to introduce a named header type (e.g. `ScalarRemap`) in `@flighthq/types` so the API surface stays navigable from the header alone. Minor.

4. **Performance / determinism gate.** No microbenchmark asserting the fixed curves stay allocation-free, and no committed bit-determinism note for the LUT path. Whether a bench/determinism gate is wanted, and where the harness lives.
