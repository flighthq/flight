# API Alignment: @flighthq/filters-canvas

**Verdict:** Clean and exemplary — three symmetric `apply<Filter>FilterToCanvas` functions that follow the SDK's naming, sentinel, and parameter-order conventions; the only nit is the family-wide habit of typing the read-only `filter` argument as a bare type instead of `Readonly<T>`.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `applyBlurFilterToCanvas`, `applyDropShadowFilterToCanvas`, `applyOuterGlowFilterToCanvas` | The `filter` parameter (`BlurFilter` / `DropShadowFilter` / `OuterGlowFilter`) is read-only in the body (passed to `compute*FilterCss`, never mutated) but typed as a bare object type, not `Readonly<T>`. The map's Design Constraints say to default to `Readonly<>` and opt out only for deliberate mutation. Not specific to this package — the entire `filters-*` family (`filters-surface`, `filters-css`) has the same gap, so treat as a family-wide convention pass rather than a one-package fix. | Type as `filter: Readonly<BlurFilter>` etc.; ideally apply across the filter family in one sweep. (`dest` is legitimately mutated and must stay non-`Readonly`; `source: CanvasImageSource` is a host type drawn from, fine as-is.) |
| Info | package barrel | `filters-canvas` exports only blur, drop-shadow, and outer-glow. `filters-css` (its only data backend) also exposes `getShadowFilterOffset`, and the surface/gl backends additionally cover bevel, color-matrix, convolution, inner-glow/shadow, gradient variants. Per the map's AAA-completeness expectation, the Canvas backend covers a subset of the filter set the rest of the family targets. This is a coverage observation, not an API-convention violation — surface as a completeness suggestion, not a defect. | If a CSS-expressible filter has no Canvas applier (e.g. color-matrix via `filter: ...`), consider adding it; otherwise document why Canvas intentionally covers only the CSS-`filter`-string-expressible subset. |

## Clean

- **Full, unabbreviated type words.** Every name carries the complete filter type and the backend token: `applyBlurFilterToCanvas`, `applyDropShadowFilterToCanvas`, `applyOuterGlowFilterToCanvas`. No abbreviation of `Filter`, the filter family, or `Canvas`.
- **Globally unique, convention-matching names.** The `apply<Type>FilterTo<Backend>` shape matches the entire cross-package family verbatim (`applyBlurFilterToSurface`, `applyBlurFilterToGl`, `applyBlurFilterToWgpu`, and the parallel `apply<Effect>EffectTo<Backend>` set in the effects packages). Verb (`apply`) and the `To<Backend>` suffix are consistent within the package and against every sibling.
- **Parameter-order symmetry.** All three exports share an identical signature `(dest, source, dx, dy, filter)`. Destination-first then source matches the canvas-draw mental model; `filter` (the descriptor) is consistently last, mirroring the surface family's `(...inputs, filter)` ordering.
- **Sentinels, not throws, for expected failure.** Each returns `false` when the filter has no CSS equivalent (anisotropic blur, knockout) — `if (css === null) return false`. No exceptions for the expected "not expressible in this backend" case, exactly per the sentinel rule. No internal-invariant validation.
- **`get*` / `has*` discipline.** No accessors here; the only boolean returns are the apply functions themselves, where `boolean` is a success/applied sentinel, not a getter — appropriately named with the `apply` verb, not `is`/`has`.
- **Allocation discipline.** No `create*`/`clone*`; the functions mutate the caller-supplied `dest` context (correctly not `out`-named since the canvas context is the conventional draw target, not a value `out` buffer) and allocate nothing per call.
- **Imports.** `import type { BlurFilter } from '@flighthq/types'` is on its own `import type` line in every file; cross-package filter types come from `@flighthq/types`, never redefined inline. The value import (`compute*FilterCss` from `@flighthq/filters-css`) is a separate statement.
- **Teardown verbs.** None present — nothing to dispose/destroy; no misuse.
- **Alias-safety.** N/A — no `out`-parameter value functions; the mutated `dest` is `save()`/`restore()`-bracketed, leaving caller state intact.
- **Alphabetized exports** in `index.ts` and across files (`Blur` < `DropShadow` < `OuterGlow`).
