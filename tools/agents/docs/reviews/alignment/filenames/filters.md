# Filename Alignment: @flighthq/filters

**Verdict:** Clean. This is the single-implementation core descriptor package (`@flighthq/filters`, no `-canvas`/`-dom`/`-gl`/`-wgpu` suffix), so plain domain/object names are correct and NO backend prefix applies — the concrete per-backend implementations live in the renderer packages, not here. Every `*Filter.ts` file names the filter object it defines, `blurMath.ts` names a multi-function math domain, and tests mirror their sources.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

All source files are self-describing once the folder is removed; each names the filter descriptor type / domain it owns, matching the exported `*Filter` type and `create*Filter` constructor.

- `bevelFilter.ts` — `BevelFilter` / `createBevelFilter`
- `blurFilter.ts` — `BlurFilter` / `createBlurFilter`
- `blurMath.ts` — blur math domain (`computeBoxBlurPassRadius`, `computeBoxBlurRadius` and internal box-blur helpers); a domain name covering multiple functions, not a single-function file
- `colorMatrixFilter.ts` — `ColorMatrixFilter` / `createColorMatrixFilter`
- `convolutionFilter.ts` — `ConvolutionFilter` / `createConvolutionFilter`
- `displacementMapFilter.ts` — `DisplacementMapFilter` / `createDisplacementMapFilter`
- `dropShadowFilter.ts` — `DropShadowFilter` / `createDropShadowFilter`
- `gradientBevelFilter.ts` — `GradientBevelFilter` / `createGradientBevelFilter`
- `gradientGlowFilter.ts` — `GradientGlowFilter` / `createGradientGlowFilter`
- `innerGlowFilter.ts` — `InnerGlowFilter` / `createInnerGlowFilter`
- `innerShadowFilter.ts` — `InnerShadowFilter` / `createInnerShadowFilter`
- `medianFilter.ts` — `MedianFilter` / `createMedianFilter`
- `outerGlowFilter.ts` — `OuterGlowFilter` / `createOuterGlowFilter`
- `pixelateFilter.ts` — `PixelateFilter` / `createPixelateFilter`
- `sharpenFilter.ts` — `SharpenFilter` / `createSharpenFilter`
- `index.ts` — package barrel (re-exports only; thin, not a dumping ground)

Tests are colocated as `<source>.test.ts` and mirror every source file (15 filter sources + `blurMath`).
