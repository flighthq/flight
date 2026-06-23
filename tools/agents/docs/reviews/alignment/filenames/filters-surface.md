# Filename Alignment: @flighthq/filters-surface

**Verdict:** Clean. This is a backend-variant package (`surface` is the CPU/pixel backend token), and every source file follows the prefix-first convention `surface<FilterObject>.ts` — naming the filter object it operates over, not a bare function. No issues found.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

All 14 source files (`surfaceBevelFilter.ts` … `surfaceSharpenFilter.ts`) prefix the backend token `surface` first, then name the filter object (`BlurFilter`, `DropShadowFilter`, `ColorMatrixFilter`, etc.). Each file owns exactly one filter object's surface implementation, which is the correct domain/object granularity here — the object IS the domain, not a generic function dump. `index.ts` is a thin barrel re-export (its `apply*FilterToSurface` exports map 1:1 to the files), not a dumping ground. No generic names (`data.ts`, `utils.ts`, `helpers.ts`, `math.ts`, `common.ts`) are present. Tests are colocated as `<source>.test.ts`, mirroring source names exactly.

## Clean

- `surfaceBevelFilter.ts` (+ `.test.ts`) — prefix-first backend token, names the `BevelFilter` object.
- `surfaceBlurFilter.ts` (+ `.test.ts`) — names `BlurFilter`.
- `surfaceColorMatrixFilter.ts` (+ `.test.ts`) — names `ColorMatrixFilter`.
- `surfaceConvolutionFilter.ts` (+ `.test.ts`) — names `ConvolutionFilter`.
- `surfaceDisplacementMapFilter.ts` (+ `.test.ts`) — names `DisplacementMapFilter`.
- `surfaceDropShadowFilter.ts` (+ `.test.ts`) — names `DropShadowFilter`.
- `surfaceGradientBevelFilter.ts` (+ `.test.ts`) — names `GradientBevelFilter`.
- `surfaceGradientGlowFilter.ts` (+ `.test.ts`) — names `GradientGlowFilter`.
- `surfaceInnerGlowFilter.ts` (+ `.test.ts`) — names `InnerGlowFilter`.
- `surfaceInnerShadowFilter.ts` (+ `.test.ts`) — names `InnerShadowFilter`.
- `surfaceMedianFilter.ts` (+ `.test.ts`) — names `MedianFilter`.
- `surfaceOuterGlowFilter.ts` (+ `.test.ts`) — names `OuterGlowFilter`.
- `surfacePixelateFilter.ts` (+ `.test.ts`) — names `PixelateFilter`.
- `surfaceSharpenFilter.ts` (+ `.test.ts`) — names `SharpenFilter`.
- `index.ts` — thin barrel of the above; legitimate package entry, not a dumping ground.
