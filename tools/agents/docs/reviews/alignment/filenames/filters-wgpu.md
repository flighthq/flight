# Filename Alignment: @flighthq/filters-wgpu

**Verdict:** Backend-variant package (`-wgpu`) — every source file must be `wgpu`-prefixed, prefix-first, and named after a domain/object. It is: all 19 implementation files carry the `wgpu` token first and name a filter object, shader domain, or pipeline domain. Fully aligned; nothing to rename.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| _(none)_ | All files are `wgpu`-prefixed, prefix-first, and name a domain/object rather than a single function. `wgpuTestHelper.ts` uses the generic-ish `Helper` suffix, but it is a legitimate test-fixture support module (`makeFilterState`/`makeRenderTarget`/`makeScratch` + mock install) scoped to this backend, and `TestHelper` reads as a real domain. Acceptable; no action. | — |

## Clean

The fourteen per-filter files each name the filter object they implement, prefix-first:

- `wgpuBevelFilter.ts`, `wgpuBlurFilter.ts`, `wgpuColorMatrixFilter.ts`, `wgpuConvolutionFilter.ts`, `wgpuDisplacementMapFilter.ts`, `wgpuDropShadowFilter.ts`, `wgpuGradientBevelFilter.ts`, `wgpuGradientGlowFilter.ts`, `wgpuInnerGlowFilter.ts`, `wgpuInnerShadowFilter.ts`, `wgpuMedianFilter.ts`, `wgpuOuterGlowFilter.ts`, `wgpuPixelateFilter.ts`, `wgpuSharpenFilter.ts`

Shared backend domains, each named after the object/domain it owns (not a single function):

- `wgpuFilterPass.ts` — filter pipeline + pass primitives (`createWgpu*Pipeline`, `drawWgpu*Pass`, `clearWgpuFilterTarget`, shared vertex WGSL).
- `wgpuBlitShader.ts` — blit/offset-blit shader domain.
- `wgpuTintShader.ts` — tint / invert-tint / inner-clip shader domain.
- `wgpuGradientRamp.ts` — gradient-ramp texture object (`create*`/`get*WgpuGradientRampTexture`).
- `wgpuTestHelper.ts` — backend test fixtures (the one no-colocated-test file, correct: it is a helper, not a unit under test).
- `index.ts` — barrel re-export (standard, thin).

Test colocation: every implementation file has a matching `<source>.test.ts` mirroring the source filename; the only file without one is `wgpuTestHelper.ts`, which is expected.

No generic dumping-ground names (`data.ts`, `utils.ts`, `helpers.ts`, `math.ts`, `common.ts`), no suffix-style backend tokens (`blurFilterWgpu.ts`), and no bare unprefixed names (`blurFilter.ts`) — all of which the backend-variant rule would flag.
