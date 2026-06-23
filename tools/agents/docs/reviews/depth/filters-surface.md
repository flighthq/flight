# Depth Review: @flighthq/filters-surface

**Domain:** CPU (software) pixel-backend for the SDK's bitmap-filter descriptors — the per-backend `apply*FilterToSurface` functions that turn a `@flighthq/filters` data descriptor into actual pixels in a `Uint8ClampedArray`, by orchestrating the kernels in `@flighthq/surface`.

**Verdict:** solid — 78/100

This package is, by design, a thin binding layer, not a self-contained image-processing library. The heavy lifting (Gaussian/box blur, convolution, displacement, median, color matrix, shadow/glow/bevel mask synthesis, gradient ramps) lives in `@flighthq/surface`; the filter parameter contracts live in `@flighthq/filters`. `filters-surface` exists to map descriptor → kernel call. Judged against _its actual scope_ — "is there a surface (CPU) realization for every filter the SDK defines?" — it is nearly complete: all 14 descriptors in `@flighthq/filters` have a 1:1 surface adapter. Judged against "is this an authoritative software image-filter library all on its own," it is not, and is not meant to be.

## Present capabilities

One adapter per filter descriptor, all exported from the root barrel, all in the canonical `apply<Filter>ToSurface(out, [blurBuffer], source, [map], filter)` shape with explicit out-parameters and `Readonly<SurfaceRegion>` inputs:

- Blur: `applyBlurFilterToSurface` (true Gaussian; documents the `boxBlurSurface` escape hatch for the cheap path).
- Color/channel: `applyColorMatrixFilterToSurface` (4×5 matrix), `applyConvolutionFilterToSurface` (arbitrary kernel with bias/divisor/preserveAlpha/matrixX/Y).
- Shadows/glows: `applyDropShadowFilterToSurface`, `applyOuterGlowFilterToSurface`, `applyInnerGlowFilterToSurface`, `applyInnerShadowFilterToSurface`, `applyGradientGlowFilterToSurface`.
- Bevels: `applyBevelFilterToSurface`, `applyGradientBevelFilterToSurface` (both map `bevelType: 'full' → 'both'`).
- Spatial/noise: `applyDisplacementMapFilterToSurface` (component channel selection, fill color, wrap/clamp mode), `applyMedianFilterToSurface`, `applySharpenFilterToSurface` (unsharp mask), `applyPixelateFilterToSurface`.

Good binding hygiene throughout: `quality` is mapped to box-blur passes via `computeBoxBlurRadius` from `@flighthq/filters` (shared math, not re-derived); `color + alpha` are packed into the SDK's `0xRRGGBBAA` convention at the seam; gradient filters build a 1024-byte ramp via `buildSurfaceGradientRamp`. Aliasing contracts are documented per function (which calls may pass `source.surface.data` as `out`, which require a distinct `blurBuffer`). Each source file has a colocated `.test.ts`. `sideEffects: false`, single root entry, dependencies limited to `filters`/`surface`/`types`.

## Gaps vs an authoritative software-filter library

Most "missing" image-processing primitives are deliberately out of scope — they belong in `@flighthq/surface` (the kernel library) or would only become filters if `@flighthq/filters` defined a descriptor for them. Against the bar of _this_ package (a complete CPU realization of the filter set), the real gaps are:

- **Incomplete fidelity, not just coverage (by-omission):** `applyInnerShadowFilterToSurface` explicitly does not apply the descriptor's `angle`/`distance` (the shadow is centered on the boundary; documented in the source comment). That is a genuine correctness gap against the OpenFL `InnerShadowFilter` semantics, where the shadow is offset. This is the one concrete depth defect inside the package's own remit.
- **No composition helpers (by-design, but worth noting):** every shadow/glow/bevel function returns only a _mask_ and pushes compositing back to the caller ("composite `out` onto your destination, then the original on top; omit if knockout/hideObject"). `knockout` and `hideObject` are described in prose but not handled — the caller must branch. An authoritative filter library typically offers the finished composited result (or at least a `compositeFilterResult` helper) so `knockout`/`hideObject`/inner-vs-outer ordering is not re-implemented at every call site. The shadow-offset helper (`getShadowFilterOffset`) is referenced but lives elsewhere.
- **No filter-list / stacking entry point (likely by-design, cross-package):** there is no `applyFilterListToSurface(out, source, filters[])` that walks an array of heterogeneous descriptors, manages intermediate buffers, and applies offsets. Realistic filter usage stacks filters; today the caller dispatches per filter kind and manages buffers/offsets manually. If a unified dispatch belongs anywhere it is plausibly here.
- **Buffer management is fully manual (by-design):** caller must size and supply `blurBuffer`/`out`, know which functions alias-safely accept `source.surface.data`, and which forbid it. Consistent with Flight's explicit-allocation rule, but it raises the floor for correct use and there is no pool/scratch helper to lean on.
- **Convolution-derived named effects** (emboss, edge-detect/Sobel, Laplacian, outline) are absent — but these are correctly a `@flighthq/filters` descriptor decision, not a gap in this binding layer.

## Naming / API-shape notes

- Naming is canonical and self-identifying: `apply<FullFilterName>ToSurface` reads unambiguously, full type words, no abbreviations, alphabetized barrel. This matches the documented `<subject>-<backend>` binding convention exactly and would map cleanly to a Rust `apply_*_filter_to_surface` / `filters-surface` crate.
- Argument order is consistent (`out` first, then the optional scratch `blurBuffer`, then `source`, then descriptor) and the `Readonly<>`/out-param discipline is uniform — strong for a backend layer.
- The asymmetry that some functions take `blurBuffer` and some do not is inherent to the kernels and is well-documented; not a defect.
- Minor: the per-function "to complete the effect, composite X then Y" guidance is repeated across ~7 doc comments. That repetition is a symptom of the missing composition helper noted above rather than a naming issue.

## Recommendation

Treat this as a **solid, near-complete backend binding**, not a standalone library, and judge it on that axis. Two improvements would close the meaningful gaps within its own remit:

1. **Fix inner-shadow fidelity** — apply `angle`/`distance` so `applyInnerShadowFilterToSurface` matches the descriptor contract (this is by-omission and should be added to the task list, per the AAA-completeness rule).
2. **Add the compositing tier** — a `knockout`/`hideObject`-aware finisher (e.g. `compositeFilterResultToSurface`) and ideally an `applyFilterListToSurface` dispatch over an ordered descriptor array with managed scratch buffers. This is where the package would move from "every filter has a kernel call" to "the filter domain is fully realized on the CPU backend." Whether the list-dispatch lives here or in a coordinating package is a cross-package design call worth surfacing rather than deciding unilaterally.

Everything else flagged (extra named convolution effects, more primitives) is correctly upstream in `@flighthq/filters` / `@flighthq/surface` and should not be pulled into this binding layer.
