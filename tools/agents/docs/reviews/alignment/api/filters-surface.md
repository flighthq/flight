# API Alignment: @flighthq/filters-surface

**Verdict:** Strong and highly consistent — one real defect (hidden per-call allocation in the two gradient functions) plus a `Readonly<filter>` gap that is shared with the rest of the filter family.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `applyGradientBevelFilterToSurface`, `applyGradientGlowFilterToSurface` | These `apply*` functions are out-param (write into `out`), yet allocate a scratch `new Uint8ClampedArray(1024)` for the gradient ramp on every call. Every other function in the package keeps scratch space caller-owned (the `blurBuffer` parameter) precisely to avoid hidden per-frame allocation; these two break that convention and hide an allocation in a hot path. | Accept the ramp as a caller-supplied buffer, e.g. add a `rampBuffer: Uint8ClampedArray` parameter (mirroring how `blurBuffer` is threaded), and document its required length (1024). This restores the "allocation is explicit / out-param helpers do not allocate" rule and the package's own scratch-buffer symmetry. |
| Low | All 14 functions (`filter:` param) | The `filter` parameter is declared mutable (`filter: BlurFilter`, `filter: DropShadowFilter`, …) even though it is only read. The map says default to `Readonly<>` on object params and opt out only when mutation is deliberate. `source`/`map` are correctly `Readonly<SurfaceRegion>`, so the `filter` arg is the lone unguarded object param. | Wrap each filter param as `Readonly<BlurFilter>` etc. Note this same drift exists in `filters-css` (`computeBlurFilterCss(filter: BlurFilter)`, etc.), so it is a filter-family convention gap — fix it across the family rather than this package alone. |
| Low | All `apply*` functions | Several docstrings state hard aliasing preconditions (`out` must not alias `source.surface.data`; `blurBuffer` must be distinct from `out`) but the contract is documented, not enforced, and is inconsistent across the set: some say "Safe to pass `source.surface.data` as `out`" (blur, colorMatrix, dropShadow, outerGlow, gradientGlow) while others forbid it (bevel, gradientBevel, convolution, median, displacement, sharpen, innerGlow, innerShadow, pixelate). This is correct per-op behavior, but the split is easy to misuse. | No code change required; the documentation is the right call for thin adapters. Optional: surface the alias rules as a small table in the package so the safe/unsafe split is discoverable rather than per-docstring. |

## Clean

- **Naming is exemplary.** Every export follows `apply<FilterTypeWord>FilterToSurface` with the full, unabbreviated filter type word (`applyDisplacementMapFilterToSurface`, `applyColorMatrixFilterToSurface`, `applyGradientBevelFilterToSurface`). Names are globally self-identifying and unique from the barrel.
- **Out-param convention.** Every function writes into a leading `out: Uint8ClampedArray` (and `blurBuffer` scratch where needed), matching the no-allocation-helper shape — the gradient pair above being the only exception.
- **Parameter-order symmetry.** Consistent `(out, [blurBuffer,] source, [map,] filter)` ordering: out first, scratch second, read-only inputs, descriptor last. The `blurBuffer` slot appears only where a blur pass is needed, and its presence is predictable from the effect.
- **`Readonly<SurfaceRegion>`** correctly applied to `source` and `map` everywhere.
- **Type imports** are clean: `import type { ... } from '@flighthq/types'` on its own line in every file; all cross-package types (`BlurFilter`, `SurfaceRegion`, every `*Filter`) come from `@flighthq/types`, none defined inline.
- **No verb misuse.** No `dispose*`/`destroy*`/`acquire*`/`get*`/`has*`/`is*` in this package; nothing to drift. The single verb `apply*` is used uniformly and reads correctly as "apply a filter descriptor to a surface."
- **No throwing for expected cases.** Functions are pure delegating adapters with `?? default` fallbacks for optional filter fields; no validation-of-unreachable-invariants and no thrown errors.
- **Barrel is a thin re-export** (one `export { ... } from './surface<X>Filter'` per file, alphabetized), consistent with the single-`.`-entry, `sideEffects: false` rule.
- **Alias-safety is delegated and documented.** These are thin wrappers over `@flighthq/surface` ops; the actual buffer-aliasing guarantees live in the delegate and each function's docstring states the relevant precondition.
